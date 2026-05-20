# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo contains

Two coexisting versions of the same nCino feature-heatmap product:

```
web/                                # Next.js + Convex app — the live one
Heatmap/index.html                  # Legacy static prototype (kept for reference)
Covenants/index.html                # Legacy static prototype (kept for reference)
smart-checklist-builder/            # Legacy static prototype (kept for reference)
ClaudeReferenceMaterial/            # PNG screenshots used as design source-of-truth
```

The legacy `Heatmap/`, `Covenants/`, and `smart-checklist-builder/` folders are **frozen** — they're the original `file://` HTML/CSS/JS prototypes the user designed against. **Do not edit them.** Treat them as the spec for the live app under `web/`. The screenshots in `ClaudeReferenceMaterial/` are the visual reference.

Everything new lives under `web/`. That is where you should be working.

## Developing in `web/`

```
cd web
npx convex dev      # local Convex backend — must keep running in its own terminal
npm run dev         # Next.js dev server on :3000
```

`npx convex dev` provisions a deployment on first run, writes `web/.env.local`, and generates `web/convex/_generated/`. Keep it running while developing — schema/function changes are pushed automatically. If pages start showing perpetual "Loading…", `npx convex dev` is probably no longer running on `:3210`.

Build / lint:

```
npm run build
npm run lint
```

There is no test suite.

## Architecture (`web/`)

Routes (App Router):

```
/                                   Projects list
/projects/[projectId]               Heatmap board for that project
/projects/[projectId]/covenants     Covenants configurator (?cardId=…)
/projects/[projectId]/checklist     Smart Checklist configurator (?cardId=…)
```

Convex schema (`web/convex/schema.ts`) — top-down ownership:

```
projects → heatmaps → phases → subphases → cards
                                              ├── covenants     (configurator-specific)
                                              └── checklistReqs (configurator-specific)
picklists  (scoped: 'covenants' | 'checklist', shared across cards within scope)
```

A new project seeds its phases / subphases / cards from `web/convex/seedData.ts` (`SEED_PHASES` — ported verbatim from the legacy `Heatmap/index.html`'s `PHASES` constant). After seeding, every project has its own independently editable heatmap.

### Heatmap interaction model

Cards are draggable via `@dnd-kit` (sortable within a subphase, droppable across subphases / phases). Click activation threshold is 4px so a click below that goes through to the card-details modal instead of starting a drag. Drag end calls `api.heatmap.moveCard`, which persists `subphaseId` + `order` and recompacts both source and target columns.

### Card → configurator wiring

Each card has a `type` (`low` | `high` | `manual` | `custom` | `linked`) and an optional `configuratorKind` (`covenants` | `checklist`). On click, `configuratorRoute(card, projectId)` in `web/src/components/heatmap/configurator-registry.ts` decides:

- `configuratorKind` set → route to `/projects/[id]/{kind}?cardId=…`
- otherwise → open the generic card-details modal

To add a new bespoke configurator: add a `configuratorKind` literal to the card schema in `convex/schema.ts`, add a Convex table for its records, add a route at `/projects/[id]/<kind>/page.tsx`, and add an entry to `configuratorRoute()`.

### Conventions worth knowing

- **shadcn/ui is built on `@base-ui-components/react`** (not Radix). The composition prop is `render={<Element />}`, **not** `asChild`. `Select` uses `null` for the unset value (renders the placeholder); the empty-string sentinel pattern doesn't work — `<SelectItem value={null}>` is the cleared option.
- **Card-type colours** live in CSS custom properties on `:root` in `web/src/app/globals.css` (`--color-card-native-low`, `--color-card-native-high`, etc.) — ported from the legacy heatmap. Reuse them rather than hardcoding hex values.
- **Picklist defaults** for both configurators are in `web/src/lib/picklist-defaults.ts`. They're the seed values used when nothing has been added via the picklist editor; user-added values stored in Convex's `picklists` table override / extend them.
- **Cascading deletes** — `projects.remove`, `heatmap.deletePhase`, `heatmap.deleteSubphase`, `heatmap.deleteCard` all walk the tree and delete configurator records too. Maintain that pattern when adding new configurator tables.
- **Convex generated files** (`web/convex/_generated/`) are produced by `npx convex dev`. Don't commit edits to them; treat them as build output.

### Stack

Next.js 16 App Router · TypeScript · Tailwind v4 · shadcn/ui (base-ui under the hood) · `@dnd-kit/core` + `@dnd-kit/sortable` · Convex (local single-user, no auth)
