# Solvis

Statically parse an AWS CloudFormation project and generate an **interactive web
diagram** of the whole solution — every resource, how it's wired (references &
cross-stack imports), the data flows between services, and the IAM
roles/permissions connecting actions to resources.

No AWS credentials, no deploy. Solvis reads the IaC in a repo and renders the
*declared* state as an explorable picture you can hover, click, filter, and search.

## Quick start

```bash
npm install
npm run build      # builds core → server → web → cli

# Start the local server + Projects web UI:
node packages/cli/dist/index.js          # → http://localhost:4500 (opens browser)
```

In the UI: **Add a project** → type or browse to a CloudFormation repo (e.g.
`~/path/to/your-cfn-project`) → it parses and renders. Projects persist in
`~/.solvis/`, and editing the project's templates **live-refreshes** the diagram.

Once published this is just:

```bash
npx solvis                                   # same Projects UI, no install
npx solvis build ~/path/to/your-cfn-project --out ./out   # static export
npx solvis serve ./out                       # view a static export
```

### Static export (shareable / CI)

```bash
node packages/cli/dist/index.js build ~/path/to/your-cfn-project --out .solvis-out
node packages/cli/dist/index.js serve .solvis-out   # → http://localhost:4500
```

The export is a self-contained folder (`graph.json` + viewer with the graph injected)
you can host or hand to a teammate — no server needed.

## What you get

- **Nodes** — one per CloudFormation resource, colored by category (compute,
  storage, database, network, security, identity, integration, frontend,
  observability).
- **Edges**, as toggleable layers:
  - **Reference** — `Ref`/`GetAtt`/`DependsOn` wiring within a stack.
  - **Cross-stack** — `Export` ↔ `Fn::ImportValue` links between stacks.
  - **IAM** — role → action → resource permissions (+ trust principals).
  - **Data flow** — semantic runtime flows *(Milestone 2)*.
- **Inspect** — click any node/edge for its type, source template, properties,
  IAM policy, and what it connects to. Search, filter by stack, dim to neighbors.

## Architecture

npm-workspaces monorepo:

| Package | Role |
|---------|------|
| `@solvis/core`   | Parser + graph engine. CFN YAML → `SolvisGraph` (nodes + edges). Pure, no I/O. |
| `@solvis/server` | Filesystem: discovery, graph pipeline, Projects store (`~/.solvis`), file-watch, HTTP + SSE API, static export. |
| `@solvis/cli`    | Thin dispatcher: `solvis` (UI) / `solvis build` / `solvis serve`. |
| `@solvis/web`    | Vite + React + React Flow viewer. Projects dashboard + per-project diagram, or a single injected graph for static exports. |

The `SolvisGraph` JSON (`@solvis/core` `src/types.ts`) is the contract between the
engine and the viewer.

See [CLAUDE.md](./CLAUDE.md) for design decisions, conventions, and the roadmap.

## Status

v1 in progress — visualization-first, general-purpose, static parsing of
CloudFormation. Verified against a real-world 24-stack project
(251 resources, 377 edges). Data-flow layer, correctness checks, and live-AWS
reconciliation are on the roadmap.

Contributions welcome — fork it, open a PR, and I'll review when I get a chance.

## License

[MIT](./LICENSE) © Christopher Jude
