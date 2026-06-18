/**
 * The SolvisGraph data contract.
 *
 * This is the single source of truth shared between the engine (@solvis/core),
 * the CLI, and the web viewer. The viewer consumes this JSON and never parses
 * CloudFormation itself. Keep it stable and bump `graphVersion` on breaking changes.
 */

export const GRAPH_VERSION = 1 as const;

/** Broad grouping used for layout, color, and filtering in the viewer. */
export type Category =
  | 'compute'
  | 'storage'
  | 'database'
  | 'network'
  | 'security'
  | 'integration'
  | 'identity'
  | 'frontend'
  | 'observability'
  | 'other';

/** The kind of relationship an edge represents. Drives the toggleable layers. */
export type EdgeKind =
  | 'reference' // CFN Ref/GetAtt/DependsOn within a stack
  | 'cross-stack' // Export <-> Fn::ImportValue between stacks
  | 'iam' // role -> action -> resource, or principal -> assume
  | 'dataflow'; // semantic runtime flow (API->Lambda, Lambda->DDB, SNS/SQS, ...)

/** A single deployable stack — one CloudFormation template. */
export interface StackInfo {
  /** Stable id derived from the template path / declared name. */
  id: string;
  /** Human-friendly name (declared name or derived from path). */
  name: string;
  /** Absolute or project-relative path to the source template. */
  templatePath: string;
  /** Logical ids of parameters declared by the stack. */
  parameterIds: string[];
  /** Export name -> output logical id, for cross-stack resolution. */
  exports: Record<string, string>;
  /** Node ids of resources belonging to this stack. */
  nodeIds: string[];
}

/** One CloudFormation resource = one node in the graph. */
export interface SolvisNode {
  /** Globally unique: `${stackId}::${logicalId}`. */
  id: string;
  /** The resource's logical id within its stack. */
  logicalId: string;
  /** Owning stack id. */
  stackId: string;
  /** CloudFormation type, e.g. `AWS::Lambda::Function`. */
  resourceType: string;
  /** Broad category for layout/color. */
  category: Category;
  /** Display label. */
  title: string;
  /** Selected high-signal properties for the detail panel. */
  keyProperties: Record<string, unknown>;
  /** Raw resource Properties (intrinsics in long form), for full inspection. */
  properties: Record<string, unknown>;
  /** True for synthesized placeholders (e.g. unresolved external imports). */
  external?: boolean;
}

/** A directed relationship between two nodes. */
export interface SolvisEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  kind: EdgeKind;
  /** Short label, e.g. `GetAtt Arn`, `sqs:SendMessage`, `invokes`. */
  label?: string;
  /** Free-form details for the inspector (actions, property path, etc.). */
  detail?: Record<string, unknown>;
}

/** A non-fatal issue recorded during the build. The build never throws on real input. */
export interface BuildWarning {
  /** Machine code, e.g. `unresolved-import`, `parse-error`. */
  code: string;
  message: string;
  stackId?: string;
  nodeId?: string;
}

/** The complete output of the engine. */
export interface SolvisGraph {
  graphVersion: typeof GRAPH_VERSION;
  stacks: StackInfo[];
  nodes: SolvisNode[];
  edges: SolvisEdge[];
  warnings: BuildWarning[];
}
