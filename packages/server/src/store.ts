import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

/** A registered project: a path on disk we render the diagram for. */
export interface Project {
  id: string;
  name: string;
  /** Absolute path to the project root. */
  path: string;
  /** Epoch ms of when it was added (stamped by the caller). */
  addedAt?: number;
}

interface ConfigFile {
  version: 1;
  projects: Project[];
}

const SOLVIS_DIR = process.env.SOLVIS_HOME ?? join(homedir(), '.solvis');
const CONFIG_PATH = join(SOLVIS_DIR, 'config.json');

function load(): ConfigFile {
  if (!existsSync(CONFIG_PATH)) return { version: 1, projects: [] };
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as ConfigFile;
    if (!Array.isArray(parsed.projects)) return { version: 1, projects: [] };
    return parsed;
  } catch {
    return { version: 1, projects: [] };
  }
}

function save(config: ConfigFile): void {
  mkdirSync(SOLVIS_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** Stable id derived from the absolute path, so re-adding the same path is idempotent. */
export function projectIdForPath(absPath: string): string {
  return createHash('sha1').update(absPath).digest('hex').slice(0, 12);
}

export function listProjects(): Project[] {
  return load().projects;
}

export function getProject(id: string): Project | undefined {
  return load().projects.find((p) => p.id === id);
}

/** Add (or return existing) project for a path. Returns the project + whether it's new. */
export function addProject(rawPath: string, name: string | undefined, now: number): { project: Project; created: boolean } {
  const absPath = resolve(rawPath);
  const id = projectIdForPath(absPath);
  const config = load();
  const existing = config.projects.find((p) => p.id === id);
  if (existing) return { project: existing, created: false };

  const project: Project = {
    id,
    name: name?.trim() || basename(absPath) || absPath,
    path: absPath,
    addedAt: now,
  };
  config.projects.push(project);
  save(config);
  return { project, created: true };
}

export function removeProject(id: string): boolean {
  const config = load();
  const next = config.projects.filter((p) => p.id !== id);
  if (next.length === config.projects.length) return false;
  save({ ...config, projects: next });
  return true;
}

export { SOLVIS_DIR, CONFIG_PATH };
