import type { LoadedTemplate } from '../cfn/template.js';
import type { BuildWarning, SolvisEdge, SolvisNode } from '../types.js';

/** An export discovered in some stack's Outputs, with the resource it points at. */
export interface ExportEntry {
  exportName: string;
  stackId: string;
  outputId: string;
  /** Node id the output's Value resolves to (a Ref/GetAtt to a resource), if any. */
  targetNodeId?: string;
}

/** Shared state threaded through the build + edge rules. */
export interface BuildContext {
  templates: LoadedTemplate[];
  /** nodeId -> node. nodeId is `${stackId}::${logicalId}`. */
  nodes: Map<string, SolvisNode>;
  /** stackId -> known string values (param defaults + pseudo params) for resolution. */
  stackValues: Map<string, Record<string, string>>;
  /** Resolved export name -> entry. */
  exportsByName: Map<string, ExportEntry>;
  edges: SolvisEdge[];
  warnings: BuildWarning[];
}

/** Construct the canonical node id for a logical id within a stack. */
export function nodeId(stackId: string, logicalId: string): string {
  return `${stackId}::${logicalId}`;
}

/** Push an edge, de-duplicating identical (source,target,kind,label) tuples. */
export function addEdge(ctx: BuildContext, edge: Omit<SolvisEdge, 'id'>): void {
  const id = `${edge.kind}:${edge.source}->${edge.target}:${edge.label ?? ''}`;
  if (ctx.edges.some((e) => e.id === id)) return;
  ctx.edges.push({ id, ...edge });
}
