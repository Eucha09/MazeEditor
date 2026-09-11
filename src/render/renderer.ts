import type { BrushId, CellKind, CellPos, MapDoc, ToolId } from '@/core/types';
import { TERRAIN_EMPTY, TERRAIN_NONE, TERRAIN_WALL } from '@/core/types';
import type { Brush } from '@/core/brush';
import { brushColor, brushIndex, findBrushById } from '@/core/brush';
import { forEachBrushCell } from '@/core/tools/brush';
import { centerCell, cellKind } from '@/core/lattice';
import { getLayer } from '@/core/tilemap';
import type { Camera } from './camera';

const BG = '#12151c';
const MAP_BORDER = '#39414f';
const MAP_BORDER_PREVIEW = 'rgba(94,234,212,0.85)';
const GRID_MINOR = 'rgba(255,255,255,0.055)';
const GRID_MAJOR = 'rgba(255,255,255,0.13)';
const HOVER_STROKE = 'rgba(255,255,255,0.85)';
const ERASER_STROKE = 'rgba(248,113,113,0.9)';
const FILL_STROKE = 'rgba(94,234,212,0.9)';
const BLOCKED_STROKE = 'rgba(248,113,113,0.95)';
const LATTICE = 'rgba(110,168,254,0.42)';
/** 브러쉬가 지워졌는데 맵에는 칠한 자국이 남아 있는 칸. 상태창도 같은 색을 쓴다. */
export const UNKNOWN_BRUSH_COLOR = '#8b93a5';
/** 상태창에서 고른 브러쉬가 칠해진 칸을 덮어 번쩍이게 하는 색. */
const FLASH_FILL = '255,255,255';
const FLASH_STROKE = '94,234,212';
/** 번쩍이는 칸이 이보다 많으면 테두리는 생략한다 (drawBrushFlash 참고). */
const FLASH_OUTLINE_MAX_CELLS = 64;

/** 지형 타입만으로 정해지는 기본 칸 색. 브러쉬를 찾을 수 있으면 브러쉬 색이 우선한다. */
const TERRAIN_COLOR: Record<number, string> = {
  [TERRAIN_NONE]: '#171a21',
  [TERRAIN_EMPTY]: '#232834',
  [TERRAIN_WALL]: '#6b7689',
};

/** 이 크기보다 셀이 작아지면 격자선이 셀을 덮어버리므로 그리지 않는다. */
const GRID_MIN_SCALE = 9;
const MAJOR_EVERY = 5;

/** floor 칸 표시는 이보다 작아지면 알아보기 어려워 그리지 않는다. */
const LATTICE_MIN_SCALE = 7;

export interface RenderState {
  doc: MapDoc;
  camera: Camera;
  showGrid: boolean;
  hover: CellPos | null;
  tool: ToolId;
  brushes: Brush[];
  /** 커서가 덮는 크기. 선택된 브러쉬의 크기를 그대로 쓴다. */
  cursorSize: number;
  /** 지금 선택된 브러쉬가 놓일 수 있는 칸 종류. 브러쉬 도구가 아니면 null. */
  activeAllowedKinds: CellKind[] | null;
  /**
   * 미로 생성 미리보기 지형 타입 격자. null이 아니면 doc.terrainType 대신 이
   * 값으로 지형 색을 정한다 — 오브젝트·브러쉬 표시(엔티티 등)는 그대로 doc을 쓴다.
   */
  mazePreview: Uint8Array | null;
  /**
   * 번쩍이게 할 브러쉬와 그 진하기(0~1). null이면 그리지 않는다.
   * 시간은 렌더 루프가 재고, 여기는 한 프레임의 결과값만 받는다.
   */
  flash: { brushId: BrushId; alpha: number } | null;
}

/**
 * 번쩍임 진행도(0~1)를 그 프레임의 진하기로 바꾼다.
 *
 * 세 번 깜빡이면서 점점 옅어진다. 한 번만 켰다 끄면 시선이 이미 다른 곳에 있을 때
 * 놓치기 쉽고, 끝까지 같은 세기로 깜빡이면 언제 끝났는지 알기 어렵다.
 */
