import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { generateGraph, type GraphResult } from './pipeline.js';
import {
  addProject,
  getProject,
  listProjects,
  removeProject,
  type Project,
} from './store.js';
import { ProjectWatcher } from './watch.js';
import { findWebDist } from './webdist.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

interface CacheEntry {
  result?: GraphResult;
  error?: string;
  lastScanned?: number;
}

export interface StartServerOptions {
  port?: number;
  open?: boolean;
  /** Injectable clock for testing; defaults to Date.now at call sites. */
}

export interface RunningServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export function startServer(opts: StartServerOptions = {}): Promise<RunningServer> {
  const requestedPort = opts.port ?? 4500;
  const webDist = findWebDist();
  const cache = new Map<string, CacheEntry>();
  const watchers = new Map<string, ProjectWatcher>();
  const sseClients = new Set<ServerResponse>();

  const now = (): number => Date.now();

  function broadcast(event: Record<string, unknown>): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) client.write(payload);
  }

  function scan(project: Project): CacheEntry {
    try {
      const result = generateGraph(project.path);
      const entry: CacheEntry = { result, lastScanned: now() };
      cache.set(project.id, entry);
      return entry;
    } catch (err) {
      const entry: CacheEntry = { error: err instanceof Error ? err.message : String(err), lastScanned: now() };
      cache.set(project.id, entry);
      return entry;
    }
  }

  function ensureWatcher(project: Project): void {
    if (watchers.has(project.id)) return;
    const watcher = new ProjectWatcher(project.path, () => {
      scan(project);
      broadcast({ type: 'graph-updated', projectId: project.id });
    });
    watcher.start();
    watchers.set(project.id, watcher);
  }

  function summary(project: Project): Record<string, unknown> {
    const entry = cache.get(project.id);
    return {
      ...project,
      resourceCount: entry?.result?.graph.nodes.length,
      stackCount: entry?.result?.graph.stacks.length,
      warningCount: entry?.result?.graph.warnings.length,
      lastScanned: entry?.lastScanned,
      error: entry?.error,
    };
  }

  // Start watchers for already-registered projects so edits refresh even pre-open.
  for (const p of listProjects()) ensureWatcher(p);

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // ---- API ----
    if (path === '/api/health') return json(res, 200, { ok: true });

    if (path === '/api/projects' && method === 'GET') {
      return json(res, 200, { projects: listProjects().map(summary) });
    }

    if (path === '/api/projects' && method === 'POST') {
      const body = await readJson(req);
      const rawPath = typeof body.path === 'string' ? body.path : '';
      if (!rawPath) return json(res, 400, { error: 'path is required' });
      const absPath = resolve(rawPath.replace(/^~(?=\/|$)/, homedir()));
      if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
        return json(res, 400, { error: `Not a directory: ${absPath}` });
      }
      const { project, created } = addProject(absPath, typeof body.name === 'string' ? body.name : undefined, now());
      scan(project);
      ensureWatcher(project);
      broadcast({ type: 'projects-changed' });
      return json(res, created ? 201 : 200, { project: summary(project) });
    }

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)(\/[a-z]+)?$/);
    if (projectMatch) {
      const id = projectMatch[1]!;
      const sub = projectMatch[2];
      const project = getProject(id);
      if (!project) return json(res, 404, { error: 'project not found' });

      if (!sub && method === 'DELETE') {
        removeProject(id);
        watchers.get(id)?.stop();
        watchers.delete(id);
        cache.delete(id);
        broadcast({ type: 'projects-changed' });
        return json(res, 200, { ok: true });
      }

      if (sub === '/graph' && method === 'GET') {
        let entry = cache.get(id);
        if (!entry) entry = scan(project);
        if (entry.error) return json(res, 500, { error: entry.error, project: summary(project) });
        return json(res, 200, {
          project: summary(project),
          graph: entry.result!.graph,
          templateCount: entry.result!.templateCount,
          parseErrors: entry.result!.parseErrors,
        });
      }

      if (sub === '/rescan' && method === 'POST') {
        const entry = scan(project);
        broadcast({ type: 'graph-updated', projectId: id });
        return json(res, 200, { project: summary(project), error: entry.error });
      }
    }

    if (path === '/api/fs' && method === 'GET') {
      return json(res, 200, browseDir(url.searchParams.get('dir')));
    }

    if (path === '/api/events') return sse(req, res, sseClients);

    // ---- Static viewer ----
    return serveStaticFile(res, webDist, path);
  }

  return new Promise((resolvePromise) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${requestedPort} is in use. Try: solvis --port <other>`);
        process.exit(1);
      }
      throw err;
    });
    server.listen(requestedPort, () => {
      const port = (server.address() as { port: number }).port;
      const url = `http://localhost:${port}`;
      if (!webDist) {
        console.warn('Web viewer not built — API is up but the UI is unavailable. Run: npm run build -w @solvis/web');
      }
      console.log(`Solvis running at ${url}`);
      if (opts.open) openBrowser(url);
      resolvePromise({
        url,
        port,
        close: () =>
          new Promise<void>((done) => {
            for (const w of watchers.values()) w.stop();
            for (const c of sseClients) c.end();
            server.close(() => done());
          }),
      });
    });
  });
}

// ---- helpers ----

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sse(req: IncomingMessage, res: ServerResponse, clients: Set<ServerResponse>): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');
  clients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

interface FsListing {
  dir: string;
  parent: string | null;
  entries: { name: string; path: string }[];
}

/** List immediate subdirectories of `dir` (default: home) for the in-UI path picker. */
function browseDir(dirParam: string | null): FsListing {
  const dir = dirParam ? resolve(dirParam.replace(/^~(?=\/|$)/, homedir())) : homedir();
  let entries: { name: string; path: string }[] = [];
  try {
    entries = readdirSync(dir)
      .filter((name) => !name.startsWith('.'))
      .map((name) => ({ name, path: join(dir, name) }))
      .filter((e) => {
        try {
          return statSync(e.path).isDirectory();
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    entries = [];
  }
  const parent = resolve(dir, '..');
  return { dir, parent: parent === dir ? null : parent, entries };
}

function serveStaticFile(res: ServerResponse, webDist: string | undefined, urlPath: string): void {
  if (!webDist) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Web viewer not built. Run: npm run build -w @solvis/web');
    return;
  }
  const rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  let filePath = join(webDist, rel);
  if (!filePath.startsWith(webDist)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  // SPA fallback: unknown non-asset routes serve index.html.
  if (!existsSync(filePath) || statSafeIsDir(filePath)) filePath = join(webDist, 'index.html');
  try {
    const body = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

function statSafeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // ignore — URL is printed regardless
  }
}
