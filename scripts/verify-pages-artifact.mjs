import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readArtifactManifest, verifyLocalArtifact } from './attest-static-deployment.mjs';

const TAR_BLOCK_BYTES = 512;
const METADATA_LIMIT_BYTES = 1024 * 1024;

function decodeTarString(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end < 0 ? field.length : end).toString('utf8');
}

function parseTarNumber(buffer, label) {
  if ((buffer[0] & 0x80) !== 0) throw new Error(`Pages archive uses unsupported base-256 ${label}.`);
  const value = buffer.toString('ascii').replaceAll('\0', '').trim();
  if (!value) return 0;
  if (!/^[0-7]+$/.test(value)) throw new Error(`Pages archive has invalid ${label}.`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Pages archive ${label} is out of range.`);
  return parsed;
}

function verifyTarChecksum(header) {
  const expected = parseTarNumber(header.subarray(148, 156), 'header checksum');
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : header[index];
  }
  if (actual !== expected) throw new Error('Pages archive contains a header with an invalid checksum.');
}

function normalizeTarPath(value, { directory = false } = {}) {
  let normalized = String(value ?? '');
  if (normalized.includes('\\') || /[\0\r\n]/.test(normalized) || normalized.startsWith('/')) {
    throw new Error(`Pages archive contains an unsafe path: ${value}.`);
  }
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (directory) normalized = normalized.replace(/\/+$/, '');
  if (!normalized || normalized === '.') {
    if (directory) return null;
    throw new Error('Pages archive contains an empty file path.');
  }
  const segments = normalized.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Pages archive contains an unsafe path: ${value}.`);
  }
  return normalized;
}

function parsePax(payload) {
  const values = new Map();
  let cursor = 0;
  while (cursor < payload.length) {
    const separator = payload.indexOf(0x20, cursor);
    if (separator < 0) throw new Error('Pages archive contains malformed PAX metadata.');
    const length = Number(payload.subarray(cursor, separator).toString('ascii'));
    if (!Number.isInteger(length) || length <= separator - cursor + 2 || cursor + length > payload.length ||
        payload[cursor + length - 1] !== 0x0a) {
      throw new Error('Pages archive contains malformed PAX metadata.');
    }
    const record = payload.subarray(separator + 1, cursor + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals <= 0) throw new Error('Pages archive contains malformed PAX metadata.');
    values.set(record.slice(0, equals), record.slice(equals + 1));
    cursor += length;
  }
  return values;
}

function expectedDirectories(paths) {
  const directories = new Set();
  for (const relative of paths) {
    const segments = relative.split('/');
    segments.pop();
    let current = '';
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      directories.add(current);
    }
  }
  return directories;
}

