/**
 * Reference discovery + best-effort intrinsic resolution.
 *
 * The engine doesn't fully evaluate a template (that needs deploy-time values).
 * It only needs to find *which other things a resource points at* so it can draw
 * edges, and to resolve export/import names well enough to link stacks.
 */

/** Pseudo-parameters whose presence in a Sub should NOT be treated as a resource ref. */
const PSEUDO_PARAMS = new Set([
  'AWS::AccountId',
  'AWS::Region',
  'AWS::Partition',
  'AWS::StackName',
  'AWS::StackId',
  'AWS::URLSuffix',
  'AWS::NoValue',
  'AWS::NotificationARNs',
]);

export interface Reference {
  kind: 'Ref' | 'GetAtt' | 'ImportValue' | 'Sub';
  /** Logical id (Ref/GetAtt/Sub var) or the raw import expression (ImportValue). */
  target: string;
  /** Attribute for GetAtt, e.g. `Arn`. */
  attribute?: string;
  /** Dotted property path where the reference was found. */
  path: string;
}

/** Extract `${Var}` and `${Var.Attr}` tokens from a Fn::Sub template string. */
function subVariables(tpl: string): { name: string; attribute?: string }[] {
  const out: { name: string; attribute?: string }[] = [];
  const re = /\$\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    const raw = m[1]!.trim();
    // `${!Literal}` is an escaped literal, not a reference.
    if (raw.startsWith('!')) continue;
    const dot = raw.indexOf('.');
    if (dot === -1) out.push({ name: raw });
    else out.push({ name: raw.slice(0, dot), attribute: raw.slice(dot + 1) });
  }
  return out;
}

/**
 * Walk a resolved property tree and collect every intrinsic reference to another
 * resource, parameter, or import. Local Sub variable maps (the 2nd arg of Fn::Sub)
 * are honored so locally-defined names aren't reported as external references.
 */
export function collectReferences(value: unknown, basePath = ''): Reference[] {
  const refs: Reference[] = [];

  const walk = (val: unknown, path: string): void => {
    if (val === null || typeof val !== 'object') return;

    if (Array.isArray(val)) {
      val.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }

    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj);

    // Intrinsic nodes are single-key objects.
    if (keys.length === 1) {
      const key = keys[0]!;
      const payload = obj[key];

      if (key === 'Ref' && typeof payload === 'string') {
        refs.push({ kind: 'Ref', target: payload, path });
        return;
      }
      if (key === 'Fn::GetAtt') {
        const arr = Array.isArray(payload) ? payload : [];
        const target = typeof arr[0] === 'string' ? arr[0] : undefined;
        if (target) {
          const attribute = typeof arr[1] === 'string' ? arr[1] : undefined;
          refs.push({ kind: 'GetAtt', target, attribute, path });
        }
        return;
      }
      if (key === 'Fn::ImportValue') {
        // Payload may be a plain export name or a nested intrinsic (often Fn::Sub).
        if (typeof payload === 'string') {
          refs.push({ kind: 'ImportValue', target: payload, path });
        } else {
          // Record the expression and keep walking so nested refs are captured too.
          refs.push({ kind: 'ImportValue', target: stringifyExpr(payload), path });
          walk(payload, `${path}.Fn::ImportValue`);
        }
        return;
      }
      if (key === 'Fn::Sub') {
        const { tpl, localVars } = readSub(payload);
        if (tpl !== undefined) {
          for (const v of subVariables(tpl)) {
            if (PSEUDO_PARAMS.has(v.name)) continue;
            if (localVars.has(v.name)) continue;
            refs.push({ kind: 'Sub', target: v.name, attribute: v.attribute, path });
          }
        }
        // Walk the variable-map values, which can themselves hold intrinsics.
        if (Array.isArray(payload) && payload[1] && typeof payload[1] === 'object') {
          walk(payload[1], `${path}.Fn::Sub`);
        }
        return;
      }
    }

    for (const key of keys) walk(obj[key], path ? `${path}.${key}` : key);
  };

  walk(value, basePath);
  return refs;
}

/** Fn::Sub is either a string or `[template, { var: value }]`. */
function readSub(payload: unknown): { tpl?: string; localVars: Set<string> } {
  if (typeof payload === 'string') return { tpl: payload, localVars: new Set() };
  if (Array.isArray(payload)) {
    const tpl = typeof payload[0] === 'string' ? payload[0] : undefined;
    const localVars = new Set<string>();
    if (payload[1] && typeof payload[1] === 'object' && !Array.isArray(payload[1])) {
      for (const k of Object.keys(payload[1] as Record<string, unknown>)) localVars.add(k);
    }
    return { tpl, localVars };
  }
  return { localVars: new Set() };
}

function stringifyExpr(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Best-effort resolution of an intrinsic value to a concrete string, using a map of
 * known parameter/pseudo values. Returns undefined when it can't be resolved
 * statically (e.g. a GetAtt whose runtime value is unknown). Used mainly to turn
 * Export names and ImportValue expressions into comparable strings.
 */
export function resolveToString(
  value: unknown,
  values: Record<string, string>,
): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || typeof value !== 'object') return undefined;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return undefined;
  const key = keys[0]!;
  const payload = obj[key];

  if (key === 'Ref' && typeof payload === 'string') {
    return values[payload];
  }
  if (key === 'Fn::Sub') {
    const { tpl } = readSub(payload);
    if (tpl === undefined) return undefined;
    let resolved = tpl;
    let ok = true;
    // Replace escaped `${!x}` first to avoid clobbering.
    resolved = resolved.replace(/\$\{!([^}]+)\}/g, '${$1}');
    resolved = resolved.replace(/\$\{([^}]+)\}/g, (_full, rawName: string) => {
      const name = rawName.trim();
      if (name in values) return values[name]!;
      ok = false;
      return `\${${name}}`;
    });
    return ok ? resolved : undefined;
  }
  if (key === 'Fn::Join') {
    if (!Array.isArray(payload) || payload.length !== 2) return undefined;
    const sep = typeof payload[0] === 'string' ? payload[0] : undefined;
    const parts = payload[1];
    if (sep === undefined || !Array.isArray(parts)) return undefined;
    const resolvedParts = parts.map((p) => resolveToString(p, values));
    if (resolvedParts.some((p) => p === undefined)) return undefined;
    return resolvedParts.join(sep);
  }
  return undefined;
}

export { PSEUDO_PARAMS };
