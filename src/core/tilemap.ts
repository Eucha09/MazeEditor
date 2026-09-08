import type { Layer, LayerKey, MapDoc, TileId } from './types';
import { DEFAULT_TILESET, TILE_FLOOR, TILE_NONE, TILE_WALL } from './tileset';

export const MIN_MAP_SIZE = 3;
export const MAX_MAP_SIZE = 511;

/**
 * 맵 크기는 홀수만 허용한다.
 *
 * 셀 기반 미로에서는 벽도 한 칸을 차지하므로 (벽, 통로, 벽, 통로, ... , 벽) 배치가
 * 딱 떨어지려면 2n+1 형태여야 한다. 짝수로 두면 반대쪽 끝에 두께 2짜리 벽이 남고,
 * 자동 생성기와 대칭 그리기에서도 한 줄이 계속 어긋난다.
 *
 * 짝수가 들어오면 위쪽 홀수로 올린다. 사용자가 입력한 크기보다 작아지지 않는 편이
 * 덜 놀랍기 때문이다.
 */
export function normalizeMapSize(n: number): number {
  if (!Number.isFinite(n)) return MIN_MAP_SIZE;
  const i = Math.floor(n);
  const odd = i % 2 === 0 ? i + 1 : i;
  return Math.min(MAX_MAP_SIZE, Math.max(MIN_MAP_SIZE, odd));
}

export function isValidMapSize(n: number): boolean {
  return Number.isInteger(n) && n % 2 === 1 && n >= MIN_MAP_SIZE && n <= MAX_MAP_SIZE;
}

export function cellIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function inBounds(doc: MapDoc, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < doc.width && y < doc.height;
}

export function getLayer(doc: MapDoc, key: LayerKey): Layer {
  const layer = doc.layers.find((l) => l.key === key);
  if (!layer) throw new Error(`레이어를 찾을 수 없습니다: ${key}`);
  return layer;
}

export function getTile(doc: MapDoc, key: LayerKey, x: number, y: number): TileId {
  if (!inBounds(doc, x, y)) return TILE_NONE;
  return getLayer(doc, key).data[cellIndex(x, y, doc.width)];
}

/** 레이어 전체에서 특정 타일이 놓인 첫 인덱스. 없으면 -1. (unique 타일 정리에 사용) */
export function findTileIndex(layer: Layer, tile: TileId): number {
  return layer.data.indexOf(tile);
}

export function createLayer(key: LayerKey, name: string, defaultTile: TileId, cells: number): Layer {
  const data = new Uint16Array(cells);
  if (defaultTile !== 0) data.fill(defaultTile);
  return { key, name, visible: true, defaultTile, data };
}

/** 지형 레이어의 바깥 한 줄을 벽으로 채운다. */
function fillBorderWalls(terrain: Layer, width: number, height: number): void {
  for (let x = 0; x < width; x++) {
    terrain.data[cellIndex(x, 0, width)] = TILE_WALL;
    terrain.data[cellIndex(x, height - 1, width)] = TILE_WALL;
  }
  for (let y = 0; y < height; y++) {
    terrain.data[cellIndex(0, y, width)] = TILE_WALL;
    terrain.data[cellIndex(width - 1, y, width)] = TILE_WALL;
  }
}

export interface CreateDocOptions {
  name?: string;
  /** 테두리를 벽으로 채운다. 미로는 바깥이 막혀 있어야 하므로 기본값 true. */
  borderWalls?: boolean;
}

export function createDoc(width: number, height: number, options: CreateDocOptions = {}): MapDoc {
  const { name = '새 맵', borderWalls = true } = options;
  const w = normalizeMapSize(width);
  const h = normalizeMapSize(height);
  const cells = w * h;

  const terrain = createLayer('terrain', '지형', TILE_FLOOR, cells);
  const entity = createLayer('entity', '엔티티', TILE_NONE, cells);

  if (borderWalls) fillBorderWalls(terrain, w, h);

  return {
    name,
    width: w,
    height: h,
    tileset: DEFAULT_TILESET.map((t) => ({ ...t })),
    layers: [terrain, entity],
  };
}

/**
 * 격자 크기와 모든 레이어 데이터가 완전히 같은지 비교한다.
 * 결과가 이전과 똑같은 편집이 히스토리에 빈 항목을 남기지 않도록 하는 데 쓴다.
 */
export function sameGrid(a: MapDoc, b: MapDoc): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.layers.length !== b.layers.length) return false;
  for (let i = 0; i < a.layers.length; i++) {
    const left = a.layers[i].data;
    const right = b.layers[i].data;
    if (left.length !== right.length) return false;
    for (let j = 0; j < left.length; j++) {
      if (left[j] !== right[j]) return false;
    }
  }
  return true;
}

export type AnchorX = 'left' | 'center' | 'right';
export type AnchorY = 'top' | 'middle' | 'bottom';

/** 크기를 바꿀 때 기존 내용을 새 맵의 어디에 붙일지. */
export interface Anchor {
  x: AnchorX;
  y: AnchorY;
}

export const DEFAULT_ANCHOR: Anchor = { x: 'center', y: 'middle' };

function axisOffset(mode: 'start' | 'center' | 'end', oldSize: number, newSize: number): number {
  if (mode === 'start') return 0;
  if (mode === 'end') return newSize - oldSize;
  // 양쪽 모두 홀수이므로 차이는 항상 짝수다. 정확히 가운데로 떨어진다.
  return Math.floor((newSize - oldSize) / 2);
}

export interface ResizeOptions {
  anchor?: Anchor;
  /** 크기를 바꾼 뒤 바깥 한 줄을 다시 벽으로 채운다. */
  borderWalls?: boolean;
}

/**
 * 내용을 유지한 채 맵 크기를 바꾼다.
 *
 * 원본을 건드리지 않고 새 문서를 만든다. 덕분에 히스토리는 이전/이후 문서의
 * 참조만 들고 있으면 되고, 별도로 스냅샷을 복사할 필요가 없다.
 */
export function resizeDoc(doc: MapDoc, width: number, height: number, options: ResizeOptions = {}): MapDoc {
  const { anchor = DEFAULT_ANCHOR, borderWalls = true } = options;
  const w = normalizeMapSize(width);
  const h = normalizeMapSize(height);

  const offX = axisOffset(anchor.x === 'left' ? 'start' : anchor.x === 'right' ? 'end' : 'center', doc.width, w);
  const offY = axisOffset(anchor.y === 'top' ? 'start' : anchor.y === 'bottom' ? 'end' : 'center', doc.height, h);

  // 새 맵과 옛 맵이 겹치는 사각형만 복사한다. 벗어나는 부분은 잘린다.
  const x0 = Math.max(0, offX);
  const x1 = Math.min(w, offX + doc.width);
  const y0 = Math.max(0, offY);
  const y1 = Math.min(h, offY + doc.height);

  const layers = doc.layers.map((layer) => {
    const next = createLayer(layer.key, layer.name, layer.defaultTile, w * h);
    next.visible = layer.visible;
    for (let y = y0; y < y1; y++) {
      const srcBase = (y - offY) * doc.width - offX;
      const dstBase = y * w;
      for (let x = x0; x < x1; x++) next.data[dstBase + x] = layer.data[srcBase + x];
    }
    return next;
  });

  if (borderWalls) {
    const terrain = layers.find((l) => l.key === 'terrain');
    if (terrain) fillBorderWalls(terrain, w, h);
  }

  return { ...doc, width: w, height: h, layers };
}
