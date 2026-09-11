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
- `layers: Layer[]` (`'terrain'` and `'entity'`), each with two parallel typed arrays of the same length (see `GridArray` in `types.ts`):
  - `object` — the actual game object ID (arbitrary, game-defined; 0 = none). This is what the game/runtime reads. It's an **`Int32Array`** because IDs may be negative (range `OBJECT_ID_MIN`..`OBJECT_ID_MAX` in `types.ts`). `sanitizeObjectId` in `brush.ts` truncates toward zero and clamps into that range for both brush import and the brush dialog, while the map schema *rejects* out-of-range values instead of clamping, so game data never changes silently. Allowing negatives did not bump the map `FORMAT_VERSION`: every older file still validates, and a newer file containing negatives fails an older build's schema with a message instead of loading wrong. Two traps if you touch this: a controlled `type="number"` input can't accept negative entry (typing `-` alone yields an empty value that snaps back to 0), which is why `BrushDialog` uses the text-backed `ObjectIdInput`; and `toJson`'s one-row-per-line regex must accept a leading `-`.
  - `brush` — the editor's own bookkeeping: which `Brush.id` painted this cell (0 = none). **Not consumed by the game**, but is saved in the map file so re-opening a map preserves "what brush painted this," used for hover info, unique-brush relocation, and blob-conflict detection (see below). It's tracked *separately* from `object` specifically because two different brushes can be configured to write the same object ID, or the same brush's object ID can be edited later — matching on brush id (not on object id) is what stays correct.

All grid mutations funnel through `GridId`-addressed helpers (`getGrid`/`writeGridAt` in `tilemap.ts` and `editorStore.ts`) so that `History` (`src/core/history.ts`) can record undo/redo as flat `{grid, index, before, after}` deltas instead of snapshotting the whole document.

### Brushes are not part of the map file

`Brush` (`src/core/brush.ts`) defines *how* a click on the canvas should mutate the grids: which layer, which `terrainType`/`entityType` to stamp, an object ID per cell-kind (`objectIds: Record<CellKind, ObjectId>`), size, and behavioral flags (`unique`, `blob`, `fillable`). Brush *definitions* live entirely outside the map — they're persisted to `localStorage` and export/import as their own JSON file (`src/io/brushes.ts`, format `maze-editor-brushes`, currently v4), independent of whatever map is currently open. Only the resulting `terrainType`/`object`/`brush` values end up in the saved map file.

Two brush flags interact with the lattice:
- `allowedCellKinds: CellKind[]` — which of floor/wall/pillar this brush may paint (e.g. the default wall brush excludes `floor`, since floor must stay passable).
- `fillable` — can only be true if all three cell kinds are allowed, and is mutually exclusive with `unique`/`blob` (see the comment on `canBeFillable` in `brush.ts`) because flood-fill, "exactly one instance," and "one shared ID at the blob's center" are three different, incompatible cardinality assumptions.

`entityType: 'seed' | 'monster' | null` (entity-layer brushes only) marks cells the maze generator should treat specially — see below.

`normalizeDraft()` in `brush.ts` is the single place that reconciles brush fields that constrain each other (entity vs terrain layer, fillable vs blob/unique, etc.) — both the brush editor UI and file import route through it, so fix invariants there rather than in multiple call sites.

**Brush order is just the array order.** There is no separate `sort` field — the position of a brush in `brushStore.brushes` is its sort order, and it drives everything derived: palette display order, the 1–9 number hotkeys (`brushes.indexOf`), and group sections (`Palette` builds the group list by first-appearance and renders `brushes.filter(b => b.group === group)`). Because `brushesToJson`/`parseBrushesJson` round-trip the array in order, that ordering is already persisted to localStorage and to exported brush files with no schema involvement — so palette drag-to-reorder (`reorderBrushes` in `core/brush.ts`, wired to `brushStore.moveBrush` and the native HTML5 DnD handlers in `Palette.tsx`) needed no `maze-editor-brushes` version bump. `reorderBrushes` keeps each group's brushes contiguous in the array and rewrites `brush.group` when a brush is dropped into a different section.

