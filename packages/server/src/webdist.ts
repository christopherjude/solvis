import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the built @solvis/web dist directory. Works both in the dev monorepo
 * (dist sits next to this package) and when published (web bundled into the package).
 */
export function findWebDist(): string | undefined {
  const candidates = [
    resolve(HERE, '../web'), // published: bundled copy
    resolve(HERE, '../../web/dist'), // dev: dist/ -> packages/server, web at packages/web/dist
    resolve(HERE, '../../../web/dist'),
    resolve(HERE, '../../packages/web/dist'),
  ];
  return candidates.find((c) => existsSync(join(c, 'index.html')));
}
