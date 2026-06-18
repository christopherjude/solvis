import type { EdgeKind, SolvisGraph } from '@solvis/core';
import { CATEGORY_COLOR, CATEGORY_ORDER, EDGE_STYLE } from './theme';

const KINDS: EdgeKind[] = ['reference', 'cross-stack', 'iam', 'dataflow'];

interface Props {
  graph: SolvisGraph;
  projectName?: string;
  onBack?: () => void;
  enabledKinds: Set<EdgeKind>;
  onToggleKind: (k: EdgeKind) => void;
  stackFilter: Set<string>;
  onToggleStack: (id: string) => void;
  onClearStacks: () => void;
  search: string;
  onSearch: (s: string) => void;
  visibleCount: number;
}

/** Left control rail: search, layer toggles, stack filter, category legend. */
export function Sidebar(props: Props) {
  const { graph, enabledKinds, stackFilter, visibleCount } = props;
  const edgeCounts = countBy(graph.edges.map((e) => e.kind));

  return (
    <aside className="sidebar">
      {props.onBack ? (
        <button className="sidebar__back" onClick={props.onBack}>
          ← Projects
        </button>
      ) : null}
      <h1 className="sidebar__brand">{props.projectName ?? 'Solvis'}</h1>
      <p className="sidebar__count">
        {visibleCount} / {graph.nodes.length} resources · {graph.stacks.length} stacks
      </p>

      <input
        className="sidebar__search"
        placeholder="Search resources…"
        value={props.search}
        onChange={(e) => props.onSearch(e.target.value)}
      />

      <section>
        <h2>Layers</h2>
        {KINDS.map((k) => (
          <label key={k} className="row">
            <input type="checkbox" checked={enabledKinds.has(k)} onChange={() => props.onToggleKind(k)} />
            <span className="swatch" style={{ background: EDGE_STYLE[k].color }} />
            {EDGE_STYLE[k].label}
            <span className="row__count">{edgeCounts[k] ?? 0}</span>
          </label>
        ))}
      </section>

      <section>
        <div className="section__head">
          <h2>Stacks</h2>
          {stackFilter.size > 0 && (
            <button className="linkbtn" onClick={props.onClearStacks}>
              clear
            </button>
          )}
        </div>
        <div className="sidebar__stacks">
          {graph.stacks
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <label key={s.id} className="row" title={s.templatePath}>
                <input
                  type="checkbox"
                  checked={stackFilter.size === 0 || stackFilter.has(s.id)}
                  onChange={() => props.onToggleStack(s.id)}
                />
                {s.name}
                <span className="row__count">{s.nodeIds.length}</span>
              </label>
            ))}
        </div>
      </section>

      <section>
        <h2>Categories</h2>
        {CATEGORY_ORDER.map((c) => (
          <div key={c} className="row">
            <span className="swatch" style={{ background: CATEGORY_COLOR[c] }} />
            {c}
          </div>
        ))}
      </section>

      {graph.warnings.length > 0 && (
        <section>
          <h2>Warnings ({graph.warnings.length})</h2>
          <ul className="sidebar__warnings">
            {graph.warnings.slice(0, 30).map((w, i) => (
              <li key={i} title={w.message}>
                <code>{w.code}</code> {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function countBy<T extends string>(items: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
}
