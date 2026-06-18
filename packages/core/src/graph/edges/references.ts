import { collectReferences, resolveToString } from '../../cfn/intrinsics.js';
import type { CfnResource } from '../../cfn/template.js';
import { addEdge, nodeId, type BuildContext } from '../context.js';

/**
 * Intra-stack reference edges (Ref / GetAtt / Sub var / DependsOn) and cross-stack
 * edges (Fn::ImportValue -> the exporting stack's resource).
 */
export function referenceEdges(ctx: BuildContext): void {
  for (const t of ctx.templates) {
    const resources = t.template.Resources ?? {};
    for (const [logicalId, resource] of Object.entries(resources)) {
      const source = nodeId(t.stackId, logicalId);
      if (!ctx.nodes.has(source)) continue;

      // DependsOn -> explicit dependency edges.
      const dependsOn = normalizeDependsOn((resource as CfnResource).DependsOn);
      for (const dep of dependsOn) {
        const target = nodeId(t.stackId, dep);
        if (ctx.nodes.has(target)) {
          addEdge(ctx, { source, target, kind: 'reference', label: 'DependsOn' });
        }
      }

      // Intrinsic references inside Properties.
      const props = (resource as CfnResource).Properties ?? {};
      for (const ref of collectReferences(props)) {
        if (ref.kind === 'ImportValue') {
          linkImport(ctx, source, ref.target, t.stackId);
          continue;
        }
        // Ref/GetAtt/Sub: target is a logical id within the same stack (or a param).
        const target = nodeId(t.stackId, ref.target);
        if (!ctx.nodes.has(target) || target === source) continue;
        const label =
          ref.kind === 'GetAtt'
            ? `GetAtt ${ref.attribute ?? ''}`.trim()
            : ref.kind === 'Sub'
              ? 'Sub'
              : 'Ref';
        addEdge(ctx, { source, target, kind: 'reference', label, detail: { path: ref.path } });
      }
    }
  }
}

function normalizeDependsOn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/**
 * Resolve a Fn::ImportValue target to an exporting resource and draw a cross-stack edge.
 * Tries an exact resolved-name match first, then a unique static-suffix match.
 */
function linkImport(ctx: BuildContext, source: string, importExpr: string, stackId: string): void {
  const values = ctx.stackValues.get(stackId) ?? {};

  // `importExpr` is either a literal export name or a JSON-stringified intrinsic.
  let resolved: string | undefined = importExpr;
  let parsed: unknown;
  if (importExpr.startsWith('{')) {
    try {
      parsed = JSON.parse(importExpr);
      resolved = resolveToString(parsed, values);
    } catch {
      parsed = undefined;
    }
  }

  if (resolved && ctx.exportsByName.has(resolved)) {
    drawCrossStack(ctx, source, ctx.exportsByName.get(resolved)!, resolved);
    return;
  }

  // Fallback: match by the literal tail of the import expression.
  const suffix = staticSuffix(parsed ?? importExpr);
  if (suffix && suffix.length > 1) {
    const matches = [...ctx.exportsByName.entries()].filter(([name]) => name.endsWith(suffix));
    if (matches.length === 1) {
      drawCrossStack(ctx, source, matches[0]![1], matches[0]![0]);
      return;
    }
  }

  ctx.warnings.push({
    code: 'unresolved-import',
    message: `Could not resolve Fn::ImportValue ${resolved ?? importExpr}`,
    nodeId: source,
    stackId,
  });
}

function drawCrossStack(
  ctx: BuildContext,
  source: string,
  entry: { targetNodeId?: string; exportName?: string },
  exportName: string,
): void {
  if (!entry.targetNodeId || !ctx.nodes.has(entry.targetNodeId)) return;
  addEdge(ctx, {
    source,
    target: entry.targetNodeId,
    kind: 'cross-stack',
    label: 'ImportValue',
    detail: { exportName },
  });
}

/** The longest literal tail of a Sub-like expression after its last `${...}` token. */
function staticSuffix(expr: unknown): string | undefined {
  let tpl: string | undefined;
  if (typeof expr === 'string') tpl = expr;
  else if (expr && typeof expr === 'object') {
    const o = expr as Record<string, unknown>;
    const sub = o['Fn::Sub'];
    if (typeof sub === 'string') tpl = sub;
    else if (Array.isArray(sub) && typeof sub[0] === 'string') tpl = sub[0];
  }
  if (!tpl) return undefined;
  const lastClose = tpl.lastIndexOf('}');
  return lastClose === -1 ? tpl : tpl.slice(lastClose + 1);
}
