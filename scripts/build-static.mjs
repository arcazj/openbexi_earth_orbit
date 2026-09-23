import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';
import { resolveCommitTree } from './check-release-tree.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_MANIFEST_PATH = 'release/static-artifact.json';
const RELEASE_METADATA_PATH = 'release/version.json';
const TRACKED_MANIFEST_PATH = 'json/tracked/TRACKED.manifest.json';
const STATIC_JSON_REVISION_PAIRS = Object.freeze([
  ['json/gp/GP.json', 'json/gp/GP.meta.json', 'GP'],
  ['json/tle/TLE.json', 'json/tle/TLE.meta.json', 'TLE'],
  ['json/launches/launches.json', 'json/launches/launches.meta.json', 'launch'],
  ['json/decayed/decayed.json', 'json/decayed/decayed.meta.json', 'decay']
]);
const TRACKED_CHUNK_BASENAME_PATTERN = /^([a-f0-9]{64})-[a-z0-9-]+\.json$/;
const TRACKED_REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TRACKED_NORAD_ID_PATTERN = /^[1-9][0-9]{0,8}$/;
const TRACKED_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PRODUCER_UTC_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/;
const TRACKED_OBJECT_TYPES = new Set([
  'PAYLOAD',
  'DEBRIS',
  'ROCKET_BODY',
  'MISSION_RELATED',
  'UNKNOWN'
]);
const TRACKED_LIFECYCLE_STATUSES = new Set([
  'ACTIVE', 'INACTIVE', 'UNKNOWN', 'DECAYED', 'ABSENT', 'RETIRED'
]);
const TRACKED_OBSERVATION_STATUSES = new Set([
  'NEW', 'OBSERVED', 'CHANGED', 'ABSENT', 'REAPPEARED'
]);
const TRACKED_MEMBERSHIP_STATUSES = new Set(['PRESENT', 'ABSENT']);
const TRACKED_HISTORICAL_LIFECYCLE_STATUSES = new Set(['DECAYED', 'ABSENT', 'RETIRED']);
const STATIC_RUNTIME_REPLACEMENTS = Object.freeze(new Map([
  ['https://unpkg.com/three@0.184.0/build/three.module.js', './vendor/three/0.184.0/build/three.module.js'],
  ['https://unpkg.com/three@0.184.0/examples/jsm/', './vendor/three/0.184.0/examples/jsm/'],
  ['https://unpkg.com/satellite.js@6.0.2/dist/satellite.min.js', './vendor/satellite.js/6.0.2/satellite.min.js'],
  ['https://raw.githubusercontent.com/arcazj/openbexi_earth_orbit/master/', './']
]));
const FORBIDDEN_TOP_LEVEL = new Set([
  '.git',
  '.github',
  'node_modules',
  'release',
  'scripts',
  'tests',
  'tests_browser',
  'tests_python',
  'validation'
]);
export const REQUIRED_STATIC_RUNTIME_PATHS = Object.freeze([
  'index.html',
  'js/dependencyBootstrap.js',
  'js/domain/orbitalSourceAdapters.js',
  'js/domain/v21Contracts.js',
  'js/orbit/multiFormatPropagationService.js',
  'js/orbit/satelliteMotionInterpolator.js',
  'js/simulationClock.js',
  'js/trackedObjectCatalog.js',
  'json/decayed/decayed.meta.json',
  'json/gp/GP.json',
  'json/gp/GP.meta.json',
  'json/launches/launches.json',
  'json/launches/launches.meta.json',
  'json/tracked/TRACKED.manifest.json',
  'json/tracked/TRACKED.meta.json',
  'json/tle/TLE.json',
  'json/tle/TLE.meta.json',
  'vendor/satellite.js/6.0.2/satellite.es.js',
  'vendor/satellite.js/6.0.2/satellite.min.js',
  'vendor/three/0.184.0/build/three.module.js',
  'vendor/three/0.184.0/examples/jsm/controls/OrbitControls.js'
]);

function decodeStrictUtf8Json(body, label) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const hasBom =
    (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ||
    (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) ||
    (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xfe && bytes[3] === 0xff);
  if (hasBom) throw new Error(`${label} must use BOM-free UTF-8 JSON.`);
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`${label} must use valid UTF-8 JSON.`);
  }
}

function assertFiniteSafeJsonNumbers(source, label) {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"') {
      index += 1;
      while (index < source.length && source[index] !== '"') {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }
    if (source[index] !== '-' && !/[0-9]/.test(source[index])) continue;
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
    if (!match) continue;
    const token = match[0];
    const value = Number(token);
    const integerToken = /^-?(?:0|[1-9]\d*)$/.test(token);
    if (!Number.isFinite(value) || token === '-0' ||
        (integerToken && !Number.isSafeInteger(value))) {
      throw new Error(`${label} contains a non-finite or unsafe JSON number.`);
    }
    index += token.length - 1;
  }
}

function assertNoDuplicateJsonObjectKeys(source, label) {
  let index = 0;
  const fail = message => { throw new Error(`${label} ${message}`); };
  const skipWhitespace = () => {
    while (index < source.length && /\s/.test(source[index])) index += 1;
  };
  const parseString = () => {
    if (source[index] !== '"') fail('is not valid JSON.');
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2;
      } else if (source[index] === '"') {
        index += 1;
        try {
          return JSON.parse(source.slice(start, index));
        } catch {
          fail('is not valid JSON.');
        }
      } else {
        index += 1;
      }
    }
    fail('is not valid JSON.');
  };
  const parseValue = () => {
    skipWhitespace();
    const token = source[index];
    if (token === '{') {
      index += 1;
      const keys = new Set();
      skipWhitespace();
      if (source[index] === '}') {
        index += 1;
        return;
      }
      while (index < source.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) fail(`contains a duplicate JSON object key: ${key}.`);
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ':') fail('is not valid JSON.');
        index += 1;
        parseValue();
        skipWhitespace();
        if (source[index] === '}') {
          index += 1;
          return;
        }
        if (source[index] !== ',') fail('is not valid JSON.');
        index += 1;
      }
      fail('is not valid JSON.');
    }
    if (token === '[') {
      index += 1;
      skipWhitespace();
      if (source[index] === ']') {
        index += 1;
        return;
      }
      while (index < source.length) {
        parseValue();
        skipWhitespace();
        if (source[index] === ']') {
          index += 1;
          return;
        }
        if (source[index] !== ',') fail('is not valid JSON.');
        index += 1;
      }
      fail('is not valid JSON.');
    }
    if (token === '"') {
      parseString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
    if (!number) fail('is not valid JSON.');
    index += number[0].length;
  };
  parseValue();
  skipWhitespace();
  if (index !== source.length) fail('is not valid JSON.');
}

