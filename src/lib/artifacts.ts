import fs from 'node:fs';
import path from 'node:path';

export interface WorkspaceFileSnapshotEntry {
  relativePath: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
}

export interface WorkspaceSnapshot {
  rootDirectory: string;
  capturedAt: number;
  files: Map<string, WorkspaceFileSnapshotEntry>;
}

export interface ChangedWorkspaceArtifact extends WorkspaceFileSnapshotEntry {
  kind: 'created' | 'modified';
}

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
]);

const MAX_SNAPSHOT_FILES = 4000;

const shouldIgnorePath = (absolutePath: string): boolean => {
  const normalized = absolutePath.replace(/\\/g, '/');
  return normalized.includes('/.deltagravity/inbox/');
};

const walkWorkspace = (
  rootDirectory: string,
  currentDirectory: string,
  files: Map<string, WorkspaceFileSnapshotEntry>,
): void => {
  if (files.size >= MAX_SNAPSHOT_FILES) {
    return;
  }

  const entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (files.size >= MAX_SNAPSHOT_FILES) {
      return;
    }

    const absolutePath = path.join(currentDirectory, entry.name);
    if (shouldIgnorePath(absolutePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      walkWorkspace(rootDirectory, absolutePath, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = fs.statSync(absolutePath);
    const relativePath = path.relative(rootDirectory, absolutePath) || entry.name;
    files.set(relativePath, {
      relativePath,
      absolutePath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    });
  }
};

export const captureWorkspaceSnapshot = (rootDirectory: string): WorkspaceSnapshot => {
  const files = new Map<string, WorkspaceFileSnapshotEntry>();
  walkWorkspace(rootDirectory, rootDirectory, files);

  return {
    rootDirectory,
    capturedAt: Date.now(),
    files,
  };
};

export const diffWorkspaceSnapshots = (
  before: WorkspaceSnapshot | undefined,
  after: WorkspaceSnapshot,
): ChangedWorkspaceArtifact[] => {
  const changed: ChangedWorkspaceArtifact[] = [];

  for (const [relativePath, currentEntry] of after.files.entries()) {
    const previousEntry = before?.files.get(relativePath);

    if (!previousEntry) {
      changed.push({ ...currentEntry, kind: 'created' });
      continue;
    }

    if (
      previousEntry.mtimeMs !== currentEntry.mtimeMs ||
      previousEntry.size !== currentEntry.size
    ) {
      changed.push({ ...currentEntry, kind: 'modified' });
    }
  }

  return changed.sort((left, right) => right.mtimeMs - left.mtimeMs);
};
