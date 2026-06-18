import { useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { EdgeKind, SolvisGraph } from '@solvis/core';
import { layout } from './layout';
import { ResourceNode, type ResourceNodeData } from './ResourceNode';
import { DetailPanel } from './DetailPanel';
import { Sidebar } from './Sidebar';
import { CATEGORY_COLOR, EDGE_STYLE } from './theme';

const NODE_TYPES: NodeTypes = { resource: ResourceNode };
const ALL_KINDS: EdgeKind[] = ['reference', 'cross-stack', 'iam', 'dataflow'];

function shortType(resourceType: string): string {
  const parts = resourceType.split('::');
  return parts.slice(1).join('::') || resourceType;
}

interface Props {
  graph: SolvisGraph;
  projectName?: string;
  onBack?: () => void;
}

/** The three-pane interactive diagram for a single graph. */
export function GraphView({ graph, projectName, onBack }: Props) {
  const [enabledKinds, setEnabledKinds] = useState<Set<EdgeKind>>(new Set(ALL_KINDS));
  const [stackFilter, setStackFilter] = useState<Set<string>>(new Set()); // empty = all
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Topology filtered by stack + search + enabled layers.
  const { baseNodes, baseEdges } = useMemo(() => {
    const stackOk = (sid: string) => stackFilter.size === 0 || stackFilter.has(sid);
    const q = search.trim().toLowerCase();
    const searchOk = (n: SolvisGraph['nodes'][number]) =>
      q === '' || n.title.toLowerCase().includes(q) || n.resourceType.toLowerCase().includes(q);

    const nodes = graph.nodes.filter((n) => stackOk(n.stackId) && searchOk(n));
    const visible = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter(
      (e) => enabledKinds.has(e.kind) && visible.has(e.source) && visible.has(e.target),
    );
    return { baseNodes: nodes, baseEdges: edges };
  }, [graph, stackFilter, search, enabledKinds]);

  // Layout positions, recomputed only when the visible topology changes.
  const positioned = useMemo(() => {
    const rfNodes: Node<ResourceNodeData>[] = baseNodes.map((n) => ({
      id: n.id,
      type: 'resource',
      position: { x: 0, y: 0 },
      data: { title: n.title, shortType: shortType(n.resourceType), category: n.category, dimmed: false },
    }));
    const rfEdges: Edge[] = baseEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      data: { kind: e.kind },
    }));
    return { rfNodes: layout(rfNodes, rfEdges), rfEdges };
  }, [baseNodes, baseEdges]);

  const neighborIds = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const e of baseEdges) {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [selectedId, baseEdges]);

  const { nodes, edges } = useMemo(() => {
    const styledNodes = positioned.rfNodes.map((n) => ({
      ...n,
      selected: n.id === selectedId,
      data: { ...n.data, dimmed: neighborIds ? !neighborIds.has(n.id) : false },
    }));
    const styledEdges: Edge[] = positioned.rfEdges.map((e) => {
      const kind = (e.data as { kind: EdgeKind }).kind;
      const active = !neighborIds || (neighborIds.has(e.source) && neighborIds.has(e.target));
      return {
        ...e,
        animated: kind === 'dataflow',
        selected: e.id === selectedEdgeId,
        style: {
          stroke: EDGE_STYLE[kind].color,
          opacity: active ? 0.9 : 0.12,
          strokeWidth: e.id === selectedEdgeId ? 2.5 : 1.5,
        },
        labelStyle: { fontSize: 10, fill: '#444' },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.8 },
      };
    });
    return { nodes: styledNodes, edges: styledEdges };
  }, [positioned, selectedId, selectedEdgeId, neighborIds]);

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) ?? undefined;
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId) ?? undefined;

  return (
    <div className="layout">
      <Sidebar
        graph={graph}
        projectName={projectName}
        onBack={onBack}
        enabledKinds={enabledKinds}
        onToggleKind={(k) =>
          setEnabledKinds((prev) => {
            const next = new Set(prev);
            next.has(k) ? next.delete(k) : next.add(k);
            return next;
          })
        }
        stackFilter={stackFilter}
        onToggleStack={(id) =>
          setStackFilter((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          })
        }
        onClearStacks={() => setStackFilter(new Set())}
        search={search}
        onSearch={setSearch}
        visibleCount={baseNodes.length}
      />

      <div className="canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={(_, n) => {
            setSelectedId(n.id);
            setSelectedEdgeId(null);
          }}
          onEdgeClick={(_, e) => {
            setSelectedEdgeId(e.id);
            setSelectedId(null);
          }}
          onPaneClick={() => {
            setSelectedId(null);
            setSelectedEdgeId(null);
          }}
          minZoom={0.05}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="#eef0f3" />
          <Controls />
          <MiniMap
            nodeColor={(n) => CATEGORY_COLOR[(n.data as ResourceNodeData).category] ?? '#999'}
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      <aside className="inspector">
        <DetailPanel
          graph={graph}
          node={selectedNode}
          edge={selectedEdge}
          onSelectNode={(id) => {
            setSelectedId(id);
            setSelectedEdgeId(null);
          }}
        />
      </aside>
    </div>
  );
}