function stringHasOnlyUnicodeScalars(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function assertJsonUnicodeScalars(value, label) {
  if (typeof value === 'string') {
    if (!stringHasOnlyUnicodeScalars(value)) {
      throw new Error(`${label} contains an invalid Unicode scalar string.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => assertJsonUnicodeScalars(item, label));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (!stringHasOnlyUnicodeScalars(key)) {
        throw new Error(`${label} contains an invalid Unicode scalar object key.`);
      }
      assertJsonUnicodeScalars(item, label);
    }
  }
}

function parseValidatedJson(source, label) {
  const payload = JSON.parse(source);
  assertJsonUnicodeScalars(payload, label);
  return payload;
}

function pythonCanonicalFloat(value) {
  const negative = value < 0 || Object.is(value, -0);
  const absolute = Math.abs(value);
  if (absolute === 0) return negative ? '-0.0' : '0.0';
  const rendered = absolute.toString().toLowerCase();
  let digits;
  let exponent;
  if (rendered.includes('e')) {
    const [mantissa, exponentText] = rendered.split('e');
    const decimal = mantissa.indexOf('.');
    const beforeDecimal = decimal < 0 ? mantissa.length : decimal;
    digits = mantissa.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
    exponent = Number(exponentText) + beforeDecimal - 1;
  } else {
    const decimal = rendered.indexOf('.') < 0 ? rendered.length : rendered.indexOf('.');
    const rawDigits = rendered.replace('.', '');
    const firstSignificant = rawDigits.search(/[1-9]/);
    digits = rawDigits.slice(firstSignificant).replace(/0+$/, '');
    exponent = decimal - firstSignificant - 1;
  }
  let result;
  if (exponent >= -4 && exponent < 16) {
    if (exponent < 0) {
      result = `0.${'0'.repeat(-exponent - 1)}${digits}`;
    } else if (digits.length <= exponent + 1) {
      result = `${digits}${'0'.repeat(exponent + 1 - digits.length)}.0`;
    } else {
      result = `${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`;
    }
  } else {
    const mantissa = digits.length === 1 ? digits : `${digits[0]}.${digits.slice(1)}`;
    result = `${mantissa}e${exponent >= 0 ? '+' : '-'}${String(Math.abs(exponent)).padStart(2, '0')}`;
  }
  return negative ? `-${result}` : result;
}

function producerCanonicalJsonSource(source, label) {
  let canonical = '';
  for (let index = 0; index < source.length;) {
    const token = source[index];
    if (/\s/.test(token)) {
      index += 1;
      continue;
    }
    if (token === '"') {
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') index += 2;
        else if (source[index] === '"') {
          index += 1;
          break;
        } else index += 1;
      }
      const raw = source.slice(start, index);
      canonical += JSON.stringify(JSON.parse(raw));
      continue;
    }
    if (token === '-' || /[0-9]/.test(token)) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      if (!match) throw new Error(`${label} contains an invalid JSON number.`);
      const raw = match[0];
      const value = Number(raw);
      const expected = /[.eE]/.test(raw) ? pythonCanonicalFloat(value) : String(value);
      canonical += expected;
      index += raw.length;
      continue;
    }
    canonical += token;
    index += 1;
  }
  return canonical;
}

export function validateStaticJsonRevisionPair(dataPath, metadata, label = 'Static JSON') {
  const body = fs.readFileSync(dataPath);
  const source = decodeStrictUtf8Json(body, `${label} catalog`);
  assertFiniteSafeJsonNumbers(source, `${label} catalog`);
  assertNoDuplicateJsonObjectKeys(source, `${label} catalog`);
  const payload = parseValidatedJson(source, `${label} catalog`);
  const canonicalBody = Buffer.from(
    producerCanonicalJsonSource(source, `${label} catalog`),
    'utf8'
  );
  const revision = `sha256:${crypto.createHash('sha256').update(canonicalBody).digest('hex')}`;
  if (!TRACKED_REVISION_PATTERN.test(revision) ||
      metadata?.catalog_revision !== revision || metadata?.dataset_hash !== revision) {
    throw new Error(`${label} catalog is not bound to its producer-canonical metadata revision.`);
  }
  return revision;
}

function readJson(file, label = 'Static JSON input') {
  const source = decodeStrictUtf8Json(fs.readFileSync(file), label);
  assertFiniteSafeJsonNumbers(source, label);
  assertNoDuplicateJsonObjectKeys(source, label);
  return parseValidatedJson(source, label);
}

function assertCanonicalTrackedJsonIntegers(source, label) {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"') {
      index += 1;
      while (index < source.length && source[index] !== '"') {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }
    if (source[index] !== '-' && !/[0-9]/.test(source[index])) continue;
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
    if (!match) continue;
    const token = match[0];
    if (!/^(?:0|[1-9]\d*)$/.test(token) || !Number.isSafeInteger(Number(token))) {
      throw new Error(`${label} numeric values must use canonical nonnegative safe-integer JSON tokens.`);
    }
    index += token.length - 1;
  }
}

export function readStrictTrackedJson(file, label = 'Tracked catalog JSON') {
  const source = decodeStrictUtf8Json(fs.readFileSync(file), label);
  assertFiniteSafeJsonNumbers(source, label);
  assertCanonicalTrackedJsonIntegers(source, label);
  assertNoDuplicateJsonObjectKeys(source, label);
  return parseValidatedJson(source, label);
}

function jsonValuesMatchExact(left, right) {
  if (left === null || right === null || typeof left !== typeof right) return left === right;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => jsonValuesMatchExact(value, right[index]));
  }
  if (typeof left === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length &&
      leftKeys.every(key => Object.hasOwn(right, key) && jsonValuesMatchExact(left[key], right[key]));
  }
  return left === right;
}

function normalizedRelative(file) {
  return String(file).replaceAll('\\', '/').replace(/^\.\//, '');
}

function isValidProducerUtcTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = PRODUCER_UTC_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [0, 31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth[month] &&
    hour <= 23 && minute <= 59 && second <= 59;
}

function isValidTrackedDate(value) {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = TRACKED_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [0, 31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month];
}

function trackedRecordIsHistorical(record) {
  return TRACKED_HISTORICAL_LIFECYCLE_STATUSES.has(record.lifecycle_status) ||
    record.catalog_membership_status === 'ABSENT' ||
    record.observation_status === 'ABSENT' ||
    record.decay_date !== null;
}

function trackedRecordContractIsValid(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      typeof record.norad_id !== 'string' || !TRACKED_NORAD_ID_PATTERN.test(record.norad_id) ||
      typeof record.lifecycle_status !== 'string' ||
      !TRACKED_LIFECYCLE_STATUSES.has(record.lifecycle_status) ||
      typeof record.observation_status !== 'string' ||
      !TRACKED_OBSERVATION_STATUSES.has(record.observation_status) ||
      typeof record.catalog_membership_status !== 'string' ||
      !TRACKED_MEMBERSHIP_STATUSES.has(record.catalog_membership_status) ||
      !isValidTrackedDate(record.decay_date) ||
      typeof record.has_current_elements !== 'boolean' ||
      typeof record.metadata_only !== 'boolean' ||
      record.metadata_only === record.has_current_elements) {
    return false;
  }
  return !trackedRecordIsHistorical(record) ||
    (record.has_current_elements === false && record.metadata_only === true);
}

function resolveInside(root, relative, label) {
  const normalized = normalizedRelative(relative);
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`${label} must be a repository-relative path: ${relative}`);
  }
  const resolved = path.resolve(root, ...normalized.split('/'));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes its root: ${relative}`);
  }
  return { normalized, resolved };
}

function isForbidden(relative) {
  const normalized = normalizedRelative(relative);
  const segments = normalized.split('/');
  const base = segments.at(-1).toLowerCase();
  return FORBIDDEN_TOP_LEVEL.has(segments[0].toLowerCase())
    || normalized.toLowerCase().startsWith('json/ops/')
    || base === 'roadmap.md'
    || base.startsWith('prompt')
    || base.includes('.bak-')
    || base.endsWith('.tmp')
    || base.endsWith('~');
}

function filesUnder(directory, repositoryRoot = ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Static artifact input cannot be a symbolic link: ${path.relative(repositoryRoot, target)}`);
    }
    if (entry.isDirectory()) files.push(...filesUnder(target, repositoryRoot));
    if (entry.isFile()) files.push(target);
  }
  return files;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readGitBlob(root, oid, relative) {
  const result = spawnSync('git', ['-C', root, 'cat-file', 'blob', oid], {
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error(`Unable to materialize ${relative} from Git blob ${oid}: ${String(result.stderr || result.error || '').trim()}`);
  }
  return result.stdout;
}

function trackedChunkDescriptors(manifest) {
  const current = Array.isArray(manifest?.chunks) ? manifest.chunks : [];
  const history = Array.isArray(manifest?.history_chunks) ? manifest.history_chunks : [];
  const quarantine = manifest?.quarantine && typeof manifest.quarantine === 'object'
    ? [manifest.quarantine]
    : [];
  return { current, history, quarantine, all: [...current, ...history, ...quarantine] };
}

function recomputedTrackedCoverageRevision(manifest) {
  const counts = manifest?.counts;
  const coverage = manifest?.coverage;
  const quarantine = manifest?.quarantine;
  if (!counts || typeof counts !== 'object' || !coverage || typeof coverage !== 'object' ||
      !quarantine || typeof quarantine !== 'object') {
    throw new Error('Tracked static catalog coverage inputs are invalid.');
  }
  const rowAccounting = {};
  for (const key of ['received', 'accepted', 'quarantined', 'duplicates', 'issues']) {
    const value = counts[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Tracked static catalog row accounting is invalid: ${key}.`);
    }
    rowAccounting[key] = value;
  }
  const quarantineCount = quarantine.count;
  if (!Number.isSafeInteger(quarantineCount) || quarantineCount < 0 ||
      rowAccounting.issues !== rowAccounting.quarantined + rowAccounting.duplicates ||
      rowAccounting.issues !== quarantineCount) {
    throw new Error('Tracked static catalog issue accounting does not match quarantine evidence.');
  }
  if (!Object.hasOwn(counts, 'expected') || !Object.hasOwn(counts, 'expected_provider_records')) {
    throw new Error('Tracked static catalog expected coverage evidence is missing.');
  }
  const expected = counts.expected;
  if (expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) {
    throw new Error('Tracked static catalog expected coverage count is invalid.');
  }
  const expectedProviderRecords = counts.expected_provider_records;
  if (expectedProviderRecords !== null) {
    throw new Error('Tracked static catalog expected provider-record count must be null.');
  }
  if (!Object.hasOwn(coverage, 'expected') ||
      !Object.hasOwn(coverage, 'expected_provider_records') ||
      ['received', 'accepted', 'quarantined', 'duplicates']
      .some(key => coverage[key] !== rowAccounting[key]) ||
      coverage.expected !== expected ||
      coverage.expected_provider_records !== expectedProviderRecords ||
      coverage.provider_completeness_claim !== false ||
      typeof coverage.complete_source_snapshot !== 'boolean' ||
      coverage.invariant !== 'received == accepted + quarantined + duplicates') {
    throw new Error('Tracked static catalog coverage and count evidence are inconsistent.');
  }
  const providerInvariant = rowAccounting.received ===
    rowAccounting.accepted + rowAccounting.quarantined + rowAccounting.duplicates;
  const expectedMatchesReceived = expected === null ? null : expected === rowAccounting.received;
  if (coverage.invariant_holds !== providerInvariant ||
      coverage.expected_matches_received !== expectedMatchesReceived ||
      (coverage.complete_source_snapshot === true && expectedMatchesReceived !== true) ||
      manifest?.invariants?.provider_coverage_holds !== providerInvariant) {
    throw new Error('Tracked static catalog coverage invariants are inconsistent.');
  }
  if (!TRACKED_REVISION_PATTERN.test(String(quarantine.sha256 ?? ''))) {
    throw new Error('Tracked static catalog quarantine digest is invalid.');
  }
  const body = Buffer.from(JSON.stringify({
    row_accounting: rowAccounting,
    expected,
    quarantine_sha256: quarantine.sha256
  }), 'utf8');
  return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

function recomputedTrackedCatalogRevision(manifest) {
  const { current, history } = trackedChunkDescriptors(manifest);
  const coverageRevision = manifest?.coverage_revision;
  const computedCoverageRevision = recomputedTrackedCoverageRevision(manifest);
  if (!TRACKED_REVISION_PATTERN.test(String(coverageRevision ?? '')) ||
      coverageRevision !== computedCoverageRevision ||
      ![...current, ...history].every(descriptor => descriptor && typeof descriptor === 'object')) {
    throw new Error('Tracked static catalog revision inputs are invalid.');
  }
  const chunks = [...current, ...history].map(descriptor => {
    if (typeof descriptor.path !== 'string' || !descriptor.path ||
        !TRACKED_REVISION_PATTERN.test(String(descriptor.sha256 ?? ''))) {
      throw new Error('Tracked static catalog descriptor revision inputs are invalid.');
    }
    return { path: descriptor.path, sha256: descriptor.sha256 };
  });
  const body = Buffer.from(JSON.stringify({ chunks, coverage_revision: coverageRevision }), 'utf8');
  return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

function trackedCountSummary(payload, label) {
  const counts = payload?.counts;
  const current = counts?.current;
  const history = counts?.history_total;
  const historical = counts?.historical;
  const absent = counts?.absent;
  const total = counts?.total;
  const propagatable = counts?.propagatable;
  const metadataOnly = counts?.metadata_only;
  const currentPropagatable = counts?.current_propagatable;
  const currentMetadataOnly = counts?.current_metadata_only;
  const values = [current, historical, absent, history, total, propagatable, metadataOnly, currentPropagatable, currentMetadataOnly];
  if (!values.every(value => Number.isSafeInteger(value) && value >= 0) ||
      historical > history || absent > history || total !== current + history || total !== propagatable + metadataOnly ||
      current !== currentPropagatable + currentMetadataOnly) {
    throw new Error(`${label} tracked catalog counts are inconsistent.`);
  }
  return Object.freeze(values);
}

function trackedRowAccountingSummary(payload, label) {
  const counts = payload?.counts;
  const required = ['received', 'accepted', 'quarantined', 'duplicates', 'issues'];
  const optional = ['expected', 'expected_provider_records'];
  if (!counts || typeof counts !== 'object' ||
      [...required, ...optional].some(key => !Object.hasOwn(counts, key))) {
    throw new Error(`${label} tracked row-accounting evidence is missing.`);
  }
  const requiredValues = required.map(key => counts[key]);
  const optionalValues = optional.map(key => counts[key]);
  if (!requiredValues.every(value => Number.isSafeInteger(value) && value >= 0) ||
      !optionalValues.every(value => value === null || (Number.isSafeInteger(value) && value >= 0))) {
    throw new Error(`${label} tracked row-accounting evidence is invalid.`);
  }
  return Object.freeze([...requiredValues, ...optionalValues]);
}

export function validateTrackedStaticCatalog(manifest, addInput, catalogRoot = ROOT) {
  if (!manifest || typeof manifest !== 'object' || !/^2\.3(?:\.|$)/.test(String(manifest.schema_version ?? ''))) {
    throw new Error('Tracked static catalog manifest must use the Version 2.3 schema.');
  }
  if (manifest.provider_completeness_claim !== false) {
    throw new Error('Tracked static catalog must not claim provider-universe completeness.');
  }

  const descriptors = trackedChunkDescriptors(manifest);
  if (descriptors.current.length === 0 || descriptors.all.length === 0) {
    throw new Error('Tracked static catalog manifest must reference current content-addressed chunks.');
  }
  const paths = new Set();
  const descriptorIds = new Set();
  const catalogIds = new Set();
  const observedCounts = {
    current: 0,
    historical: 0,
    absent: 0,
    history_total: 0,
    total: 0,
    propagatable: 0,
    metadata_only: 0,
    current_propagatable: 0,
    current_metadata_only: 0
  };
  const observedObjectTypes = Object.fromEntries([...TRACKED_OBJECT_TYPES].map(value => [value, 0]));
  const observedCurrentObjectTypes = Object.fromEntries([...TRACKED_OBJECT_TYPES].map(value => [value, 0]));
  for (const [index, descriptor] of descriptors.all.entries()) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new Error(`Tracked static catalog descriptor ${index} is invalid.`);
    }
    const rawPath = descriptor.path;
    const relative = normalizedRelative(rawPath ?? '');
    const nameMatch = TRACKED_CHUNK_BASENAME_PATTERN.exec(path.posix.basename(relative));
    const expectedRevision = descriptor.sha256;
    const expectedHash = nameMatch?.[1] ?? '';
    if (typeof rawPath !== 'string' || rawPath !== relative ||
        path.posix.dirname(relative) !== 'json/tracked/chunks' || nameMatch === null ||
        expectedRevision !== `sha256:${expectedHash}`) {
      throw new Error(`Tracked static catalog descriptor is not a local content-addressed chunk: ${relative || '<missing>'}.`);
    }
    const isCurrentDescriptor = descriptors.current.includes(descriptor);
    const isHistoryDescriptor = descriptors.history.includes(descriptor);
    const isQuarantineDescriptor = descriptors.quarantine.includes(descriptor);
    if (isQuarantineDescriptor && !relative.endsWith('-quarantine.json')) {
      throw new Error('Tracked static catalog quarantine descriptor path is invalid.');
    }
    if (isCurrentDescriptor || isHistoryDescriptor) {
      const descriptorId = descriptor.id;
      const expectedScope = isCurrentDescriptor ? 'CURRENT' : 'HISTORICAL';
      if (typeof descriptorId !== 'string' || !descriptorId.trim() || descriptorIds.has(descriptorId)) {
        throw new Error('Tracked static catalog descriptor ids must be nonempty and unique.');
      }
      descriptorIds.add(descriptorId);
      if (descriptor.scope !== expectedScope || !TRACKED_OBJECT_TYPES.has(descriptor.object_type)) {
        throw new Error(`Tracked static catalog descriptor taxonomy is invalid: ${relative}.`);
      }
    }
    if (paths.has(relative)) throw new Error(`Tracked static catalog repeats chunk path: ${relative}.`);
    paths.add(relative);
    addInput(relative);

    if (!Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0 ||
        !Number.isSafeInteger(descriptor.count) || descriptor.count < 0) {
      throw new Error(`Tracked static catalog descriptor count or byte length is invalid: ${relative}.`);
    }

    const { resolved } = resolveInside(catalogRoot, relative, 'Tracked static catalog chunk');
    const body = fs.readFileSync(resolved);
    if (body.length !== descriptor.bytes || sha256(resolved) !== expectedHash) {
      throw new Error(`Tracked static catalog chunk bytes or SHA-256 do not match: ${relative}.`);
    }
    let payload;
    try {
      const source = decodeStrictUtf8Json(body, `Tracked static catalog chunk ${relative}`);
      assertFiniteSafeJsonNumbers(source, `Tracked static catalog chunk ${relative}`);
      assertNoDuplicateJsonObjectKeys(source, `Tracked static catalog chunk ${relative}`);
      payload = parseValidatedJson(source, `Tracked static catalog chunk ${relative}`);
    } catch {
      throw new Error(`Tracked static catalog chunk is not valid JSON: ${relative}.`);
    }
    const records = payload?.records;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !/^2\.3(?:\.|$)/.test(String(payload.schema_version ?? '')) ||
        !Array.isArray(records) || records.length !== descriptor.count) {
      throw new Error(`Tracked static catalog chunk record count does not match: ${relative}.`);
    }
    if (isCurrentDescriptor || isHistoryDescriptor) {
      const expectedScope = isCurrentDescriptor ? 'CURRENT' : 'HISTORICAL';
      const expectedType = String(descriptor.object_type ?? '');
      if (payload?.scope !== expectedScope || !expectedType || payload?.object_type !== expectedType) {
        throw new Error(`Tracked static catalog chunk taxonomy does not match its descriptor: ${relative}.`);
      }
      for (const record of records) {
        const noradId = record?.norad_id;
        const validRecord = trackedRecordContractIsValid(record);
        const recordIsCurrent = validRecord && !trackedRecordIsHistorical(record);
        if (!validRecord || catalogIds.has(noradId) ||
            record?.object_type !== expectedType ||
            recordIsCurrent !== isCurrentDescriptor) {
          throw new Error(`Tracked static catalog record violates identity, type, or scope partition: ${relative}.`);
        }
        catalogIds.add(noradId);
        observedCounts.total += 1;
        observedCounts.historical += Number(record.decay_date !== null);
        observedCounts.absent += Number(record.catalog_membership_status === 'ABSENT');
        observedCounts.propagatable += Number(record.has_current_elements);
        observedCounts.metadata_only += Number(record.metadata_only);
        observedObjectTypes[expectedType] += 1;
        if (recordIsCurrent) {
          observedCounts.current += 1;
          observedCounts.current_propagatable += Number(record.has_current_elements);
          observedCounts.current_metadata_only += Number(record.metadata_only);
          observedCurrentObjectTypes[expectedType] += 1;
        } else {
          observedCounts.history_total += 1;
        }
      }
    }
  }

  const recomputedRevision = recomputedTrackedCatalogRevision(manifest);
  const recomputedCoverageRevision = recomputedTrackedCoverageRevision(manifest);
  if (manifest.coverage_revision !== recomputedCoverageRevision) {
    throw new Error('Tracked static catalog coverage_revision does not match its evidence.');
  }
  if (manifest.catalog_revision !== recomputedRevision) {
    throw new Error('Tracked static catalog catalog_revision does not match its descriptor closure.');
  }

  if (Object.entries(observedCounts).some(([key, value]) => manifest.counts?.[key] !== value) ||
      !jsonValuesMatchExact(manifest.counts?.object_types, observedObjectTypes) ||
      !jsonValuesMatchExact(manifest.counts?.current_object_types, observedCurrentObjectTypes)) {
    throw new Error('Tracked static catalog manifest counts do not match its referenced chunks.');
  }
  trackedCountSummary(manifest, 'Manifest');
  if (manifest.invariants?.provider_coverage_holds !== true ||
      manifest.invariants?.catalog_partition_holds !== true ||
      manifest.invariants?.current_chunk_count_holds !== true ||
      manifest.invariants?.history_chunk_count_holds !== true) {
    throw new Error('Tracked static catalog manifest invariants are not satisfied.');
  }
  return Object.freeze({
    paths: Object.freeze([...paths]),
    currentCount: observedCounts.current,
    historyCount: observedCounts.history_total
  });
}

