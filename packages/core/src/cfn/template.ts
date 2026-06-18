/** Minimal structural types for a parsed CloudFormation template. */

export interface CfnResource {
  Type: string;
  Properties?: Record<string, unknown>;
  DependsOn?: string | string[];
  Condition?: string;
  Metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CfnParameter {
  Type?: string;
  Default?: unknown;
  Description?: string;
  [key: string]: unknown;
}

export interface CfnOutput {
  Value?: unknown;
  Description?: string;
  Export?: { Name?: unknown };
  [key: string]: unknown;
}

export interface CfnTemplate {
  AWSTemplateFormatVersion?: string;
  Description?: string;
  Parameters?: Record<string, CfnParameter>;
  Mappings?: Record<string, unknown>;
  Conditions?: Record<string, unknown>;
  Resources?: Record<string, CfnResource>;
  Outputs?: Record<string, CfnOutput>;
  [key: string]: unknown;
}

/** A template loaded from disk, ready for the graph builder. */
export interface LoadedTemplate {
  /** Stable stack id (derived by the caller, usually from the path). */
  stackId: string;
  /** Display name for the stack. */
  stackName: string;
  /** Source path. */
  templatePath: string;
  /** Parsed template (intrinsics in long `Fn::X` form). */
  template: CfnTemplate;
}
