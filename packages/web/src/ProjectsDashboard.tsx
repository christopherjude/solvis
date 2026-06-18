import { useEffect, useState } from 'react';
import { api, type FsListing, type ProjectSummary } from './api';

interface Props {
  projects: ProjectSummary[];
  onOpen: (id: string) => void;
  onChanged: () => void;
}

/** Landing view: list of registered projects + add-by-path with a directory browser. */
export function ProjectsDashboard({ projects, onOpen, onChanged }: Props) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  async function add(targetPath: string) {
    if (!targetPath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const project = await api.addProject(targetPath.trim(), name.trim() || undefined);
      setPath('');
      setName('');
      setBrowsing(false);
      onChanged();
      onOpen(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash">
      <header className="dash__head">
        <h1>Solvis</h1>
        <p>Interactive diagrams of your AWS CloudFormation solutions.</p>
      </header>

      <section className="dash__add">
        <h2>Add a project</h2>
        <div className="dash__addrow">
          <input
            className="dash__input"
            placeholder="/path/to/your/cloudformation/project  (~ supported)"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add(path)}
          />
          <input
            className="dash__input dash__input--name"
            placeholder="name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn" disabled={busy || !path.trim()} onClick={() => add(path)}>
            {busy ? 'Adding…' : 'Add'}
          </button>
          <button className="btn btn--ghost" onClick={() => setBrowsing((b) => !b)}>
            {browsing ? 'Hide browser' : 'Browse…'}
          </button>
        </div>
        {error && <p className="dash__error">{error}</p>}
        {browsing && <DirectoryBrowser onPick={(p) => setPath(p)} onUse={(p) => add(p)} />}
      </section>

      <section>
        <h2>Projects ({projects.length})</h2>
        {projects.length === 0 ? (
          <p className="dash__empty">No projects yet. Add a path above to visualize a solution.</p>
        ) : (
          <ul className="dash__grid">
            {projects.map((p) => (
              <li key={p.id} className="card">
                <div className="card__body" onClick={() => onOpen(p.id)}>
                  <h3>{p.name}</h3>
                  <code className="card__path">{p.path}</code>
                  {p.error ? (
                    <p className="card__error">⚠ {p.error}</p>
                  ) : (
                    <p className="card__stats">
                      {p.resourceCount ?? '–'} resources · {p.stackCount ?? '–'} stacks
                      {p.warningCount ? ` · ${p.warningCount} warnings` : ''}
                    </p>
                  )}
                </div>
                <div className="card__actions">
                  <button className="btn btn--sm" onClick={() => onOpen(p.id)}>
                    Open
                  </button>
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick={async () => {
                      await api.rescan(p.id);
                      onChanged();
                    }}
                  >
                    Re-scan
                  </button>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={async () => {
                      await api.removeProject(p.id);
                      onChanged();
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DirectoryBrowser({ onPick, onUse }: { onPick: (p: string) => void; onUse: (p: string) => void }) {
  const [listing, setListing] = useState<FsListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = (dir?: string) => {
    api
      .browse(dir)
      .then((l) => {
        setListing(l);
        setError(null);
        onPick(l.dir);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    go(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="dash__error">{error}</p>;
  if (!listing) return <p className="dash__empty">Loading…</p>;

  return (
    <div className="browser">
      <div className="browser__bar">
        <code>{listing.dir}</code>
        <button className="btn btn--sm" onClick={() => onUse(listing.dir)}>
          Use this folder
        </button>
      </div>
      <ul className="browser__list">
        {listing.parent && (
          <li>
            <button className="linkbtn" onClick={() => go(listing.parent!)}>
              📁 ..
            </button>
          </li>
        )}
        {listing.entries.map((e) => (
          <li key={e.path}>
            <button className="linkbtn" onClick={() => go(e.path)}>
              📁 {e.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