export function brushFlashAlpha(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  return Math.abs(Math.sin(progress * Math.PI * 3)) * (1 - progress);
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
  const { doc, camera, showGrid, hover, tool, brushes, cursorSize, activeAllowedKinds, mazePreview, flash } =
    state;
  const index = brushIndex(brushes);
  const terrainType = mazePreview ?? doc.terrainType;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, viewW, viewH);

  // 화면에 걸치는 셀만 순회한다. 200x200 이상에서도 그리기 비용이 뷰포트에 비례한다.
  const x0 = Math.max(0, Math.floor((0 - camera.ox) / camera.scale));
  const y0 = Math.max(0, Math.floor((0 - camera.oy) / camera.scale));
  const x1 = Math.min(doc.width - 1, Math.floor((viewW - camera.ox) / camera.scale));
  const y1 = Math.min(doc.height - 1, Math.floor((viewH - camera.oy) / camera.scale));

  const terrainBrushIds = getLayer(doc, 'terrain').brush;
  const entityObject = getLayer(doc, 'entity').object;
  const entityBrushIds = getLayer(doc, 'entity').brush;
  const terrainVisible = getLayer(doc, 'terrain').visible;
  const entityVisible = getLayer(doc, 'entity').visible;

  // 미정(None) 칸은 배경으로 한 번에 칠하고, 셀 순회에서는 건너뛴다.
  const bx = edge(camera.ox, 0, camera.scale);
  const by = edge(camera.oy, 0, camera.scale);
  ctx.fillStyle = TERRAIN_COLOR[TERRAIN_NONE];
  ctx.fillRect(
    bx,
    by,
    edge(camera.ox, doc.width, camera.scale) - bx,
    edge(camera.oy, doc.height, camera.scale) - by,
  );

  for (let y = y0; y <= y1; y++) {
    const row = y * doc.width;
    const sy = edge(camera.oy, y, camera.scale);
    const h = edge(camera.oy, y + 1, camera.scale) - sy;

    for (let x = x0; x <= x1; x++) {
      const i = row + x;
      const sx = edge(camera.ox, x, camera.scale);
      const w = edge(camera.ox, x + 1, camera.scale) - sx;

      if (terrainVisible) {
        const type = terrainType[i];
        // 미리보기 중에는 지형 타입이 실제 문서와 달라질 수 있으므로, 그 칸에
        // 놓인 브러쉬 색은 지형 타입이 그대로일 때만 보여 준다. 안 그러면 예를
        // 들어 브러쉬로 칠한 Wall이 미리보기에서 Empty로 바뀌었는데도 여전히
        // 벽 브러쉬 색으로 보이는 식의 혼란이 생긴다.
        const brushId = mazePreview && type !== doc.terrainType[i] ? 0 : terrainBrushIds[i];
        if (type !== TERRAIN_NONE || brushId !== 0) {
          const brush = findBrushById(index, brushId);
          ctx.fillStyle = brush ? brushColor(brush) : (TERRAIN_COLOR[type] ?? UNKNOWN_BRUSH_COLOR);
          ctx.fillRect(sx, sy, w, h);
        }
      }

      if (entityVisible) {
        const objectId = entityObject[i];
        const brushId = entityBrushIds[i];
        if (objectId !== 0 || brushId !== 0) {
          const brush = findBrushById(index, brushId);
          ctx.fillStyle = brush ? brushColor(brush) : UNKNOWN_BRUSH_COLOR;
          // 엔티티는 지형 위에 겹쳐 놓이므로 안쪽으로 줄여 아래 지형이 보이게 한다.
          const inset = Math.max(1, Math.round(Math.min(w, h) * 0.2));
          drawInset(ctx, sx + inset, sy + inset, w - inset * 2, h - inset * 2);
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

  if (flash && flash.alpha > 0.01) {
    drawBrushFlash(ctx, doc, camera, x0, y0, x1, y1, flash.brushId, flash.alpha);
  }

  drawMapBorder(ctx, doc, camera, mazePreview !== null);

  if (hover) {
    drawBrushCursor(ctx, doc, camera, hover, cursorSize, tool, activeAllowedKinds);
  }
}

/**
 * 어떤 브러쉬가 칠한 칸들을 한꺼번에 덮어 번쩍이게 한다.
 *
 * 어느 레이어의 브러쉬인지는 따지지 않고 두 레이어를 모두 본다 — 칠한 뒤에
 * 브러쉬의 layer 설정이 바뀌었을 수 있고, 어차피 "이 브러쉬가 남긴 칸"을
 * 보여 주는 것이 목적이기 때문이다. 다만 꺼 둔 레이어는 건너뛴다.
 *
 * 칸이 수천 개일 수 있으므로 사각형을 한 path에 모아 한 번에 칠한다.
 */
function drawBrushFlash(
  ctx: CanvasRenderingContext2D,
  doc: MapDoc,
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brushId: BrushId,
  alpha: number,
): void {
  const terrain = getLayer(doc, 'terrain');
  const entity = getLayer(doc, 'entity');

  /** 이 브러쉬가 칠한 칸을 한 path에 모은다. grow만큼 바깥으로 넓힌다. 돌려주는 값은 칸 수. */
  const trace = (grow: number): number => {
    ctx.beginPath();
    let count = 0;
    for (let y = y0; y <= y1; y++) {
      const row = y * doc.width;
      const sy = edge(cam.oy, y, cam.scale);
      const h = edge(cam.oy, y + 1, cam.scale) - sy;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        const hit =
          (terrain.visible && terrain.brush[i] === brushId) || (entity.visible && entity.brush[i] === brushId);
        if (!hit) continue;
        const sx = edge(cam.ox, x, cam.scale);
        ctx.rect(sx - grow, sy - grow, edge(cam.ox, x + 1, cam.scale) - sx + grow * 2, h + grow * 2);
        count++;
      }
    }
    return count;
  };

  const count = trace(0);
  if (count === 0) return;
  ctx.fillStyle = `rgba(${FLASH_FILL},${alpha * 0.75})`;
  ctx.fill();

  // 칸이 몇 개 안 될 때만 테두리를 덧그린다. 넓은 영역에서는 칸 경계마다 선이 그어져
  // 그물처럼 보이기만 하지만, 몇 칸뿐일 때는 작게 축소된 칸을 찾는 데 도움이 된다.
  if (count > FLASH_OUTLINE_MAX_CELLS) return;
  trace(1.5);
  ctx.strokeStyle = `rgba(${FLASH_STROKE},${alpha})`;
  ctx.lineWidth = 2;
  ctx.stroke();
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
 * floor 칸 표시.
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

function drawMapBorder(ctx: CanvasRenderingContext2D, doc: MapDoc, cam: Camera, preview: boolean): void {
  const x = edge(cam.ox, 0, cam.scale) + 0.5;
  const y = edge(cam.oy, 0, cam.scale) + 0.5;
  ctx.strokeStyle = preview ? MAP_BORDER_PREVIEW : MAP_BORDER;
  ctx.lineWidth = preview ? 2 : 1;
  ctx.strokeRect(x, y, edge(cam.ox, doc.width, cam.scale) - x, edge(cam.oy, doc.height, cam.scale) - y);
}

function drawBrushCursor(
  ctx: CanvasRenderingContext2D,
  doc: MapDoc,
  cam: Camera,
  hover: CellPos,
  cursorSize: number,
  tool: ToolId,
  activeAllowedKinds: CellKind[] | null,
): void {
  // 칸 종류 제한은 실제 배치와 마찬가지로 클릭할 가운데 칸(hover) 기준으로만
  // 본다 — 브러쉬 크기가 3 이상이면 범위 전체가 floor·wall·pillar를 다 걸치므로,
  // 칸마다 따로 판정하면 커서가 절반쯤 빨갛게 보이는데 실제로는 다 칠해진다.
  const blocked = activeAllowedKinds !== null && !activeAllowedKinds.includes(cellKind(doc, hover.x, hover.y));

  const cells: CellPos[] = [];
  forEachBrushCell(hover.x, hover.y, cursorSize, (x, y) => {
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
    cells.push({ x, y });
  });
  if (cells.length === 0) return;

  ctx.strokeStyle = blocked
    ? BLOCKED_STROKE
    : tool === 'eraser'
      ? ERASER_STROKE
      : tool === 'fill'
        ? FILL_STROKE
        : HOVER_STROKE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const cell of cells) {
    const sx = edge(cam.ox, cell.x, cam.scale) + 0.5;
    const sy = edge(cam.oy, cell.y, cam.scale) + 0.5;
    ctx.rect(sx, sy, edge(cam.ox, cell.x + 1, cam.scale) - sx, edge(cam.oy, cell.y + 1, cam.scale) - sy);
  }
  ctx.stroke();
}
