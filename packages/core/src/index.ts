/** Public API of the Solvis engine. */

export * from './types.js';
export { parseTemplate } from './cfn/parse.js';
export type {
  CfnTemplate,
  CfnResource,
  CfnParameter,
  CfnOutput,
  LoadedTemplate,
} from './cfn/template.js';
export { collectReferences, resolveToString } from './cfn/intrinsics.js';
export type { Reference } from './cfn/intrinsics.js';
export { buildGraph } from './graph/build.js';
export { RESOURCE_REGISTRY, categoryFromType, specFor } from './graph/resources.js';
export type { ResourceTypeSpec } from './graph/resources.js';
