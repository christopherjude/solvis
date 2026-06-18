export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string>;
}

/**
 * Minimal flag parser. `--key value` sets a string; a bare `--flag` (followed by
 * another flag or nothing) sets `'true'`. `--no-x` sets `x` to `'false'`.
 */
export function parseFlags(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key.startsWith('no-')) {
        flags[key.slice(3)] = 'false';
        continue;
      }
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}
