import type { CellPos, MapDoc, TileDef, TileId, ToolId } from '@/core/types';
import { tilesetIndex } from '@/core/tileset';
import { forEachBrushCell } from '@/core/tools/brush';
import { centerCell, isProtectedCell } from '@/core/lattice';
import type { Camera } from './camera';

const BG = '#12151c';
const MAP_BORDER = '#39414f';
const GRID_MINOR = 'rgba(255,255,255,0.055)';
const GRID_MAJOR = 'rgba(255,255,255,0.13)';
const HOVER_STROKE = 'rgba(255,255,255,0.85)';
const ERASER_STROKE = 'rgba(248,113,113,0.9)';
const BLOCKED_STROKE = 'rgba(248,113,113,0.95)';
const LATTICE = 'rgba(110,168,254,0.42)';

/** 이 크기보다 셀이 작아지면 격자선이 셀을 덮어버리므로 그리지 않는다. */
const GRID_MIN_SCALE = 9;
const MAJOR_EVERY = 5;

/** 보호 격자 점은 이보다 작아지면 알아보기 어려워 그리지 않는다. */
const LATTICE_MIN_SCALE = 7;

export interface RenderState {
  doc: MapDoc;
  camera: Camera;
  showGrid: boolean;
  hover: CellPos | null;
  brushSize: number;
  tool: ToolId;
  /** 지금 선택된 타일이 통행 불가라서 보호 격자에 놓을 수 없는 상태인지 */
  blockSolid: boolean;
}

/** 셀 경계를 정수 픽셀에 맞춰 인접 셀 사이에 실틈이 보이지 않게 한다. */
function edge(origin: number, cell: number, scale: number): number {
  return Math.round(origin + cell * scale);
}

export function renderMap(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  state: RenderState,
): void {
  const { doc, camera, showGrid, hover, brushSize, tool, blockSolid } = state;
  const tiles = tilesetIndex(doc.tileset);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, viewW, viewH);

  // 화면에 걸치는 셀만 순회한다. 200x200 이상에서도 그리기 비용이 뷰포트에 비례한다.
  const x0 = Math.max(0, Math.floor((0 - camera.ox) / camera.scale));
  const y0 = Math.max(0, Math.floor((0 - camera.oy) / camera.scale));
  const x1 = Math.min(doc.width - 1, Math.floor((viewW - camera.ox) / camera.scale));
  const y1 = Math.min(doc.height - 1, Math.floor((viewH - camera.oy) / camera.scale));

  for (const layer of doc.layers) {
    if (!layer.visible) continue;

    // 레이어 기본 타일은 배경으로 한 번에 칠하고, 셀 순회에서는 건너뛴다.
    const base: TileDef | undefined = tiles.get(layer.defaultTile);
    if (base) {
      ctx.fillStyle = base.color;
      const bx = edge(camera.ox, 0, camera.scale);
      const by = edge(camera.oy, 0, camera.scale);
      ctx.fillRect(bx, by, edge(camera.ox, doc.width, camera.scale) - bx, edge(camera.oy, doc.height, camera.scale) - by);
    }

    const isEntity = layer.key === 'entity';
    for (let y = y0; y <= y1; y++) {
      const row = y * doc.width;
      const sy = edge(camera.oy, y, camera.scale);
      const h = edge(camera.oy, y + 1, camera.scale) - sy;
      for (let x = x0; x <= x1; x++) {
        const id: TileId = layer.data[row + x];
        if (id === layer.defaultTile) continue;
        const def = tiles.get(id);
        if (!def) continue;

        const sx = edge(camera.ox, x, camera.scale);
        const w = edge(camera.ox, x + 1, camera.scale) - sx;
        ctx.fillStyle = def.color;
        if (isEntity) {
          // 엔티티는 지형 위에 겹쳐 놓이므로 안쪽으로 줄여 아래 지형이 보이게 한다.
          const inset = Math.max(1, Math.round(Math.min(w, h) * 0.2));
          drawInset(ctx, sx + inset, sy + inset, w - inset * 2, h - inset * 2);
        } else {
          ctx.fillRect(sx, sy, w, h);
        }
      }
    }
  }

  if (showGrid && camera.scale >= GRID_MIN_SCALE) {
    drawGrid(ctx, camera, x0, y0, x1, y1);
  }

  if (showGrid && camera.scale >= LATTICE_MIN_SCALE) {
    drawLattice(ctx, doc, camera, x0, y0, x1, y1);
  }

  drawMapBorder(ctx, doc, camera);

  if (hover) {
    drawBrushCursor(ctx, doc, camera, hover, brushSize, tool, blockSolid);
  }
}

