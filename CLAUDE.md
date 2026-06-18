# Solvis

**Solvis** ("solution visualizer") is a general-purpose tool that statically parses an
AWS Infrastructure-as-Code project and generates an **interactive web diagram** of the
whole cloud solution: what resources exist, where they're deployed, how data flows
between them, and what IAM roles/permissions connect which actions to which resources.

You point it at a repo, it reads the IaC (CloudFormation first), and produces a single
explorable picture you can hover and click to inspect any part of the solution.

## Why this exists

Real cloud solutions — many CloudFormation templates spanning multiple accounts, with
dozens of IAM roles and Lambdas wired together by cross-stack `Export`/`ImportValue` —
get too complex to hold in your head. Solvis gives one place to see the entire declared
state and drill into any node.

## Product goals

1. **One picture of the whole solution** — every resource as a node, every relationship
   as an edge, grouped by stack/account.
2. **Inspect any part** — hover/click a node or edge to see its config, properties, IAM
   policy, source template + line, and what it connects to.
3. **Three relationship layers**, toggleable:
   - **Reference** — CFN `Ref`/`GetAtt`/`DependsOn`/`ImportValue` wiring.
   - **Data flow** — who sends/receives data (API GW→Lambda, Lambda→DynamoDB, SNS/SQS,
     Cognito triggers, event source mappings, cross-account `sts:AssumeRole`).
   - **Permissions** — role → action → resource, who can assume what.
4. **General-purpose** — works on any AWS CloudFormation/SAM project. No
   project-specific conventions hardcoded in the engine.

## Locked design decisions

These were chosen deliberately (2026-06-18). Don't relitigate without the user.

| Decision | Choice | Implication |
|----------|--------|-------------|
| Data source | **Static repo parsing only** | No AWS creds. Parse CFN/code/CI from disk. Shows *declared* state. Live-AWS reconciliation is a future phase — keep the graph model source-agnostic so it can merge later. |
| Tool stack | **TypeScript end-to-end** | One language, shared types from parser to UI. |
| Scope | **General-purpose from day one** | Engine knows generic CFN + AWS resource semantics. Project specifics live in input, never in code. |
| v1 scope | **Visualization first** | v1 = render + explore. Correctness checks (broad IAM, orphaned resources, dangling imports, unencrypted, public-without-authorizer) are **v2** — design the model to carry findings later, but don't build the checks yet. |

## Architecture

Monorepo, npm workspaces (no pnpm on this machine). Four packages:

```
packages/
  core/    @solvis/core    Parser + graph engine. No I/O beyond reading given files.
                          CFN YAML → Template AST → SolvisGraph (nodes + edges). Pure.
  server/  @solvis/server  Filesystem layer: template discovery, the graph pipeline
                          (discover→parse→buildGraph), the persistent Projects store
                          (~/.solvis/config.json), file-watching, and the local
                          HTTP + SSE server. Also static export. The CLI is thin on top.
  cli/     @solvis/cli      `solvis` (= `solvis ui`) boots the server + Projects UI;
                          `solvis build <dir>` static-exports; `solvis serve` views one.
  web/     @solvis/web      Vite + React + React Flow viewer. Two modes: Projects
                          dashboard + per-project GraphView (talks to @solvis/server
                          over /api, live-refreshes via SSE), OR a single injected
                          graph for static exports (window.__SOLVIS_GRAPH__).
```

Data contract is the **`SolvisGraph`** JSON (defined in `@solvis/core` `src/types.ts`).
The web app never parses CFN — it only consumes the graph (via the server API or the
injected global).

### Usage model

- **Primary — local server + Projects UI:** `solvis` (or `npx solvis`) starts a server
  at `localhost:4500`, opens the browser to a **Projects** dashboard. Add a project by
  path (in-app directory browser or typed path); the server scans it on demand, caches
  the graph, and **watches the files** so edits live-refresh the open diagram over SSE.
  Projects persist in `~/.solvis/config.json` (override dir with `SOLVIS_HOME`).
- **Secondary — static export:** `solvis build <dir> --out <out>` writes `graph.json`
  plus a self-contained viewer (graph injected as `window.__SOLVIS_GRAPH__`) for
  sharing/hosting/CI; `solvis serve <out>` serves it. Same engine, no server/state.

### Pipeline

```
discover templates → parse each (YAML + CFN intrinsic tags) → build graph
  ├─ nodes:  one per CFN resource (+ stack grouping, category, display metadata)
  └─ edges:  reference (Ref/GetAtt/DependsOn) · cross-stack (Export/ImportValue)
             · iam (role/policy → action → resource) · dataflow (semantic, per type)
→ emit SolvisGraph → viewer renders
```

### Key engine concepts

- **Node id** is globally unique: `${stackId}::${logicalId}`. `stackId` is derived from
  the template's path/declared name.
