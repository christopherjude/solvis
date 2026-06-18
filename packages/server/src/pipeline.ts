import { buildGraph, type SolvisGraph } from '@solvis/core';
import { discoverTemplates } from './discover.js';

export interface GraphResult {
  graph: SolvisGraph;
  templateCount: number;
  parseErrors: { path: string; message: string }[];
}

/** Discover + parse + build a graph for a project directory. Never throws on real input. */
export function generateGraph(projectDir: string): GraphResult {
  const { templates, parseErrors } = discoverTemplates(projectDir);
  const graph = buildGraph(templates);
  return { graph, templateCount: templates.length, parseErrors };
}