**Editing a brush resyncs already-painted cells.** `object`/`terrainType` values baked into the map at paint time would otherwise go stale the moment you edit the brush that painted them (e.g. change an object ID and old cells keep the old one, even though the palette and status bar already show the new value). `computeBrushResync()` (`core/tools/resyncBrush.ts`) finds every cell still tagged with that brush's id — scanning both layers' `brush` grids, since the id is globally unique (`io/brushes.ts`) and a brush's `layer` field could in principle have been edited since — and recomputes `object` via `objectIdFor`, plus `terrainType` but only when the brush is *currently* a terrain brush; if it's been switched to `entity`, previously-painted terrain cells keep whatever terrain they had rather than being silently blanked to `TERRAIN_NONE`. Like `floodFillRegion`, it only computes the change list; `editorStore.resyncBrush` applies it as one undoable stroke and `BrushDialog`'s submit handler calls it after `updateBrush` (using the brush store's normalized copy, not the raw draft). Blob bodies aren't attributed to a brush id (only their center cell is, see `place.ts`), so a blob's decorative footprint isn't resynced — the same limitation as blob-conflict detection.

### Placement rules live in `core/tools/`

- `place.ts` — `isCellAllowed` (cell-kind gating) and `checkBlobPlacement`/`hasBlobConflict`. A "blob" brush (e.g. a 3×3 tree) stamps its object/brush IDs only at its center cell, leaving surrounding cells as plain terrain — so detecting whether a new blob would overlap an existing one means scanning a radius around the target for *other blobs' center markers* via the `brush` grid, not the `object` grid (an all-zero-object decorative blob still has a nonzero brush id at its center).
- **Cell-kind gating only ever checks the clicked/center cell, never the rest of the brush's footprint.** This applies both to plain brushes (`editorStore.placeBrush`) and to blobs (`checkBlobPlacement`). It's deliberate, not an oversight: any square footprint of size ≥3 necessarily touches all three of floor/wall/pillar, so per-cell gating would silently truncate (plain brushes) or outright reject (blobs) any brush whose `allowedCellKinds` isn't all three. The cursor preview in `renderer.ts`'s `drawBrushCursor` mirrors this — it colors the whole footprint based on one check of the hover cell, not per-cell.
- `fill.ts` — `floodFillRegion`, a 4-directional flood fill matched on `(terrainType, object)` (or just `object` for the entity layer, which has no terrain type). Iterative (stack-based), not recursive, so it's safe on the largest allowed map (511×511).
- `generateMaze.ts` — see next section.
- `brush.ts` (in `tools/`, distinct from `core/brush.ts`) — pure brush-footprint geometry (`forEachBrushCell`, `forEachLineCell` for drag interpolation).

`editorStore.ts` is where these get composed into the actual paint/erase/fill verbs, and it's also where `strokeBlockReason` is set when a placement is rejected (surfaced to the user via the status bar notice once the stroke ends without changes).

### Maze generation preview

`generateMazePreview()` (`core/tools/generateMaze.ts`) is a parallel-seeds recursive-backtracking maze carver, deliberately ported to match a specific reference implementation (including a subtle direction-shuffling asymmetry — see the comment on `randomDir`) rather than "cleaned up," because it needs to produce mazes with the same characteristics as the actual game's generator. Seeds are entity cells whose brush has `entityType === 'seed'`; encountering another seed's carved path has a fixed 10% chance of knocking down the wall between them (a "parallel seeds" merge).

