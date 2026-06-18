---
name: add-resource-type
description: >-
  Add Solvis engine support for a new AWS CloudFormation resource type (category,
  display, reference/data-flow/IAM edge rules) with tests. Use when the graph is
  missing nodes/edges for a resource type, or when "support AWS::X::Y" is requested.
---

# Add support for a CloudFormation resource type

This is the main extension workflow for `@solvis/core`. Adding a resource type means
teaching the engine how to categorize it and what edges it produces — without touching
the generic graph-walk.

## Steps

1. **Spec the resource.** Use the `aws-resource-expert` agent to get the category,
   display fields, and reference/data-flow/IAM edge rules for the type. Give it the
   real CFN snippet from the target project if you have one.

2. **Register the type** in `packages/core/src/graph/resources.ts`:
   - Add an entry mapping `AWS::Service::Type` → `{ category, label, keyProps }`.
   - If it's unknown, the engine already falls back to a generic node — so only add
     entries that improve categorization or carry edge rules.

3. **Add edge rules** in `packages/core/src/graph/edges/`:
   - Reference edges come for free from the generic intrinsic walk — only add a rule if
     the coupling is *name-based* (not a `Ref`) and needs a heuristic.
   - Data-flow edges go in a per-type rule that, given the resource + the graph, emits
     directed `dataflow` edges (with `label` and direction). Keep source/target as node
     ids; resolve targets via `Ref`/`GetAtt`/`Fn::Sub` ARN matching.
   - IAM specifics go in `edges/iam.ts`.

4. **Write a fixture test** in `packages/core/test/`:
   - Add a tiny inline CFN fixture exercising the new type and its links.
   - Assert the expected nodes (category) and edges (kind, source, target, label) appear.
   - Keep fixtures minimal — one behavior per fixture.

5. **Verify against a real target.** Run the CLI on a real CloudFormation project
   and confirm the new nodes/edges render and that nothing regressed.
   `npm run test -w @solvis/core` must pass.

6. **Viewer styling (optional).** If the category is new, ensure `@solvis/web` has an
   icon/color for it; otherwise it uses the category default.

## Rules

- **General-purpose only** — no project-specific names/ARNs/prefixes in engine code.
- **Never throw on real input** — unresolved references degrade to a warning + partial
  edge or an "external" placeholder node.
- One resource type per change; tests alongside.
