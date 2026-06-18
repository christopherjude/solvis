import { collectReferences, resolveToString } from '../cfn/intrinsics.js';
import type { CfnParameter, CfnResource, LoadedTemplate } from '../cfn/template.js';
import {
  GRAPH_VERSION,
  type SolvisGraph,
  type SolvisNode,
  type StackInfo,
} from '../types.js';
import { nodeId, type BuildContext, type ExportEntry } from './context.js';
import { referenceEdges } from './edges/references.js';
import { iamEdges } from './edges/iam.js';
import { specFor } from './resources.js';

/**
 * Build a complete SolvisGraph from already-parsed templates.
 *
 * Pure: no filesystem access — the CLI discovers/reads/parses and passes templates in.
 * Best-effort: malformed or unresolved constructs become warnings, never throw.
 */
export function buildGraph(templates: LoadedTemplate[]): SolvisGraph {
  const ctx: BuildContext = {
    templates,
    nodes: new Map<string, SolvisNode>(),
    stackValues: new Map<string, Record<string, string>>(),
    exportsByName: new Map<string, ExportEntry>(),
    edges: [],
    warnings: [],
  };

  buildNodes(ctx);
  buildStackValues(ctx);
  buildExportIndex(ctx);

  referenceEdges(ctx);
  iamEdges(ctx);

  return assemble(ctx);
}

function buildNodes(ctx: BuildContext): void {
  for (const t of ctx.templates) {
    const resources = t.template.Resources ?? {};
    for (const [logicalId, raw] of Object.entries(resources)) {
      const resource = raw as CfnResource;
      if (!resource || typeof resource.Type !== 'string') {
        ctx.warnings.push({
          code: 'invalid-resource',
          message: `Resource ${logicalId} has no Type`,
          stackId: t.stackId,
        });
        continue;
      }
      const spec = specFor(resource.Type);
      const props = resource.Properties ?? {};
      const id = nodeId(t.stackId, logicalId);
      ctx.nodes.set(id, {
        id,
        logicalId,
        stackId: t.stackId,
        resourceType: resource.Type,
        category: spec.category,
        title: logicalId,
        keyProperties: pickKeyProps(props, spec.keyProps),
        properties: props,
      });
    }
  }
}

function pickKeyProps(
  props: Record<string, unknown>,
  keyProps: string[] | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keyProps ?? []) {
    if (k in props) out[k] = props[k];
  }
  return out;
}

/** Per-stack string values usable for resolving Sub / export names. */
function buildStackValues(ctx: BuildContext): void {
  for (const t of ctx.templates) {
    const values: Record<string, string> = {
      'AWS::StackName': t.stackName,
    };
    const params = t.template.Parameters ?? {};
    for (const [name, param] of Object.entries(params)) {
      const def = (param as CfnParameter).Default;
      if (typeof def === 'string') values[name] = def;
      else if (typeof def === 'number' || typeof def === 'boolean') values[name] = String(def);
    }
    ctx.stackValues.set(t.stackId, values);
  }
}

/** Map each resolvable Export.Name to the resource its Output.Value points at. */
function buildExportIndex(ctx: BuildContext): void {
  for (const t of ctx.templates) {
    const outputs = t.template.Outputs ?? {};
    const values = ctx.stackValues.get(t.stackId) ?? {};
    for (const [outputId, output] of Object.entries(outputs)) {
      const exportName = resolveToString(output?.Export?.Name, values);
      if (!exportName) continue;

      // Resolve the output Value to a node (first Ref/GetAtt to a local resource).
      let targetNodeId: string | undefined;
      for (const ref of collectReferences(output?.Value)) {
        if (ref.kind === 'Ref' || ref.kind === 'GetAtt' || ref.kind === 'Sub') {
          const candidate = nodeId(t.stackId, ref.target);
          if (ctx.nodes.has(candidate)) {
            targetNodeId = candidate;
            break;
          }
        }
      }

      if (ctx.exportsByName.has(exportName)) {
        ctx.warnings.push({
          code: 'duplicate-export',
          message: `Export name ${exportName} declared more than once`,
          stackId: t.stackId,
        });
        continue;
      }
      ctx.exportsByName.set(exportName, { exportName, stackId: t.stackId, outputId, targetNodeId });
    }
  }
}

function assemble(ctx: BuildContext): SolvisGraph {
  const stacks: StackInfo[] = ctx.templates.map((t) => {
    const exportsForStack: Record<string, string> = {};
    for (const entry of ctx.exportsByName.values()) {
      if (entry.stackId === t.stackId) exportsForStack[entry.exportName] = entry.outputId;
    }
    const nodeIds = [...ctx.nodes.values()]
      .filter((n) => n.stackId === t.stackId)
      .map((n) => n.id);
    return {
      id: t.stackId,
      name: t.stackName,
      templatePath: t.templatePath,
      parameterIds: Object.keys(t.template.Parameters ?? {}),
      exports: exportsForStack,
      nodeIds,
    };
  });

  return {
    graphVersion: GRAPH_VERSION,
    stacks,
    nodes: [...ctx.nodes.values()],
    edges: ctx.edges,
    warnings: ctx.warnings,
  };
}
