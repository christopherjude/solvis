---
name: visualize
description: >-
  Build and open the Solvis solution diagram for a project. Use when asked to
  visualize/render a project, regenerate the graph, or see the diagram for
  any AWS CloudFormation repo.
---

# Visualize a solution with Solvis

Two ways to view a project. Prefer the **server UI** for interactive/local use; use
**static export** when a shareable artifact is wanted.

## Option A — server + Projects UI (default)

1. **Build packages if stale:** `npm run build`
2. **Start the server:**
   ```
   node packages/cli/dist/index.js          # = `solvis ui`; serves http://localhost:4500
   ```
   It's long-running — if you need it to stay up in-session, suggest the user run
   `! node packages/cli/dist/index.js` from the prompt.
3. **Add the project:** in the UI click "Add project" and give it the path to the
   CloudFormation project the user names, or pre-register via the API:
   ```
   curl -s -X POST localhost:4500/api/projects -H 'Content-Type: application/json' \
     -d '{"path":"/path/to/your-cfn-project"}'
   ```
4. **It auto-refreshes** as the project's templates change (file-watch over SSE).
   Report node/edge/warning counts (from the add/list response or `/api/projects`).

Projects persist in `~/.solvis/config.json` (set `SOLVIS_HOME` to isolate, e.g. tests).

## Option B — static export (shareable / CI)

```
node packages/cli/dist/index.js build <projectDir> --out .solvis-out
node packages/cli/dist/index.js serve .solvis-out      # http://localhost:4500
```
Writes `graph.json` + a self-contained viewer (graph injected as
`window.__SOLVIS_GRAPH__`). Report node/edge counts and any parse warnings.

## Notes

- Solvis is **static** — it never touches AWS. The diagram reflects declared IaC state.
- If a resource type renders as a generic node or an edge is missing, that's an
  extension gap — use the `add-resource-type` skill to fill it.
- Many unresolved imports usually means cross-stack `Fn::Sub` export names couldn't be
  matched — note them rather than treating it as a failure.