export function validateTrackedStaticLineage({
  trackedManifest,
  trackedMetadata,
  gpMetadata,
  gpCatalogPath
}) {
  const gpCatalogRevision = String(gpMetadata?.catalog_revision ?? '');
  const gpDatasetHash = String(gpMetadata?.dataset_hash ?? '');
  const trackedManifestGpRevision = String(trackedManifest?.provenance?.gp_revision ?? '');
  const trackedMetadataGpRevision = String(trackedMetadata?.source_gp_revision ?? '');
  const trackedManifestGpGroups = trackedManifest?.provenance?.gp_source_groups;
  const trackedMetadataGpGroups = trackedMetadata?.source_gp_groups;
  const gpCatalogGroups = gpMetadata?.catalog_source_groups;
  const trackedManifestSatcatRevision = String(trackedManifest?.provenance?.satcat_revision ?? '');
  const trackedMetadataSatcatRevision = String(trackedMetadata?.source_satcat_revision ?? '');
  const trackedRevision = String(trackedManifest?.catalog_revision ?? '');
  const trackedMetadataRevision = String(trackedMetadata?.catalog_revision ?? '');
  const trackedMetadataHash = String(trackedMetadata?.dataset_hash ?? '');
  const trackedCoverageRevision = String(trackedManifest?.coverage_revision ?? '');
  const trackedMetadataCoverageRevision = String(trackedMetadata?.coverage_revision ?? '');
  const recomputedTrackedRevision = recomputedTrackedCatalogRevision(trackedManifest);

  if (trackedRevision !== recomputedTrackedRevision ||
      trackedMetadataRevision !== recomputedTrackedRevision ||
      trackedMetadataHash !== recomputedTrackedRevision) {
    throw new Error('Tracked static catalog manifest and metadata revisions are inconsistent.');
  }
  if (!TRACKED_REVISION_PATTERN.test(trackedCoverageRevision) ||
      trackedMetadataCoverageRevision !== trackedCoverageRevision ||
      !jsonValuesMatchExact(trackedMetadata?.coverage, trackedManifest?.coverage)) {
    throw new Error('Tracked static catalog manifest and metadata coverage revisions are inconsistent.');
  }
  const completeSnapshot = trackedManifest?.coverage?.complete_source_snapshot;
  if (completeSnapshot === true) {
    const lastReconciledAt = trackedMetadata?.last_reconciled_at;
    if (trackedMetadata?.source_status !== 'VERIFIED_SNAPSHOT' ||
        trackedMetadata?.last_reconciled_catalog_revision !== recomputedTrackedRevision ||
        !isValidProducerUtcTimestamp(lastReconciledAt)) {
      throw new Error('Tracked static complete-snapshot claim is not backed by reconciled metadata.');
    }
  } else if (completeSnapshot === false) {
    if (trackedMetadata?.source_status !== 'PARTIAL') {
      throw new Error('Tracked static partial snapshot is not identified as PARTIAL in metadata.');
    }
  } else {
    throw new Error('Tracked static complete-snapshot evidence is invalid.');
  }
  if (JSON.stringify(trackedCountSummary(trackedManifest, 'Manifest')) !==
      JSON.stringify(trackedCountSummary(trackedMetadata, 'Metadata'))) {
    throw new Error('Tracked static catalog manifest and metadata counts are inconsistent.');
  }
  if (JSON.stringify(trackedRowAccountingSummary(trackedManifest, 'Manifest')) !==
      JSON.stringify(trackedRowAccountingSummary(trackedMetadata, 'Metadata'))) {
    throw new Error('Tracked static catalog manifest and metadata row accounting are inconsistent.');
  }
  for (const key of ['object_types', 'current_object_types']) {
    const manifestMap = trackedManifest?.counts?.[key];
    const metadataMap = trackedMetadata?.counts?.[key];
    if (!manifestMap || typeof manifestMap !== 'object' || Array.isArray(manifestMap) ||
        new Set(Object.keys(manifestMap)).size !== TRACKED_OBJECT_TYPES.size ||
        [...TRACKED_OBJECT_TYPES].some(type =>
          !Object.hasOwn(manifestMap, type) || !Number.isSafeInteger(manifestMap[type]) || manifestMap[type] < 0) ||
        !jsonValuesMatchExact(manifestMap, metadataMap)) {
      throw new Error('Tracked static catalog manifest and metadata object-type counts are inconsistent.');
    }
  }

  let verifiedGpRevision;
  try {
    verifiedGpRevision = validateStaticJsonRevisionPair(gpCatalogPath, gpMetadata, 'GP');
  } catch {
    throw new Error('Packaged GP catalog bytes and metadata revisions do not match.');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(gpCatalogRevision) ||
      gpDatasetHash !== gpCatalogRevision || verifiedGpRevision !== gpCatalogRevision) {
    throw new Error('Packaged GP catalog bytes and metadata revisions do not match.');
  }
  if (trackedManifestGpRevision !== gpCatalogRevision ||
      trackedMetadataGpRevision !== gpCatalogRevision) {
    throw new Error('Tracked static catalog GP lineage does not match the packaged GP snapshot.');
  }
  if (!Array.isArray(trackedManifestGpGroups) ||
      !Array.isArray(trackedMetadataGpGroups) ||
      !Array.isArray(gpCatalogGroups) ||
      JSON.stringify(trackedManifestGpGroups) !== JSON.stringify(trackedMetadataGpGroups) ||
      JSON.stringify(trackedManifestGpGroups) !== JSON.stringify(gpCatalogGroups)) {
    throw new Error('Tracked static catalog GP source-group lineage does not match the packaged GP metadata.');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(trackedManifestSatcatRevision) ||
      trackedMetadataSatcatRevision !== trackedManifestSatcatRevision) {
    throw new Error('Tracked static catalog SATCAT lineage does not match its metadata.');
  }
}

