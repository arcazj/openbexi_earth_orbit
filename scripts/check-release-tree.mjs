import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runGit(root, args, { input = undefined } = {}) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function parseNullRecords(value) {
  return String(value).split('\0').filter(Boolean);
}

function commitEntries(root, treeish) {
  const commitOid = runGit(root, ['rev-parse', `${treeish}^{commit}`]).trim();
  const treeOid = runGit(root, ['rev-parse', `${commitOid}^{tree}`]).trim();
  const records = parseNullRecords(runGit(root, ['ls-tree', '-r', '-z', '--full-tree', treeOid]));
  const entries = records.map(record => {
    const match = /^(\d+)\s+(\w+)\s+([0-9a-f]+)\t([\s\S]+)$/.exec(record);
    if (!match || match[2] !== 'blob') throw new Error(`Unsupported Git tree entry: ${record}`);
    return { mode: match[1], oid: match[3], path: match[4] };
  });
  return { entries, sourceId: treeOid, commitOid };
}

function indexEntries(root) {
  const records = parseNullRecords(runGit(root, ['ls-files', '--stage', '-z']));
  const entries = records.map(record => {
    const match = /^(\d+)\s+([0-9a-f]+)\s+(\d)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error(`Unsupported Git index entry: ${record}`);
    if (match[3] !== '0') throw new Error(`Git index has an unresolved merge entry: ${match[4]}`);
    return { mode: match[1], oid: match[2], path: match[4] };
  });
  const fingerprint = crypto.createHash('sha256');
  for (const entry of entries) fingerprint.update(`${entry.mode} ${entry.oid}\t${entry.path}\0`);
  return { entries, sourceId: `index:${fingerprint.digest('hex')}` };
}

function rawWorktreeOids(root, entries) {
  if (entries.some(entry => /[\r\n]/.test(entry.path))) {
    throw new Error('Release verification does not support tracked paths containing newlines.');
  }
  const regular = [];
  const actual = new Map();
  for (const entry of entries) {
    const target = path.join(root, ...entry.path.split('/'));
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch {
      actual.set(entry.path, { issue: 'missing' });
      continue;
    }
    if (entry.mode === '120000') {
      if (!stat.isSymbolicLink()) {
        actual.set(entry.path, { issue: 'expected symbolic link' });
        continue;
      }
      const linkBytes = Buffer.from(fs.readlinkSync(target), 'utf8');
      const result = spawnSync('git', ['-C', root, 'hash-object', '--stdin'], {
        encoding: 'utf8',
        input: linkBytes,
        windowsHide: true
      });
      if (result.status !== 0) throw new Error(`Unable to hash symbolic link ${entry.path}.`);
      actual.set(entry.path, { oid: result.stdout.trim(), bytes: linkBytes.length });
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      actual.set(entry.path, { issue: 'expected regular file' });
      continue;
    }
    regular.push({ entry, bytes: stat.size });
  }
  if (regular.length > 0) {
    const result = spawnSync('git', ['-C', root, 'hash-object', '--no-filters', '--stdin-paths'], {
      encoding: 'utf8',
      input: `${regular.map(item => item.entry.path).join('\n')}\n`,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true
    });
    if (result.status !== 0) {
      throw new Error(`Unable to hash release worktree: ${String(result.stderr || result.stdout).trim()}`);
    }
    const oids = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    if (oids.length !== regular.length) throw new Error('Git returned an incomplete worktree hash set.');
    regular.forEach((item, index) => actual.set(item.entry.path, { oid: oids[index], bytes: item.bytes }));
  }
  return actual;
}

function normalizeInputPath(value) {
  const normalized = String(value).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..') || /[\0\r\n]/.test(normalized)) {
    throw new Error(`Release input must be a repository-relative Git path: ${value}`);
  }
  return normalized;
}

export function resolveCommitTree({ root = PROJECT_ROOT, treeish = 'HEAD' } = {}) {
  const repositoryRoot = path.resolve(runGit(root, ['rev-parse', '--show-toplevel']).trim());
  if (repositoryRoot.toLowerCase() !== path.resolve(root).toLowerCase()) {
    throw new Error(`Release root must be the Git worktree root: ${repositoryRoot}`);
  }
  if (!treeish) throw new Error('Commit-tree resolution requires a Git tree-ish.');
  const selected = commitEntries(root, treeish);
  return Object.freeze({
    treeish,
    sourceId: selected.sourceId,
    resolvedCommitOid: selected.commitOid,
    files: Object.freeze(selected.entries.map(entry => Object.freeze({ ...entry })))
  });
}

