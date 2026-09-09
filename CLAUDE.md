# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # Vite dev server on http://localhost:5180 (auto-opens browser)
npm run build        # tsc --noEmit && vite build (typecheck is part of the build)
npm run typecheck    # tsc --noEmit only
npm test             # vitest run (single run, all tests)
npm run test:watch   # vitest in watch mode
```

Run a single test file: `npx vitest run src/core/core.test.ts`
Run tests matching a name: `npx vitest run -t "브러쉬 설정"`

There is no separate lint script; `tsc --noEmit` (strict mode, `noUnusedLocals`/`noUnusedParameters` on) is the only static check.

On Windows, `dev.cmd` is a double-clickable launcher that adds a portable Node install to `PATH` if `node` isn't found, then runs `npm run dev`.

Path alias `@/*` maps to `src/*` (configured in both `tsconfig.json` and `vite.config.ts`).

## Architecture

This is a browser-based level editor for a cell-based maze game. It has no backend — everything lives in the browser (localStorage + File System Access API) and produces a JSON map file that a separate game/runtime consumes.

### Layering

- **`src/core/`** — pure data model and algorithms. No React, no DOM. Written to be reusable as-is inside the actual game runtime, so avoid adding browser or React dependencies here.
- **`src/io/`** — browser-only persistence (localStorage, File System Access API / download fallback). Depends on `core/` for serialization logic.
- **`src/store/`** — Zustand stores wiring core logic to UI state.
- **`src/render/`** — imperative `<canvas>` renderer + input handling. Not driven by React's render cycle (see below).
- **`src/ui/`** — React components (dialogs, toolbar, palette, status bar).

### The map grid: floor / wall / pillar lattice

The maze is a cell grid where the *maze structure itself* (not decoration) follows a fixed pattern relative to the map center: cells whose (x, y) offset from center is (even, even) are `floor` (always passable "rooms"), (odd, even)/(even, odd) are `wall` (the passage between two floor cells), and (odd, odd) are `pillar` (wall/wall intersections). This classification is `cellKind()` in `src/core/lattice.ts`, and `isProtectedCell()` is shorthand for `cellKind === 'floor'`.

Map dimensions are constrained to `4n+3` (3, 7, 11, 15, ...) by `normalizeMapSize()` in `src/core/tilemap.ts` — this is what guarantees floor cells (always at odd coordinates) never coincide with the outer border (always even coordinates). Don't relax this without understanding why (see the comment in `tilemap.ts`).

### Document model (`src/core/types.ts`, `tilemap.ts`)

A `MapDoc` has:
- `terrainType: Uint8Array` — one of `TERRAIN_NONE` (undecided, for the maze generator to fill in) / `TERRAIN_EMPTY` / `TERRAIN_WALL`. This is real game data.
- `layers: Layer[]` (`'terrain'` and `'entity'`), each with two parallel `Uint32Array`s of the same length:
  - `object` — the actual game object ID (arbitrary, game-defined; 0 = none). This is what the game/runtime reads.
  - `brush` — the editor's own bookkeeping: which `Brush.id` painted this cell (0 = none). **Not consumed by the game**, but is saved in the map file so re-opening a map preserves "what brush painted this," used for hover info, unique-brush relocation, and blob-conflict detection (see below). It's tracked *separately* from `object` specifically because two different brushes can be configured to write the same object ID, or the same brush's object ID can be edited later — matching on brush id (not on object id) is what stays correct.

All grid mutations funnel through `GridId`-addressed helpers (`getGrid`/`writeGridAt` in `tilemap.ts` and `editorStore.ts`) so that `History` (`src/core/history.ts`) can record undo/redo as flat `{grid, index, before, after}` deltas instead of snapshotting the whole document.

### Brushes are not part of the map file

`Brush` (`src/core/brush.ts`) defines *how* a click on the canvas should mutate the grids: which layer, which `terrainType`/`entityType` to stamp, an object ID per cell-kind (`objectIds: Record<CellKind, ObjectId>`), size, and behavioral flags (`unique`, `blob`, `fillable`). Brush *definitions* live entirely outside the map — they're persisted to `localStorage` and export/import as their own JSON file (`src/io/brushes.ts`, format `maze-editor-brushes`, currently v3), independent of whatever map is currently open. Only the resulting `terrainType`/`object`/`brush` values end up in the saved map file.

Two brush flags interact with the lattice:
- `allowedCellKinds: CellKind[]` — which of floor/wall/pillar this brush may paint (e.g. the default wall brush excludes `floor`, since floor must stay passable).
- `fillable` — can only be true if all three cell kinds are allowed, and is mutually exclusive with `unique`/`blob` (see the comment on `canBeFillable` in `brush.ts`) because flood-fill, "exactly one instance," and "one shared ID at the blob's center" are three different, incompatible cardinality assumptions.

`entityType: 'seed' | 'monster' | null` (entity-layer brushes only) marks cells the maze generator should treat specially — see below.

`normalizeDraft()` in `brush.ts` is the single place that reconciles brush fields that constrain each other (entity vs terrain layer, fillable vs blob/unique, etc.) — both the brush editor UI and file import route through it, so fix invariants there rather than in multiple call sites.

### Placement rules live in `core/tools/`

- `place.ts` — `isCellAllowed` (cell-kind gating) and `checkBlobPlacement`/`hasBlobConflict`. A "blob" brush (e.g. a 3×3 tree) stamps its object/brush IDs only at its center cell, leaving surrounding cells as plain terrain — so detecting whether a new blob would overlap an existing one means scanning a radius around the target for *other blobs' center markers* via the `brush` grid, not the `object` grid (an all-zero-object decorative blob still has a nonzero brush id at its center).
- `fill.ts` — `floodFillRegion`, a 4-directional flood fill matched on `(terrainType, object)` (or just `object` for the entity layer, which has no terrain type). Iterative (stack-based), not recursive, so it's safe on the largest allowed map (511×511).
- `generateMaze.ts` — see next section.
- `brush.ts` (in `tools/`, distinct from `core/brush.ts`) — pure brush-footprint geometry (`forEachBrushCell`, `forEachLineCell` for drag interpolation).

`editorStore.ts` is where these get composed into the actual paint/erase/fill verbs, and it's also where `strokeBlockReason` is set when a placement is rejected (surfaced to the user via the status bar notice once the stroke ends without changes).

### Maze generation preview

`generateMazePreview()` (`core/tools/generateMaze.ts`) is a parallel-seeds recursive-backtracking maze carver, deliberately ported to match a specific reference implementation (including a subtle direction-shuffling asymmetry — see the comment on `randomDir`) rather than "cleaned up," because it needs to produce mazes with the same characteristics as the actual game's generator. Seeds are entity cells whose brush has `entityType === 'seed'`; encountering another seed's carved path has a fixed 10% chance of knocking down the wall between them (a "parallel seeds" merge).

This is **preview-only**: it returns a new `terrainType` array and never touches `doc`. `editorStore.mazePreview` holds that array; the renderer substitutes it for `doc.terrainType` when present, but object/brush-based coloring (entities, etc.) still reads the real document. Painting is blocked while a preview is active (checked in both `CanvasView`'s pointer handler and defensively again in `editorStore.beginStroke`/`paintAt`), and any real document mutation (undo, resize, new/open, etc.) clears the preview automatically.

### Canvas rendering is not React

`CanvasView.tsx` subscribes to the Zustand stores imperatively and only sets a `needsDraw` ref flag; an internal `requestAnimationFrame` loop calls `renderer.ts`'s `renderMap()` at most once per frame regardless of how many store updates land in between (important during drag-painting, which fires pointer events far faster than 60fps). `renderMap()` itself is a plain function taking a `RenderState` snapshot — it doesn't know about Zustand.

### Map file format

Versioned JSON (`format: 'maze-editor'`, current `FORMAT_VERSION = 3` in `core/io/schema.ts`), validated with Zod. Contains `terrain: { type, object, brush }` and `entity: { object, brush }` as row-major 2D arrays, plus `width`/`height`/`name`. `core/io/serialize.ts` explicitly rejects older versions with a message explaining what changed rather than trying to migrate — this project has gone through several breaking format revisions (odd-only sizes → 4n+3, tileset-based → terrainType/object, then adding the `brush` grid) and each bump intentionally hard-cuts compatibility rather than accumulating migration code. If you need to change the map or brush file schema again, follow that same pattern rather than trying to support both old and new shapes at once.

Brush files are a *separate* versioned format (`maze-editor-brushes`, `io/brushes.ts`, currently v3) — don't confuse the two version counters.

### State stores

- `editorStore.ts` — the current `MapDoc`, camera, tool selection, undo/redo, autosave scheduling, and the maze preview buffer. History and in-progress stroke state (`activeStroke`, `strokeTool`, `strokeBlockReason`) are deliberately kept in module-level variables outside Zustand state, since they mutate many times per second during a drag and don't need to trigger React re-renders.
- `brushStore.ts` — the current brush set and active brush ID, persisted independently (see above).

Autosave (`io/autosave.ts`) debounces writes to `localStorage` and is keyed separately from any user-chosen file — it's a crash-recovery net, not the save mechanism (`save()`/`open()` in `editorStore.ts` use the File System Access API where available, falling back to download/upload).
