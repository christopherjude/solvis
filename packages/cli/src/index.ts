#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import type { SolvisGraph } from '@solvis/core';
import { exportStatic, startServer } from '@solvis/server';
import { parseFlags } from './args.js';

function main(argv: string[]): void {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case 'ui':
      return runUi(rest);
    case 'build':
      return runBuild(rest);
    case 'serve':
      return runServe(rest);
    case '-h':
    case '--help':
      return printHelp();
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`solvis — interactive AWS solution visualizer

Usage:
  solvis [ui]                     Start the local server + Projects web UI (default)
  solvis build <projectDir>       Static export: write graph.json + viewer to a dir
  solvis serve [<dir>]            Serve a static export dir locally

Options:
  --port <n>     Port for ui/serve (default: 4500)
  --no-open      Don't auto-open the browser (ui)
  --out <dir>    Output directory for build (default: .solvis-out)

Examples:
  npx solvis                              # open the Projects UI, add a path in-app
  npx solvis build ~/path/to/your-cfn-project --out ./out
  npx solvis serve ./out
`);
}

function runUi(args: string[]): void {
  const { flags } = parseFlags(args);
  const port = flags.port ? Number(flags.port) : undefined;
  const open = flags.open !== 'false';
  void startServer({ port, open });
}

function runBuild(args: string[]): void {
  const { positionals, flags } = parseFlags(args);
  const projectDir = resolve(positionals[0] ?? '.');
  const outDir = resolve(flags.out ?? '.solvis-out');

  if (!existsSync(projectDir)) {
    console.error(`Project directory not found: ${projectDir}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Discovering CloudFormation templates in ${projectDir} ...`);
  const result = exportStatic(projectDir, outDir);
  console.log(`  found ${result.templateCount} template(s)`);
  for (const e of result.parseErrors) console.warn(`  ! parse error: ${e.path}: ${e.message}`);
  if (!result.viewerBundled) console.log('  (web viewer not built yet — wrote graph.json only)');

  printGraphSummary(result.graph, outDir);
}

function printGraphSummary(graph: SolvisGraph, outDir: string): void {
  const byKind = graph.edges.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log('\nGraph summary:');
  console.log(`  stacks: ${graph.stacks.length}`);
  console.log(`  nodes:  ${graph.nodes.length}`);
  console.log(`  edges:  ${graph.edges.length} (${JSON.stringify(byKind)})`);
  console.log(`  warnings: ${graph.warnings.length}`);
  console.log(`\nWrote ${join(outDir, 'graph.json')}`);
  if (existsSync(join(outDir, 'index.html'))) console.log(`View it:  solvis serve ${outDir}`);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function runServe(args: string[]): void {
  const { positionals, flags } = parseFlags(args);
  const dir = resolve(positionals[0] ?? '.solvis-out');
  const port = Number(flags.port ?? 4500);

  if (!existsSync(join(dir, 'index.html'))) {
    console.error(`No index.html in ${dir}. Run 'solvis build <projectDir> --out ${dir}' first.`);
    process.exitCode = 1;
    return;
  }

  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let filePath = join(dir, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(dir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || extname(filePath) === '') filePath = join(dir, 'index.html');
    try {
      const body = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  server.listen(port, () => console.log(`Solvis static viewer at http://localhost:${port}`));
}

main(process.argv.slice(2));
