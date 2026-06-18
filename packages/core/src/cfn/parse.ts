import yaml from 'js-yaml';
import type { CfnTemplate } from './template.js';

/**
 * CloudFormation uses YAML short-form intrinsic tags (`!Ref`, `!GetAtt`, `!Sub`, ...)
 * that a vanilla YAML parser rejects. We register a custom schema that maps every
 * short tag to its canonical long form (`{ "Fn::X": ... }`, or `{ "Ref": ... }`)
 * so the rest of the engine only ever deals with one shape.
 *
 * Reference: the short tag `!Foo bar` is equivalent to `{ "Fn::Foo": bar }`,
 * except `!Ref` -> `{ "Ref": ... }` and `!Condition` / `!GetAtt` special cases.
 */

const INTRINSIC_TAGS = [
  'Ref',
  'Condition',
  'Base64',
  'Cidr',
  'FindInMap',
  'GetAtt',
  'GetAZs',
  'ImportValue',
  'Join',
  'Select',
  'Split',
  'Sub',
  'Transform',
  'And',
  'Equals',
  'If',
  'Not',
  'Or',
  'ForEach',
  'Length',
  'ToJsonString',
] as const;

/** `!Ref` and `!Condition` use the bare key; everything else is `Fn::<Tag>`. */
function longKey(tag: string): string {
  if (tag === 'Ref' || tag === 'Condition') return tag;
  return `Fn::${tag}`;
}

/** `!GetAtt Resource.Attr` is sugar for `{ "Fn::GetAtt": ["Resource", "Attr"] }`. */
function normalizeGetAtt(data: unknown): unknown {
  if (typeof data === 'string') {
    const dot = data.indexOf('.');
    if (dot === -1) return [data];
    return [data.slice(0, dot), data.slice(dot + 1)];
  }
  return data;
}

function buildSchema(): yaml.Schema {
  const types: yaml.Type[] = [];
  for (const tag of INTRINSIC_TAGS) {
    // Each intrinsic can appear with scalar, sequence, or mapping payloads.
    for (const kind of ['scalar', 'sequence', 'mapping'] as const) {
      types.push(
        new yaml.Type(`!${tag}`, {
          kind,
          // Accept any payload of this kind.
          resolve: () => true,
          construct: (data: unknown) => {
            const payload = tag === 'GetAtt' ? normalizeGetAtt(data) : data;
            return { [longKey(tag)]: payload };
          },
        }),
      );
    }
  }
  return yaml.DEFAULT_SCHEMA.extend(types);
}

const CFN_SCHEMA = buildSchema();

/**
 * Parse a CloudFormation template (YAML or JSON) into a plain object with all
 * intrinsics in long form. Throws only on genuinely unparseable input — callers
 * should catch and record a warning rather than aborting the whole build.
 */
export function parseTemplate(source: string): CfnTemplate {
  const doc = yaml.load(source, { schema: CFN_SCHEMA });
  if (doc === null || doc === undefined || typeof doc !== 'object') {
    throw new Error('template did not parse to an object');
  }
  return doc as CfnTemplate;
}
