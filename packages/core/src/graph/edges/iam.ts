import { collectReferences } from '../../cfn/intrinsics.js';
import type { CfnResource } from '../../cfn/template.js';
import { addEdge, nodeId, type BuildContext } from '../context.js';

/**
 * IAM permission edges: role -> resource for each action statement that targets a
 * resource we can resolve, plus trust-principal info recorded on the role node.
 *
 * Handles inline policies on `AWS::IAM::Role` and standalone `AWS::IAM::Policy` /
 * `AWS::IAM::ManagedPolicy` resources (which reference their roles).
 */
export function iamEdges(ctx: BuildContext): void {
  for (const t of ctx.templates) {
    const resources = t.template.Resources ?? {};
    for (const [logicalId, raw] of Object.entries(resources)) {
      const resource = raw as CfnResource;
      const props = resource.Properties ?? {};

      if (resource.Type === 'AWS::IAM::Role') {
        const roleNode = nodeId(t.stackId, logicalId);
        recordTrust(ctx, roleNode, props['AssumeRolePolicyDocument']);
        for (const policy of toArray(props['Policies'])) {
          emitPolicyEdges(ctx, t.stackId, roleNode, (policy as Record<string, unknown>)?.['PolicyDocument']);
        }
      } else if (resource.Type === 'AWS::IAM::Policy' || resource.Type === 'AWS::IAM::ManagedPolicy') {
        // A policy attached to one or more roles: draw edges from each role.
        const roleRefs = collectReferences(props['Roles']);
        for (const ref of roleRefs) {
          const roleNode = nodeId(t.stackId, ref.target);
          if (ctx.nodes.has(roleNode)) {
            emitPolicyEdges(ctx, t.stackId, roleNode, props['PolicyDocument']);
          }
        }
      }
    }
  }
}

/** For each statement, link the role to every resolvable resource it grants access to. */
function emitPolicyEdges(
  ctx: BuildContext,
  stackId: string,
  roleNode: string,
  policyDocument: unknown,
): void {
  if (!ctx.nodes.has(roleNode)) return;
  for (const stmt of statementsOf(policyDocument)) {
    const actions = toArray(stmt['Action']).filter((a): a is string => typeof a === 'string');
    const label = summarizeActions(actions);
    const resourceRefs = collectReferences(stmt['Resource']);
    for (const ref of resourceRefs) {
      if (ref.kind === 'ImportValue') continue; // cross-stack ARN; skip for now
      const target = nodeId(stackId, ref.target);
      if (!ctx.nodes.has(target) || target === roleNode) continue;
      addEdge(ctx, {
        source: roleNode,
        target,
        kind: 'iam',
        label,
        detail: { actions },
      });
    }
  }
}

/** Record which principals may assume a role onto its node's key properties. */
function recordTrust(ctx: BuildContext, roleNode: string, assumeDoc: unknown): void {
  const node = ctx.nodes.get(roleNode);
  if (!node) return;
  const principals: string[] = [];
  for (const stmt of statementsOf(assumeDoc)) {
    const principal = stmt['Principal'];
    if (principal && typeof principal === 'object') {
      for (const v of Object.values(principal as Record<string, unknown>)) {
        for (const p of toArray(v)) if (typeof p === 'string') principals.push(p);
      }
    }
  }
  if (principals.length) node.keyProperties['trustedPrincipals'] = principals;
}

function statementsOf(policyDocument: unknown): Record<string, unknown>[] {
  if (!policyDocument || typeof policyDocument !== 'object') return [];
  const stmt = (policyDocument as Record<string, unknown>)['Statement'];
  return toArray(stmt).filter(
    (s): s is Record<string, unknown> => !!s && typeof s === 'object' && !Array.isArray(s),
  );
}

function summarizeActions(actions: string[]): string {
  if (actions.length === 0) return 'allow';
  if (actions.length <= 2) return actions.join(', ');
  return `${actions[0]} +${actions.length - 1}`;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
