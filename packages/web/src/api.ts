import type { SolvisGraph } from '@solvis/core';

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  addedAt?: number;
  resourceCount?: number;
  stackCount?: number;
  warningCount?: number;
  lastScanned?: number;
  error?: string;
}

export interface ProjectGraph {
  project: ProjectSummary;
  graph: SolvisGraph;
  templateCount: number;
  parseErrors: { path: string; message: string }[];
}

export interface FsListing {
  dir: string;
  parent: string | null;
  entries: { name: string; path: string }[];
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export const api = {
  listProjects: () => req<{ projects: ProjectSummary[] }>('/api/projects').then((r) => r.projects),
  addProject: (path: string, name?: string) =>
    req<{ project: ProjectSummary }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ path, name }),
    }).then((r) => r.project),
  removeProject: (id: string) => req<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  getGraph: (id: string) => req<ProjectGraph>(`/api/projects/${id}/graph`),
  rescan: (id: string) => req<{ project: ProjectSummary }>(`/api/projects/${id}/rescan`, { method: 'POST' }),
  browse: (dir?: string) => req<FsListing>(`/api/fs${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`),
};

/** Subscribe to server-sent events. Returns an unsubscribe function. */
export function subscribeEvents(onEvent: (e: { type: string; projectId?: string }) => void): () => void {
  const es = new EventSource('/api/events');
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      /* ignore malformed event */
    }
  };
  return () => es.close();
}