- **Resource registry** (`src/graph/resources.ts`): maps an `AWS::Service::Type` to a
  category + display hints + (later) the dataflow/edge rules specific to that type.
  This is the main extension point — adding support for a new resource type means
  adding a registry entry, not touching the core walk. See the `add-resource-type` skill.
- **Intrinsic handling** (`src/cfn/`): CFN short tags (`!Ref`, `!GetAtt`, `!Sub`,
  `!ImportValue`, …) are parsed into their `{ "Fn::X": ... }` long form so the rest of
  the engine sees one shape. Reference discovery walks resolved property trees.
- **Cross-stack** linking: build a map of `Export.Name → (stackId, outputId)`, resolve
  `Fn::ImportValue` (incl. `Fn::Sub` forms) best-effort using parameter defaults and
  pseudo-parameters. Unresolved imports become "external" placeholder nodes, never crash.
- **Best-effort, never throw on real input.** A malformed or unsupported construct
  degrades to a partial graph with a recorded warning — it does not abort the build.

## Conventions

- TypeScript strict mode. ESM (`"type": "module"`). Explicit return types on exported fns.
- Pure core: `@solvis/core` does no file discovery or process I/O itself beyond reading
  paths it's handed. `@solvis/server` owns the filesystem (discovery, watching, store,
  static export) and passes parsed templates into core. The CLI is a thin argv
  dispatcher over `@solvis/server`. This keeps the engine unit-testable and reusable.
- Tests: vitest. Every resource-type mapping and edge rule gets a small fixture +
  assertion. Use tiny inline CFN fixtures in `test/fixtures/`; reserve real-world
  templates for an integration smoke test.
- Never hardcode any specific project's conventions (stack names, prefixes, ARNs) in
  engine code.
- Keep the `SolvisGraph` JSON stable and versioned (`graphVersion` field) — the viewer
  depends on it.

## Reference target

For manual verification, point Solvis at any real multi-stack CloudFormation project —
the larger and more cross-stack-wired, the better the exercise. A good target has many
templates spanning accounts, stacks wired via `Export`/`Fn::ImportValue` and stack-name
parameters, and a rich set of IAM roles.

## Roadmap / task backlog

**Milestone 1 — Core graph engine ✅ (done)**
- [x] Scaffold monorepo, tooling, CLAUDE.md, agents, skills
- [x] CFN YAML parser with intrinsic tag support (`src/cfn/parse.ts`)
- [x] Template AST types + `SolvisGraph` types (`src/types.ts`)
- [x] Template discovery (CLI walks project for `*.yaml`/`*.json` CFN templates)
- [x] Node building + resource registry/categorization
- [x] Reference edges (Ref/GetAtt/DependsOn) within a stack
- [x] Cross-stack edges (Export ↔ ImportValue, best-effort Sub resolution)
- [x] IAM edges (roles, inline/managed policies, assume-role trust)
- [x] Smoke-verified against a real-world project: 24 stacks, 251 nodes, 377 edges

**Milestone 2 — Data-flow layer (next)**
- [ ] Per-resource-type dataflow rules (API GW↔Lambda, Lambda↔DynamoDB/RDS/S3,
      SNS/SQS pub-sub, Cognito triggers, event source mappings, env-var references,
      cross-account assume-role). Add a `dataflow` edge-rule module per the
      `add-resource-type` skill. The `dataflow` EdgeKind + viewer layer already exist.
- [ ] Improve IAM coverage: match cross-stack ARNs in policy `Resource` (currently
      skipped) so role→imported-resource edges appear. (IAM edge yield is currently low.)

**Milestone 3 — Web viewer ✅ (core done)**
- [x] Vite + React + React Flow app consuming graph.json
- [x] Layer toggles, stack filter, detail panel (click), search, neighbor dimming
- [x] Auto-layout (dagre), category colors, minimap, warnings panel
- [ ] Visual stack/account grouping (parent containers) — currently filter-based only
- [ ] Filter by category; collapse/expand stacks

**Milestone 4 — Server + Projects UI + packaging ✅ (core done)**
- [x] `@solvis/server`: project store (~/.solvis), graph pipeline, HTTP + SSE API
- [x] `solvis` / `solvis ui` boots server + opens Projects dashboard
- [x] Add project by path (with in-UI directory browser), per-project GraphView
- [x] File-watch → SSE live-refresh of the open diagram (smoke-verified)
- [x] `solvis build <dir>` static export + `solvis serve` for a shareable bundle
- [ ] Publishable bin / npx packaging (bundle web/dist into the server package so
      `findWebDist()` resolves the published copy; add a real `solvis` bin to npm)
- [ ] True standalone binary (Node SEA / bun compile) — optional, no-Node installs

**Future (post-v1)**
- [ ] Correctness checks (v2): broad IAM, orphaned resources, dangling imports,
      unencrypted resources, public APIs without authorizers
- [ ] Live AWS reconciliation: collect deployed state, diff intended vs actual
- [ ] Terraform / CDK-synth / SAM input adapters
