import { describe, expect, it } from 'vitest';
import { parseFlags } from '../src/args.js';

describe('parseFlags', () => {
  it('collects positionals and --key value flags', () => {
    const { positionals, flags } = parseFlags(['build', '/some/dir', '--out', './out', '--port', '5000']);
    expect(positionals).toEqual(['build', '/some/dir']);
    expect(flags).toEqual({ out: './out', port: '5000' });
  });

  it('treats a bare --flag as true and --no-x as false', () => {
    const { flags } = parseFlags(['ui', '--no-open', '--verbose']);
    expect(flags.open).toBe('false');
    expect(flags.verbose).toBe('true');
  });
});
