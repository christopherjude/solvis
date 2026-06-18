import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { parseTemplate, type LoadedTemplate } from '@solvis/core';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.solvis-out',
  'coverage',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
]);

const TEMPLATE_EXTS = new Set(['.yaml', '.yml', '.json']);

export interface DiscoverResult {
  templates: LoadedTemplate[];
  /** Files that looked like templates but failed to parse. */
  parseErrors: { path: string; message: string }[];
}

/** Recursively find files that look like CloudFormation templates under a project dir. */
export function discoverTemplates(projectDir: string): DiscoverResult {
  const files: string[] = [];
  walk(projectDir, files);

  const templates: LoadedTemplate[] = [];
  const parseErrors: { path: string; message: string }[] = [];

  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!looksLikeCfn(source)) continue;

    try {
      const template = parseTemplate(source);
      if (!template.Resources || typeof template.Resources !== 'object') continue;
      const rel = relative(projectDir, file);
      templates.push({
        stackId: stackIdFor(rel),
        stackName: stackNameFor(rel),
        templatePath: rel,
        template,
      });
    } catch (err) {
      parseErrors.push({ path: file, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { templates, parseErrors };
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (IGNORE_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (TEMPLATE_EXTS.has(extname(entry).toLowerCase())) {
      out.push(full);
    }
  }
}

/** Cheap pre-filter so we don't fully parse every YAML/JSON file in the repo. */
function looksLikeCfn(source: string): boolean {
  if (!source.includes('Resources')) return false;
  return (
    /AWSTemplateFormatVersion/.test(source) ||
    /\bType:\s*['"]?AWS::/.test(source) ||
    /"Type"\s*:\s*"AWS::/.test(source)
  );
}

/**
 * Derive a unique, stable stack id from a template's relative path.
 * `a/b/template.yaml` -> `a/b`; `a/b/template-user.yaml` -> `a/b/template-user`;
 * `a/b/storage.yaml` -> `a/b/storage`. Always slash-separated.
 */
export function stackIdFor(relPath: string): string {
  const noExt = relPath.slice(0, relPath.length - extname(relPath).length);
  const base = basename(noExt);
  const id = base === 'template' ? noExt.slice(0, noExt.length - base.length - 1) : noExt;
  return id.split(sep).join('/');
}

export function stackNameFor(relPath: string): string {
  const id = stackIdFor(relPath);
  const segs = id.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? id;
}

/** True if a changed path could affect the graph (a candidate template file). */
export function isTemplatePath(path: string): boolean {
  if (TEMPLATE_EXTS.has(extname(path).toLowerCase()) === false) return false;
  return !path.split(sep).some((seg) => IGNORE_DIRS.has(seg));
}
