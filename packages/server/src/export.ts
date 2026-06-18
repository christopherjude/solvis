import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SolvisGraph } from '@solvis/core';
import { generateGraph } from './pipeline.js';
import { findWebDist } from './webdist.js';

export interface ExportResult {
  graph: SolvisGraph;
  templateCount: number;
  parseErrors: { path: string; message: string }[];
  outDir: string;
  /** True if the interactive viewer was bundled (web/dist was found). */
  viewerBundled: boolean;
}

/**
 * Static export: write graph.json + a self-contained viewer to outDir. The graph is
 * also injected as a global so the bundle works offline from file:// without fetch.
 */
export function exportStatic(projectDir: string, outDir: string): ExportResult {
  const { graph, templateCount, parseErrors } = generateGraph(projectDir);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'graph.json'), JSON.stringify(graph, null, 2));

  const webDist = findWebDist();
  if (webDist) {
    cpSync(webDist, outDir, { recursive: true });
    writeFileSync(join(outDir, 'graph-data.js'), `window.__SOLVIS_GRAPH__ = ${JSON.stringify(graph)};`);
  }

  return { graph, templateCount, parseErrors, outDir, viewerBundled: Boolean(webDist) };
}