This is **preview-only**: it returns a new `terrainType` array and never touches `doc`. `editorStore.mazePreview` holds that array; the renderer substitutes it for `doc.terrainType` when present, but object/brush-based coloring (entities, etc.) still reads the real document. Painting is blocked while a preview is active (checked in both `CanvasView`'s pointer handler and defensively again in `editorStore.beginStroke`/`paintAt`), and any real document mutation (undo, resize, new/open, etc.) clears the preview automatically.

### 3D preview

While a maze preview is active, the toolbar and the preview banner offer a **3D preview** overlay (`editorStore.preview3d`, closed automatically whenever `mazePreview` is cleared). It shows what the generated maze would look like in-game and, like the 2D preview, never touches `doc`.

- **`src/core/layout3d.ts`** — the pure part: 2D grid cells are all the same size, but in the real 3D map a cell's extent depends on its lattice kind — `floor` 16.5 × 16.5, `wall` 16.5 × 3 or 3 × 16.5, `pillar` 3 × 3, with walls standing `WALL_HEIGHT` (7.4) above the ground. The key simplification is that the extent is per-*axis*: a cell's x length depends only on whether its column is a floor column, and its y length only on its row. `mapLayout3D()` turns that into cumulative edge arrays (centered on the origin; grid y becomes world z) that `cellBox3D`/`forEachPreviewCell` read. This lives in `core/` rather than the renderer because the game runtime needs the same numbers when it builds the actual map.
- **`src/render/preview3d.ts`** — a deliberately simple three.js scene: one ground slab sized to the whole map (forest green top, soil-colored sides, slight thickness) plus boxes for wall cells. Like `CanvasView`, it runs outside React's render cycle and subscribes to the store itself, so regenerating the maze rebuilds the walls while keeping the current camera. `resetCamera()` fits the map exactly by asking each corner of the map's bounding box how far the camera must back off, which is exact for a tilted view where a bounding-sphere estimate is not; it uses the tallest model actually placed, not `WALL_HEIGHT`, so outer walls and the world tree don't get cropped.
  - **Lighting.** The sun is a shadow-casting `DirectionalLight`. `fitSun()` sizes its orthographic shadow camera to a sphere around the whole map (tallest model included), picks a 2048 or 4096 shadow map by map size clamped to the GPU's max texture size, and scales `normalBias` to the resulting texel size. This three.js build *removed* `PCFSoftShadowMap` (it warns and falls back), so shadows use `PCFShadowMap` + `shadow.radius`. There is deliberately **no tone mapping**: both ACES and Neutral were tried and both crush dark tones (Neutral squares everything below 0.08), which made this scene — mostly dark grass and walls — visibly murkier than before lighting was added. Highlights are kept in range by keeping point-light intensities low instead. Hemisphere and sun intensities are split so sunlit areas keep the pre-shadow brightness and shadowed areas drop below half. Props may add a `PointLight` (`propLightOf`), capped at `MAX_PROP_LIGHTS` because every point light costs per-fragment work across the whole screen.
  - **Controls.** Left drag pans along the ground, right drag rotates (OrbitControls also turns Shift/Ctrl/Cmd + left drag into rotate, for trackpads), wheel zooms. On touch, one finger pans and two fingers dolly/rotate. The overlay's header hint text must be kept in sync with `controls.mouseButtons`.
- **`src/render/previewModels.ts`** — the per-model shapes (pocket door, hero, world tree, tree spirit, wolf, golem, carnivorous plant), all built from boxes/spheres/cones/icosahedra. Materials are shared across the whole scene and disposed once; geometries are per-model and disposed with the map. Self-lit parts (the world tree's light-fruit, the spawn ring, the tree spirit's/wolf's/golem's eyes, the golem's core) are tagged `userData.glow` so `prepareShadows` keeps them out of shadow casting.
- **`src/render/Preview3DView.tsx`** — the overlay chrome. It is `lazy()`-loaded from `App.tsx` so three.js lands in its own chunk and never weighs down the editor's first load for people who don't open it.

**Per-brush 3D model types.** A brush's `previewModel` (`PREVIEW_MODELS` in `core/brush.ts`) decides what its cells become in the 3D preview: `default` / `special-wall` (11.1 tall) / `special-door` (same height; a bi-parting pocket door drawn slightly open, whose leaves slide into slots between the front and back skins of the flanking wall — it reuses the special-wall *material instance*, so its color can't drift from the wall's) / `outer-wall` (22.5 tall) / `start-area` (a white bob-haired female hero with a sword, on a glowing spawn ring, facing away from the default camera) / `safe-area` (a world tree far larger than one cell) / `boss-area` (a giant tree spirit) / `monster` (a black wolf) / `golem` (a mossy stone golem with a glowing core) / `plant` (a carnivorous plant). **The keys are frozen; only the Korean display names in `PREVIEW_MODEL_NAME` ever change**, because brush files store the key — renaming `boss-area` would silently reset every brush using it through the schema's `.catch('default')`. That's why keys and names disagree: `start-area` shows as 용사, `safe-area` as 세계수, `boss-area` as 나무 정령, `monster` as 늑대. `forEachPreviewCell` resolves this per cell and splits it into two callbacks:

- Wall-family models only apply where the *preview* terrain is `TERRAIN_WALL`. If the generator carved that cell open, nothing is built there regardless of what the brush says — the preview grid wins over the brush setting.
- Prop models (everything `isPropModel` accepts: the three areas plus `monster`, `golem`, `plant`) only apply where the cell is walkable, so a hero or tree never ends up entombed inside a wall.
- Both layers' `brush` grids are consulted (terrain first), since wall shapes usually come from a terrain brush while area markers usually come from an entity brush.

Heights live in `layout3d.ts` (`wallHeightOf`) rather than the renderer because the game runtime needs the same numbers. Ordinary walls are drawn with one `InstancedMesh` per model — there can be tens of thousands — while doors and props are built as individual objects, which is fine because there are only ever a handful.

Unlike the map file, the brush file does **not** hard-cut on this addition: `previewModel` is parsed with `.catch('default')`, so v3 files (and files from a future version with models this build doesn't know) still load with the field defaulted. The reasoning is in the schema comment — a purely additive, preview-only field isn't worth making `loadBrushes` throw away the user's entire brush set. For the same reason, **adding a new model value (e.g. `monster`) must not bump `FORMAT_VERSION`**: the schema rejects versions above its own, so a bump would make older builds refuse the whole file instead of just defaulting the one value they don't know.

### Canvas rendering is not React

`CanvasView.tsx` subscribes to the Zustand stores imperatively and only sets a `needsDraw` ref flag; an internal `requestAnimationFrame` loop calls `renderer.ts`'s `renderMap()` at most once per frame regardless of how many store updates land in between (important during drag-painting, which fires pointer events far faster than 60fps). `renderMap()` itself is a plain function taking a `RenderState` snapshot — it doesn't know about Zustand.

### Map file format

Versioned JSON (`format: 'maze-editor'`, current `FORMAT_VERSION = 3` in `core/io/schema.ts`), validated with Zod. Contains `terrain: { type, object, brush }` and `entity: { object, brush }` as row-major 2D arrays, plus `width`/`height`/`name`. `core/io/serialize.ts` explicitly rejects older versions with a message explaining what changed rather than trying to migrate — this project has gone through several breaking format revisions (odd-only sizes → 4n+3, tileset-based → terrainType/object, then adding the `brush` grid) and each bump intentionally hard-cuts compatibility rather than accumulating migration code. If you need to change the map or brush file schema again, follow that same pattern rather than trying to support both old and new shapes at once.

Brush files are a *separate* versioned format (`maze-editor-brushes`, `io/brushes.ts`, currently v4) — don't confuse the two version counters. v4 added `previewModel`, and unlike the map file it was *not* a hard cut: see the 3D preview section for why.

### State stores

- `editorStore.ts` — the current `MapDoc`, camera, tool selection, undo/redo, autosave scheduling, and the maze preview buffer. History and in-progress stroke state (`activeStroke`, `strokeTool`, `strokeBlockReason`) are deliberately kept in module-level variables outside Zustand state, since they mutate many times per second during a drag and don't need to trigger React re-renders.
- `brushStore.ts` — the current brush set and active brush ID, persisted independently (see above).

Autosave (`io/autosave.ts`) debounces writes to `localStorage` and is keyed separately from any user-chosen file — it's a crash-recovery net, not the save mechanism (`save()`/`open()` in `editorStore.ts` use the File System Access API where available, falling back to download/upload).
