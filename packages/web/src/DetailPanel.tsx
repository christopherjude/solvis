import type { SolvisEdge, SolvisGraph, SolvisNode } from '@solvis/core';
import { CATEGORY_COLOR, EDGE_STYLE } from './theme';

interface Props {
  graph: SolvisGraph;
  node?: SolvisNode;
  edge?: SolvisEdge;
  onSelectNode: (id: string) => void;
}

/** Right-hand inspector for the currently selected node or edge. */
export function DetailPanel({ graph, node, edge, onSelectNode }: Props) {
  if (node) return <NodeDetail graph={graph} node={node} onSelectNode={onSelectNode} />;
  if (edge) return <EdgeDetail graph={graph} edge={edge} onSelectNode={onSelectNode} />;
  return (
    <div className="detail detail--empty">
      <p>Click a resource or edge to inspect it.</p>
    </div>
  );
}

function NodeDetail({ graph, node, onSelectNode }: { graph: SolvisGraph; node: SolvisNode; onSelectNode: (id: string) => void }) {
  const stack = graph.stacks.find((s) => s.id === node.stackId);
  const incoming = graph.edges.filter((e) => e.target === node.id);
  const outgoing = graph.edges.filter((e) => e.source === node.id);
  const byId = (id: string) => graph.nodes.find((n) => n.id === id);

  return (
    <div className="detail">
      <span className="detail__chip" style={{ background: CATEGORY_COLOR[node.category] }}>
        {node.category}
      </span>
      <h2>{node.title}</h2>
      <code className="detail__type">{node.resourceType}</code>
      <dl>
        <dt>Stack</dt>
        <dd>{stack?.name ?? node.stackId}</dd>
        <dt>Source</dt>
        <dd>{stack?.templatePath}</dd>
      </dl>

      {Object.keys(node.keyProperties).length > 0 && (
        <>
          <h3>Key properties</h3>
          <pre>{JSON.stringify(node.keyProperties, null, 2)}</pre>
        </>
      )}

      <ConnList title={`Outgoing (${outgoing.length})`} edges={outgoing} dir="target" byId={byId} onSelectNode={onSelectNode} />
      <ConnList title={`Incoming (${incoming.length})`} edges={incoming} dir="source" byId={byId} onSelectNode={onSelectNode} />

      <details>
        <summary>All properties</summary>
        <pre>{JSON.stringify(node.properties, null, 2)}</pre>
      </details>
    </div>
  );
}

function ConnList({
  title,
  edges,
  dir,
  byId,
  onSelectNode,
}: {
  title: string;
  edges: SolvisEdge[];
  dir: 'source' | 'target';
  byId: (id: string) => SolvisNode | undefined;
  onSelectNode: (id: string) => void;
}) {
  if (edges.length === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className="detail__conns">
        {edges.map((e) => {
          const otherId = dir === 'target' ? e.target : e.source;
          const other = byId(otherId);
          return (
            <li key={e.id}>
              <span className="detail__edgekind" style={{ color: EDGE_STYLE[e.kind].color }}>
                {e.label ?? e.kind}
              </span>{' '}
              <button className="linkbtn" onClick={() => onSelectNode(otherId)}>
                {other?.title ?? otherId}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function EdgeDetail({ graph, edge, onSelectNode }: { graph: SolvisGraph; edge: SolvisEdge; onSelectNode: (id: string) => void }) {
  const src = graph.nodes.find((n) => n.id === edge.source);
  const tgt = graph.nodes.find((n) => n.id === edge.target);
  return (
    <div className="detail">
      <span className="detail__chip" style={{ background: EDGE_STYLE[edge.kind].color }}>
        {EDGE_STYLE[edge.kind].label}
      </span>
      <h2>{edge.label ?? edge.kind}</h2>
      <dl>
        <dt>From</dt>
        <dd>
          <button className="linkbtn" onClick={() => onSelectNode(edge.source)}>
            {src?.title ?? edge.source}
          </button>
        </dd>
        <dt>To</dt>
        <dd>
          <button className="linkbtn" onClick={() => onSelectNode(edge.target)}>
            {tgt?.title ?? edge.target}
          </button>
        </dd>
      </dl>
      {edge.detail && (
        <>
          <h3>Details</h3>
          <pre>{JSON.stringify(edge.detail, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