export function verifyCommitTreeInputs({ root = PROJECT_ROOT, treeish = 'HEAD', paths = [] } = {}) {
  const repositoryRoot = path.resolve(runGit(root, ['rev-parse', '--show-toplevel']).trim());
  if (repositoryRoot.toLowerCase() !== path.resolve(root).toLowerCase()) {
    throw new Error(`Release root must be the Git worktree root: ${repositoryRoot}`);
  }
  if (!treeish) throw new Error('Release input verification requires a Git tree-ish.');

  const selected = resolveCommitTree({ root, treeish });
  const entriesByPath = new Map(selected.files.map(entry => [entry.path, entry]));
  const requestedPaths = [...new Set(paths.map(normalizeInputPath))].sort();
  const missingOrNonRegular = [];
  const regularEntries = [];
  for (const inputPath of requestedPaths) {
    const entry = entriesByPath.get(inputPath);
    if (!entry) {
      missingOrNonRegular.push(`${inputPath} (not present)`);
    } else if (entry.mode !== '100644' && entry.mode !== '100755') {
      missingOrNonRegular.push(`${inputPath} (mode ${entry.mode})`);
    } else {
      regularEntries.push(entry);
    }
  }
  if (missingOrNonRegular.length > 0) {
    throw new Error(
      `Release inputs are not regular blobs in the selected Git commit: ${missingOrNonRegular.slice(0, 20).join(', ')}`
    );
  }

  const actual = rawWorktreeOids(root, regularEntries);
  const mismatches = regularEntries.flatMap(entry => {
    const found = actual.get(entry.path);
    if (found?.oid === entry.oid) return [];
    return [`${entry.path} (${found?.issue ?? 'byte mismatch'})`];
  });
  if (mismatches.length > 0) {
    throw new Error(`Release input bytes differ from the selected Git commit: ${mismatches.slice(0, 20).join(', ')}`);
  }

  return Object.freeze({
    treeish,
    sourceId: selected.sourceId,
    resolvedCommitOid: selected.resolvedCommitOid,
    fileCount: regularEntries.length,
    totalBytes: regularEntries.reduce((sum, entry) => sum + (actual.get(entry.path)?.bytes ?? 0), 0),
    rawWorktreeMatches: true,
    files: Object.freeze(regularEntries.map(entry => Object.freeze({ ...entry })))
  });
}

function parseArguments(argv) {
  const options = { root: PROJECT_ROOT, source: 'commit', treeish: 'HEAD', requireClean: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--index') {
      options.source = 'index';
    } else if (argument === '--tree') {
      options.source = 'commit';
      options.treeish = argv[++index];
    } else if (argument === '--root') {
      options.root = path.resolve(argv[++index]);
    } else if (argument === '--output') {
      options.output = path.resolve(argv[++index]);
    } else if (argument === '--require-clean') {
      options.requireClean = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.source === 'commit' && !options.treeish) throw new Error('--tree requires a Git tree-ish.');
  return options;
}

export function verifyReleaseTree({
  root = PROJECT_ROOT,
  source = 'commit',
  treeish = 'HEAD',
  requireClean = false,
  output = null
} = {}) {
  const repositoryRoot = path.resolve(runGit(root, ['rev-parse', '--show-toplevel']).trim());
  if (repositoryRoot.toLowerCase() !== path.resolve(root).toLowerCase()) {
    throw new Error(`Release root must be the Git worktree root: ${repositoryRoot}`);
  }
  const selected = source === 'index' ? indexEntries(root) : commitEntries(root, treeish);
  const actual = rawWorktreeOids(root, selected.entries);
  const mismatches = selected.entries.flatMap(entry => {
    const found = actual.get(entry.path);
    if (found?.oid === entry.oid) return [];
    return [{ path: entry.path, expectedOid: entry.oid, actualOid: found?.oid ?? null, issue: found?.issue ?? 'byte mismatch' }];
  });
  const status = parseNullRecords(runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  if (mismatches.length > 0) {
    const detail = mismatches.slice(0, 20).map(item => `${item.path} (${item.issue})`).join(', ');
    throw new Error(`Release worktree differs from the selected Git ${source}: ${detail}`);
  }
  if (requireClean && status.length > 0) {
    throw new Error(`Release worktree is not clean (${status.length} status entries).`);
  }
  const report = {
    schemaVersion: 1,
    kind: 'openbexi-release-tree-verification',
    source,
    sourceId: selected.sourceId,
    resolvedCommitOid: source === 'commit' ? selected.commitOid : null,
    treeish: source === 'commit' ? treeish : null,
    fileCount: selected.entries.length,
    totalBytes: selected.entries.reduce((sum, entry) => sum + (actual.get(entry.path)?.bytes ?? 0), 0),
    rawWorktreeMatches: true,
    cleanWorktree: status.length === 0,
    statusEntryCount: status.length,
    verifiedAt: new Date().toISOString()
  };
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return Object.freeze(report);
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedFile === import.meta.url) {
  try {
    const report = verifyReleaseTree(parseArguments(process.argv.slice(2)));
    console.log(`Release ${report.source} bytes verified: ${report.fileCount} files, ${report.totalBytes} bytes, ${report.sourceId}.`);
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
