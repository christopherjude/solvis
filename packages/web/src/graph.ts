import type { SolvisGraph } from '@solvis/core';

declare global {
  interface Window {
    __SOLVIS_GRAPH__?: SolvisGraph;
  }
}

/**
 * Load the graph: prefer the injected global (offline file:// builds), otherwise
 * fetch graph.json from the same directory (dev server / hosted).
 */
export async function loadGraph(): Promise<SolvisGraph> {
  if (window.__SOLVIS_GRAPH__) return window.__SOLVIS_GRAPH__;
  const res = await fetch('./graph.json');
  if (!res.ok) throw new Error(`Failed to load graph.json (${res.status})`);
  return (await res.json()) as SolvisGraph;
}
