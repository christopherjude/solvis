import { useCallback, useEffect, useState } from 'react';
import type { SolvisGraph } from '@solvis/core';
import { api, subscribeEvents, type ProjectGraph, type ProjectSummary } from './api';
import { GraphView } from './GraphView';
import { ProjectsDashboard } from './ProjectsDashboard';
import './styles.css';

/**
 * Two modes:
 *  - Static export: `window.__SOLVIS_GRAPH__` is injected → render that one graph.
 *  - Server: talk to the local API → Projects dashboard + per-project GraphView,
 *    with live-refresh over SSE.
 */
export function App() {
  const injected = window.__SOLVIS_GRAPH__;
  if (injected) return <GraphView graph={injected as SolvisGraph} />;
  return <ServerApp />;
}

function ServerApp() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<ProjectGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProjects = useCallback(() => {
    api.listProjects().then(setProjects).catch((e) => setError(String(e)));
  }, []);

  const loadGraph = useCallback((id: string) => {
    api
      .getGraph(id)
      .then((pg) => {
        setCurrent(pg);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Initial load.
  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Load the selected project's graph.
  useEffect(() => {
    if (selectedId) loadGraph(selectedId);
    else setCurrent(null);
  }, [selectedId, loadGraph]);

  // Live updates: refresh on file-watch / project changes.
  useEffect(() => {
    return subscribeEvents((e) => {
      if (e.type === 'projects-changed') refreshProjects();
      if (e.type === 'graph-updated') {
        refreshProjects();
        if (e.projectId && e.projectId === selectedId) loadGraph(selectedId);
      }
    });
  }, [selectedId, refreshProjects, loadGraph]);

  if (loading) return <div className="loading">Loading…</div>;

  if (selectedId && current) {
    return (
      <GraphView
        graph={current.graph}
        projectName={current.project.name}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  if (selectedId && !current) {
    return (
      <div className="loading">
        {error ? <span className="fatal">{error}</span> : 'Scanning project…'}
        {error && (
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setSelectedId(null)}>
            ← Back to projects
          </button>
        )}
      </div>
    );
  }

  return (
    <ProjectsDashboard projects={projects} onOpen={setSelectedId} onChanged={refreshProjects} />
  );
}