function createCommitSourceSnapshot(repositoryRoot, treeish, includeOptional) {
  const selected = resolveCommitTree({ root: repositoryRoot, treeish });
  const entries = new Map(selected.files.map(entry => [entry.path, entry]));
  const controls = new Set([SOURCE_MANIFEST_PATH, RELEASE_METADATA_PATH]);
  const outputs = new Set();
  const treeRoots = new Set();

  const entryFor = (relative, label) => {
    const { normalized } = resolveInside(repositoryRoot, relative, label);
    const entry = entries.get(normalized);
    if (!entry || (entry.mode !== '100644' && entry.mode !== '100755')) {
      throw new Error(`${label} is not a regular blob in commit ${selected.resolvedCommitOid}: ${normalized}.`);
    }
    return entry;
  };
  const jsonFor = (relative, label) => {
    const entry = entryFor(relative, label);
    try {
      return JSON.parse(readGitBlob(repositoryRoot, entry.oid, entry.path).toString('utf8'));
    } catch (error) {
      throw new Error(`${label} is not valid JSON in commit ${selected.resolvedCommitOid}: ${error.message}`);
    }
  };
  const addOutput = relative => {
    const { normalized } = resolveInside(repositoryRoot, relative, 'Static artifact input');
    if (isForbidden(normalized)) throw new Error(`Static artifact manifest includes forbidden content: ${normalized}`);
    entryFor(normalized, 'Static artifact input');
    outputs.add(normalized);
  };

  const manifest = jsonFor(SOURCE_MANIFEST_PATH, 'Static artifact manifest');
  jsonFor(RELEASE_METADATA_PATH, 'Release metadata');
  for (const relative of manifest.files || []) addOutput(relative);
  if (includeOptional) {
    for (const relative of manifest.optionalFiles || []) {
      const { normalized } = resolveInside(repositoryRoot, relative, 'Optional static artifact input');
      if (entries.has(normalized)) addOutput(normalized);
    }
  }
  for (const tree of manifest.trees || []) {
    const { normalized: treePath } = resolveInside(repositoryRoot, tree.path, 'Static artifact tree');
    const prefix = `${treePath}/`;
    const descendants = selected.files.filter(entry => entry.path.startsWith(prefix));
    if (descendants.length === 0) throw new Error(`Static artifact tree is missing from the selected commit: ${treePath}`);
    treeRoots.add(treePath);
    const extensions = new Set((tree.extensions || []).map(value => String(value).toLowerCase()));
    const excluded = new Set((tree.exclude || []).map(normalizedRelative));
    for (const entry of descendants) {
      const relativeToTree = entry.path.slice(prefix.length);
      if (extensions.has(path.posix.extname(entry.path).toLowerCase()) && !excluded.has(relativeToTree)) {
        addOutput(entry.path);
      }
    }
  }
  for (const vendorManifestPath of manifest.vendorManifests || []) {
    const { normalized } = resolveInside(repositoryRoot, vendorManifestPath, 'Vendor manifest');
    controls.add(normalized);
    const vendorManifest = jsonFor(normalized, 'Vendor manifest');
    const vendorRoot = path.posix.dirname(normalized);
    for (const relative of Object.keys(vendorManifest.files || {}).sort()) {
      addOutput(path.posix.join(vendorRoot, normalizedRelative(relative)));
    }
  }
  if (outputs.has(TRACKED_MANIFEST_PATH)) {
    const trackedManifest = jsonFor(TRACKED_MANIFEST_PATH, 'Tracked static catalog manifest');
    for (const descriptor of trackedChunkDescriptors(trackedManifest).all) {
      if (typeof descriptor?.path === 'string' && descriptor.path) addOutput(descriptor.path);
    }
  }

  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbexi-static-commit-'));
  try {
    for (const treeRoot of treeRoots) fs.mkdirSync(path.join(snapshotRoot, ...treeRoot.split('/')), { recursive: true });
    for (const relative of [...controls, ...outputs].sort()) {
      const entry = entryFor(relative, 'Static commit snapshot input');
      const target = path.join(snapshotRoot, ...relative.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, readGitBlob(repositoryRoot, entry.oid, relative));
    }
  } catch (error) {
    fs.rmSync(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
  return Object.freeze({
    root: snapshotRoot,
    outputs: Object.freeze([...outputs].sort()),
    resolvedCommitOid: selected.resolvedCommitOid,
    sourceId: selected.sourceId
  });
}

function collectInputs(manifest, { includeOptional = true, root = ROOT } = {}) {
  const inputs = new Map();
  const add = relative => {
    const { normalized, resolved } = resolveInside(root, relative, 'Static artifact input');
    if (isForbidden(normalized)) throw new Error(`Static artifact manifest includes forbidden content: ${normalized}`);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`Static artifact input is missing: ${normalized}`);
    }
    const real = fs.realpathSync(resolved);
    if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Static artifact input resolves outside the repository: ${normalized}`);
    }
    inputs.set(normalized, resolved);
  };

  for (const file of manifest.files || []) add(file);
  if (includeOptional) {
    for (const file of manifest.optionalFiles || []) {
      const { resolved } = resolveInside(root, file, 'Optional static artifact input');
      if (fs.existsSync(resolved)) add(file);
    }
  }

  for (const tree of manifest.trees || []) {
    const { normalized: treePath, resolved: treeRoot } = resolveInside(root, tree.path, 'Static artifact tree');
    if (isForbidden(`${treePath}/placeholder`)) throw new Error(`Static artifact tree is forbidden: ${treePath}`);
    if (!fs.existsSync(treeRoot) || !fs.statSync(treeRoot).isDirectory()) {
      throw new Error(`Static artifact tree is missing: ${treePath}`);
    }
    const extensions = new Set((tree.extensions || []).map(value => String(value).toLowerCase()));
    const excluded = new Set((tree.exclude || []).map(normalizedRelative));
    for (const file of filesUnder(treeRoot, root)) {
      const relativeToTree = normalizedRelative(path.relative(treeRoot, file));
      if (extensions.has(path.extname(file).toLowerCase()) && !excluded.has(relativeToTree)) {
        add(path.relative(root, file));
      }
    }
  }

  for (const vendorManifestPath of manifest.vendorManifests || []) {
    const { normalized, resolved } = resolveInside(root, vendorManifestPath, 'Vendor manifest');
    if (!fs.existsSync(resolved)) throw new Error(`Vendor manifest is missing: ${normalized}`);
    const vendorManifest = readJson(resolved);
    const vendorRoot = path.dirname(resolved);
    for (const relative of Object.keys(vendorManifest.files || {}).sort()) {
      const vendorFile = path.resolve(vendorRoot, ...normalizedRelative(relative).split('/'));
      add(path.relative(root, vendorFile));
    }
  }

  for (const [dataRelative, metadataRelative, label] of STATIC_JSON_REVISION_PAIRS) {
    const dataPath = inputs.get(dataRelative);
    const metadataPath = inputs.get(metadataRelative);
    if (!dataPath && !metadataPath) continue;
    if (!dataPath || !metadataPath) {
      throw new Error(`${label} static catalog revision pair is incomplete.`);
    }
    validateStaticJsonRevisionPair(dataPath, readJson(metadataPath), label);
  }

  if (inputs.has(TRACKED_MANIFEST_PATH)) {
    const trackedManifest = readStrictTrackedJson(
      inputs.get(TRACKED_MANIFEST_PATH),
      'Tracked static catalog manifest'
    );
    const trackedMetadataPath = inputs.get('json/tracked/TRACKED.meta.json');
    if (!trackedMetadataPath) throw new Error('Tracked static catalog provenance metadata is missing.');
    const trackedMetadata = readStrictTrackedJson(
      trackedMetadataPath,
      'Tracked static catalog metadata'
    );
    if (!trackedManifest.catalog_revision || trackedMetadata.catalog_revision !== trackedManifest.catalog_revision) {
      throw new Error('Tracked static catalog manifest and metadata revisions do not match.');
    }
    const gpCatalogPath = inputs.get('json/gp/GP.json');
    const gpMetadataPath = inputs.get('json/gp/GP.meta.json');
    if (!gpCatalogPath || !gpMetadataPath) {
      throw new Error('Tracked static catalog requires the packaged GP snapshot and metadata.');
    }
    validateTrackedStaticLineage({
      trackedManifest,
      trackedMetadata,
      gpMetadata: readJson(gpMetadataPath),
      gpCatalogPath
    });
    validateTrackedStaticCatalog(trackedManifest, add, root);
  }

  return [...inputs.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function assertRequiredStaticRuntimePaths(paths, requiredPaths = REQUIRED_STATIC_RUNTIME_PATHS) {
  const available = new Set([...paths].map(normalizedRelative));
  const missing = requiredPaths.filter(relative => !available.has(relative));
  if (missing.length > 0) {
    throw new Error(`Static artifact is missing required packaged runtime files: ${missing.join(', ')}.`);
  }
}

export function buildStaticArtifact({
  includeOptional = true,
  releaseTree = null,
  requiredRuntimePaths = REQUIRED_STATIC_RUNTIME_PATHS,
  root = ROOT,
  beforeMaterialize = null
} = {}) {
  const repositoryRoot = path.resolve(root);
  const snapshot = releaseTree ? createCommitSourceSnapshot(repositoryRoot, releaseTree, includeOptional) : null;
  const sourceRoot = snapshot?.root ?? repositoryRoot;
  try {
  const sourceManifest = resolveInside(sourceRoot, SOURCE_MANIFEST_PATH, 'Static artifact manifest').resolved;
  const releaseMetadata = resolveInside(sourceRoot, RELEASE_METADATA_PATH, 'Release metadata').resolved;
  const manifest = readJson(sourceManifest);
  const release = readJson(releaseMetadata);
  if (manifest.schemaVersion !== 1) throw new Error('Static artifact manifest schemaVersion must be 1.');
  const { normalized: outputName, resolved: outputRoot } = resolveInside(repositoryRoot, manifest.outputDirectory, 'Output directory');
  const expectedOutput = path.join(repositoryRoot, 'dist');
  if (outputRoot !== expectedOutput || path.dirname(outputRoot) !== repositoryRoot) {
    throw new Error(`Static artifact output must resolve exactly to ${expectedOutput}.`);
  }

  const inputs = collectInputs(manifest, { includeOptional, root: sourceRoot });
  assertRequiredStaticRuntimePaths(inputs.map(([relative]) => relative), requiredRuntimePaths);
  if (!inputs.some(([relative]) => relative === manifest.entrypoint)) {
    throw new Error(`Static artifact entrypoint is not included: ${manifest.entrypoint}`);
  }
  if (snapshot && JSON.stringify(inputs.map(([relative]) => relative)) !== JSON.stringify(snapshot.outputs)) {
    throw new Error('Strict static input selection differs from the immutable commit snapshot closure.');
  }

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  try {
    if (beforeMaterialize) {
      if (!snapshot || typeof beforeMaterialize !== 'function') {
        throw new Error('beforeMaterialize is available only to strict commit-tree builds.');
      }
      beforeMaterialize();
    }
    for (const [relative, source] of inputs) {
      if (path.extname(relative).toLowerCase() === '.json') {
        readJson(source, `Static JSON input ${relative}`);
      }
      const target = path.join(outputRoot, ...relative.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  } catch (error) {
    fs.rmSync(outputRoot, { recursive: true, force: true });
    throw error;
  }
  const staticIndex = path.join(outputRoot, manifest.entrypoint);
  const serverCapableMarker = '<meta name="openbexi-deployment-mode" content="server-capable">';
  const staticMarker = '<meta name="openbexi-deployment-mode" content="static">';
  const sourceDependencyMarker = '<meta name="openbexi-dependency-policy" content="packaged-first-with-cdn-fallback">';
  const packagedDependencyMarker = '<meta name="openbexi-dependency-policy" content="packaged-only">';
  const indexSource = fs.readFileSync(staticIndex, 'utf8');
  if (!indexSource.includes(serverCapableMarker)) {
    throw new Error('Static artifact entrypoint is missing the deployment-mode marker.');
  }
  if (!indexSource.includes(sourceDependencyMarker)) {
    throw new Error('Static artifact entrypoint is missing the source dependency-policy marker.');
  }
  fs.writeFileSync(
    staticIndex,
    indexSource
      .replace(serverCapableMarker, staticMarker),
    'utf8'
  );
  for (const runtimeFile of filesUnder(outputRoot, repositoryRoot).filter(file => /\.(?:html|js|mjs)$/i.test(file))) {
    let source = fs.readFileSync(runtimeFile, 'utf8');
    source = source.replaceAll(sourceDependencyMarker, packagedDependencyMarker);
    for (const [remote, packaged] of STATIC_RUNTIME_REPLACEMENTS) source = source.replaceAll(remote, packaged);
    fs.writeFileSync(runtimeFile, source, 'utf8');
  }
  fs.writeFileSync(path.join(outputRoot, '.nojekyll'), '', 'utf8');

  const builtFiles = filesUnder(outputRoot, repositoryRoot)
    .map(file => normalizedRelative(path.relative(outputRoot, file)))
    .filter(relative => relative !== 'asset-manifest.json')
    .sort();
  for (const relative of builtFiles) {
    if (isForbidden(relative)) throw new Error(`Built static artifact contains forbidden content: ${relative}`);
  }

  const files = builtFiles.map(relative => {
    const file = path.join(outputRoot, ...relative.split('/'));
    return {
      path: relative,
      bytes: fs.statSync(file).size,
      sha256: sha256(file)
    };
  });
  const artifactManifest = {
    schemaVersion: 1,
    application: 'openbexi_orbit',
    version: release.version,
    entrypoint: manifest.entrypoint,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files
  };
  fs.writeFileSync(
    path.join(outputRoot, 'asset-manifest.json'),
    `${JSON.stringify(artifactManifest, null, 2)}\n`,
    'utf8'
  );
  console.log(`Built ${outputName}: ${artifactManifest.fileCount} files, ${artifactManifest.totalBytes} bytes.`);
  return Object.freeze({
    outputRoot,
    artifactManifest,
    sourceCommit: snapshot?.resolvedCommitOid ?? null,
    sourceTree: snapshot?.sourceId ?? null
  });
  } finally {
    if (snapshot) fs.rmSync(snapshot.root, { recursive: true, force: true });
  }
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedFile === import.meta.url) {
  try {
    const argumentsList = process.argv.slice(2);
    let releaseTree = null;
    for (let index = 0; index < argumentsList.length; index += 1) {
      const argument = argumentsList[index];
      if (argument === '--release-tree') {
        releaseTree = argumentsList[++index];
        if (!releaseTree) throw new Error('--release-tree requires a Git tree-ish.');
      } else {
        throw new Error(`Unknown argument: ${argument}`);
      }
    }
    buildStaticArtifact({ releaseTree });
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