function inspectAndExtractTar(archivePath, extractRoot, expectedPaths) {
  const archive = path.resolve(archivePath);
  const root = path.resolve(extractRoot);
  const stat = fs.statSync(archive);
  if (!stat.isFile() || stat.size < TAR_BLOCK_BYTES * 2 || stat.size % TAR_BLOCK_BYTES !== 0) {
    throw new Error('Pages archive must be a non-empty block-aligned regular tar file.');
  }
  if (fs.existsSync(root)) throw new Error('Pages archive extraction root must not already exist.');
  fs.mkdirSync(root, { recursive: true });

  const expectedDirs = expectedDirectories(expectedPaths);
  const seenFiles = new Set();
  const seenDirectories = new Set();
  const digest = crypto.createHash('sha256');
  const fd = fs.openSync(archive, 'r');
  let offset = 0;
  let metadataEntries = 0;
  let pendingLongPath = null;
  let pendingPax = null;

  const readNext = length => {
    const buffer = Buffer.alloc(length);
    let cursor = 0;
    while (cursor < length) {
      const count = fs.readSync(fd, buffer, cursor, length - cursor, offset + cursor);
      if (count === 0) throw new Error('Pages archive ended before its declared entry size.');
      cursor += count;
    }
    offset += length;
    digest.update(buffer);
    return buffer;
  };
  const readPayload = size => {
    if (size > METADATA_LIMIT_BYTES) throw new Error('Pages archive metadata entry is too large.');
    return readNext(size);
  };
  const consumePadding = size => {
    const padding = (TAR_BLOCK_BYTES - (size % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES;
    if (padding > 0 && readNext(padding).some(byte => byte !== 0)) {
      throw new Error('Pages archive entry padding is not zero-filled.');
    }
  };

  try {
    let endBlocks = 0;
    while (offset < stat.size) {
      const header = readNext(TAR_BLOCK_BYTES);
      if (header.every(byte => byte === 0)) {
        endBlocks += 1;
        while (offset < stat.size) {
          const trailing = readNext(Math.min(TAR_BLOCK_BYTES, stat.size - offset));
          if (trailing.some(byte => byte !== 0)) throw new Error('Pages archive contains data after its end marker.');
          endBlocks += 1;
        }
        break;
      }
      verifyTarChecksum(header);
      const headerSize = parseTarNumber(header.subarray(124, 136), 'entry size');
      const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
      const headerName = decodeTarString(header, 0, 100);
      const prefix = decodeTarString(header, 345, 155);
      let entryPath = pendingLongPath ?? (prefix ? `${prefix}/${headerName}` : headerName);

      if (type === 'L' || type === 'x') {
        const payload = readPayload(headerSize);
        consumePadding(headerSize);
        if (type === 'L') {
          pendingLongPath = payload.toString('utf8').replace(/\0.*$/s, '').replace(/\n$/, '');
        } else {
          pendingPax = parsePax(payload);
        }
        metadataEntries += 1;
        continue;
      }
      if (type === 'g') throw new Error('Pages archive contains unsupported global PAX metadata.');

      if (pendingPax?.has('path')) entryPath = pendingPax.get('path');
      if (pendingPax?.has('size') && Number(pendingPax.get('size')) !== headerSize) {
        throw new Error('Pages archive PAX size disagrees with its file header.');
      }
      pendingLongPath = null;
      pendingPax = null;

      if (type === '5') {
        if (headerSize !== 0) throw new Error('Pages archive directory entry declares file bytes.');
        const relative = normalizeTarPath(entryPath, { directory: true });
        if (relative) {
          if (!expectedDirs.has(relative) || seenDirectories.has(relative) || seenFiles.has(relative)) {
            throw new Error(`Pages archive contains an unexpected or duplicate directory: ${relative}.`);
          }
          seenDirectories.add(relative);
          fs.mkdirSync(path.join(root, ...relative.split('/')), { recursive: true });
        }
        continue;
      }
      if (type !== '0') throw new Error(`Pages archive contains a non-regular entry (${type}) at ${entryPath}.`);

      const relative = normalizeTarPath(entryPath);
      if (!expectedPaths.has(relative) || seenFiles.has(relative) || seenDirectories.has(relative)) {
        throw new Error(`Pages archive contains an unexpected or duplicate file: ${relative}.`);
      }
      seenFiles.add(relative);
      const target = path.join(root, ...relative.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const output = fs.openSync(target, 'wx');
      try {
        let remaining = headerSize;
        while (remaining > 0) {
          const chunk = readNext(Math.min(1024 * 1024, remaining));
          let written = 0;
          while (written < chunk.length) written += fs.writeSync(output, chunk, written, chunk.length - written);
          remaining -= chunk.length;
        }
      } finally {
        fs.closeSync(output);
      }
      consumePadding(headerSize);
    }
    if (endBlocks < 2) throw new Error('Pages archive is missing its two-block end marker.');
    if (pendingLongPath || pendingPax) throw new Error('Pages archive ends with unapplied path metadata.');
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  } finally {
    fs.closeSync(fd);
  }

  return Object.freeze({
    bytes: stat.size,
    sha256: digest.digest('hex'),
    regularFileCount: seenFiles.size,
    directoryEntryCount: seenDirectories.size,
    metadataEntryCount: metadataEntries
  });
}

export function verifyPagesArtifactArchive({
  archivePath,
  manifestPath,
  extractRoot,
  artifactId = null,
  commit = null,
  output = null
} = {}) {
  if (!archivePath || !manifestPath || !extractRoot) {
    throw new Error('Pages archive verification requires --archive, --manifest, and --extract-root.');
  }
  if (artifactId !== null && !/^[1-9][0-9]*$/.test(String(artifactId))) {
    throw new Error('Pages artifact ID must be a positive integer.');
  }
  const manifestRecord = readArtifactManifest(path.resolve(manifestPath));
  const expectedPaths = new Set([...manifestRecord.paths, 'asset-manifest.json']);
  const archive = inspectAndExtractTar(archivePath, extractRoot, expectedPaths);
  let local;
  try {
    local = verifyLocalArtifact(extractRoot, manifestRecord);
  } catch (error) {
    fs.rmSync(path.resolve(extractRoot), { recursive: true, force: true });
    throw error;
  }
  if (archive.regularFileCount !== expectedPaths.size) {
    throw new Error('Pages archive regular-file count differs from the exact asset closure.');
  }
  const evidence = {
    schemaVersion: 1,
    kind: 'openbexi-pages-upload-artifact-verification',
    sourceCommit: commit,
    artifactId: artifactId === null ? null : String(artifactId),
    archive: {
      bytes: archive.bytes,
      sha256: archive.sha256,
      regularFileCount: archive.regularFileCount,
      directoryEntryCount: archive.directoryEntryCount,
      metadataEntryCount: archive.metadataEntryCount
    },
    artifact: {
      version: manifestRecord.manifest.version,
      manifestSha256: manifestRecord.sha256,
      fileCount: local.fileCount,
      totalBytes: local.totalBytes
    },
    verification: {
      extractedExact: true,
      exactFileSet: true,
      noExtraFiles: true,
      regularFilesOnly: true
    },
    verifiedAt: new Date().toISOString()
  };
  if (output) {
    const target = path.resolve(output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
  return Object.freeze(evidence);
}

function parseArguments(argv) {
  const options = {};
  const names = new Map([
    ['--archive', 'archivePath'],
    ['--manifest', 'manifestPath'],
    ['--extract-root', 'extractRoot'],
    ['--artifact-id', 'artifactId'],
    ['--commit', 'commit'],
    ['--output', 'output']
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!names.has(argument)) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value.`);
    options[names.get(argument)] = value;
  }
  return options;
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedFile === import.meta.url) {
  try {
    const evidence = verifyPagesArtifactArchive(parseArguments(process.argv.slice(2)));
    console.log(
      `Verified Pages upload archive: ${evidence.archive.regularFileCount} files, ` +
      `${evidence.archive.bytes} archive bytes, sha256:${evidence.archive.sha256}.`
    );
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