function drawInset(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  const r = Math.min(w, h) * 0.28;
  if (r >= 1 && typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  ctx.lineWidth = 1;

  // 얇은 선과 굵은 선을 각각 한 번의 path로 모아 그린다.
  for (const major of [false, true]) {
    ctx.strokeStyle = major ? GRID_MAJOR : GRID_MINOR;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      if (x % MAJOR_EVERY === 0 !== major) continue;
      const sx = edge(cam.ox, x, cam.scale) + 0.5;
      ctx.moveTo(sx, edge(cam.oy, y0, cam.scale));
      ctx.lineTo(sx, edge(cam.oy, y1 + 1, cam.scale));
    }
    for (let y = y0; y <= y1 + 1; y++) {
      if (y % MAJOR_EVERY === 0 !== major) continue;
      const sy = edge(cam.oy, y, cam.scale) + 0.5;
      ctx.moveTo(edge(cam.ox, x0, cam.scale), sy);
      ctx.lineTo(edge(cam.ox, x1 + 1, cam.scale), sy);
    }
    ctx.stroke();
  }
}

/**
 * 보호 격자 표시.
 * 이 점이 찍힌 칸은 항상 지나갈 수 있어야 하므로 통행 불가 타일을 놓을 수 없다.
 * 브러쉬가 왜 칠해지지 않는지 알 수 있도록 눈에 보이게 그린다.
 */
function drawLattice(
  ctx: CanvasRenderingContext2D,
  doc: MapDoc,
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const center = centerCell(doc);
  const r = Math.max(1, Math.min(2.5, cam.scale * 0.085));

  ctx.fillStyle = LATTICE;
  ctx.beginPath();
  for (let y = y0; y <= y1; y++) {
    if ((y - center.y) % 2 !== 0) continue;
    const py = cam.oy + (y + 0.5) * cam.scale;
    for (let x = x0; x <= x1; x++) {
      if ((x - center.x) % 2 !== 0) continue;
      const px = cam.ox + (x + 0.5) * cam.scale;
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

function drawMapBorder(ctx: CanvasRenderingContext2D, doc: MapDoc, cam: Camera): void {
  const x = edge(cam.ox, 0, cam.scale) + 0.5;
  const y = edge(cam.oy, 0, cam.scale) + 0.5;
  ctx.strokeStyle = MAP_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, edge(cam.ox, doc.width, cam.scale) - x, edge(cam.oy, doc.height, cam.scale) - y);
}

function drawBrushCursor(
  ctx: CanvasRenderingContext2D,
  doc: MapDoc,
  cam: Camera,
  hover: CellPos,
  brushSize: number,
  tool: ToolId,
  blockSolid: boolean,
): void {
  const free: CellPos[] = [];
  const blocked: CellPos[] = [];

  forEachBrushCell(hover.x, hover.y, brushSize, (x, y) => {
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
    (blockSolid && isProtectedCell(doc, x, y) ? blocked : free).push({ x, y });
  });

  const outline = (cells: CellPos[], color: string) => {
    if (cells.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const cell of cells) {
      const sx = edge(cam.ox, cell.x, cam.scale) + 0.5;
      const sy = edge(cam.oy, cell.y, cam.scale) + 0.5;
      ctx.rect(sx, sy, edge(cam.ox, cell.x + 1, cam.scale) - sx, edge(cam.oy, cell.y + 1, cam.scale) - sy);
    }
    ctx.stroke();
  };

  outline(free, tool === 'eraser' ? ERASER_STROKE : HOVER_STROKE);
  outline(blocked, BLOCKED_STROKE);
}
