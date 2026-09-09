import type { BrushId, GridId, Layer, LayerKey, MapDoc, ObjectId, TerrainType } from './types';
import { TERRAIN_NONE } from './types';

export const MIN_MAP_SIZE = 3;
export const MAX_MAP_SIZE = 511;

/**
 * 맵 크기는 4n+3 (3, 7, 11, 15, ...) 만 허용한다.
 *
 * 두 가지 제약이 겹친 결과다.
 *  1) 셀 기반 미로는 벽도 한 칸을 차지하므로 2n+1(홀수)이라야 통로와 벽이 딱 떨어진다.
 *  2) 중앙을 포함한 2칸 간격 floor 격자가 바깥 테두리와 겹치면 안 된다.
 *     크기가 4n+3일 때만 중앙 좌표 (w-1)/2 가 홀수가 되어 floor 칸이 홀수 좌표에만
 *     놓이고, 짝수 좌표인 테두리와 분리된다. (lattice.ts 참고)
 *
 * 값이 맞지 않으면 위쪽으로 올린다. 사용자가 입력한 크기보다 작아지지 않는 편이
 * 덜 놀랍기 때문이다.
 */
export function normalizeMapSize(n: number): number {
  if (!Number.isFinite(n)) return MIN_MAP_SIZE;
  const i = Math.floor(n);
  const remainder = (((i - 3) % 4) + 4) % 4;
  const snapped = remainder === 0 ? i : i + (4 - remainder);
  // 경계값 자체가 4n+3이므로 잘라내도 규칙이 깨지지 않는다.
  return Math.min(MAX_MAP_SIZE, Math.max(MIN_MAP_SIZE, snapped));
}

export function isValidMapSize(n: number): boolean {
  return Number.isInteger(n) && n % 4 === 3 && n >= MIN_MAP_SIZE && n <= MAX_MAP_SIZE;
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

/** 격자 이름으로 실제 배열을 얻는다. 히스토리와 편집이 공통으로 쓴다. */
export function getGrid(doc: MapDoc, grid: GridId): Uint8Array | Uint32Array {
  switch (grid) {
    case 'terrainType':
      return doc.terrainType;
    case 'terrainObject':
      return getLayer(doc, 'terrain').object;
    case 'terrainBrush':
      return getLayer(doc, 'terrain').brush;
    case 'entityObject':
      return getLayer(doc, 'entity').object;
    case 'entityBrush':
      return getLayer(doc, 'entity').brush;
  }
}

/** 오브젝트 격자를 쓰는 레이어의 격자 이름. */
export function objectGridOf(layer: LayerKey): GridId {
  return layer === 'terrain' ? 'terrainObject' : 'entityObject';
}

/** 브러쉬 id 격자를 쓰는 레이어의 격자 이름. */
export function brushGridOf(layer: LayerKey): GridId {
  return layer === 'terrain' ? 'terrainBrush' : 'entityBrush';
}

export function getTerrainType(doc: MapDoc, x: number, y: number): TerrainType {
  if (!inBounds(doc, x, y)) return TERRAIN_NONE;
  return doc.terrainType[cellIndex(x, y, doc.width)] as TerrainType;
}

export function getObjectId(doc: MapDoc, layer: LayerKey, x: number, y: number): ObjectId {
  if (!inBounds(doc, x, y)) return 0;
  return getLayer(doc, layer).object[cellIndex(x, y, doc.width)];
}

/** 이 칸을 찍은 브러쉬의 id. 브러쉬로 칠해진 적 없으면 0. */
export function getBrushId(doc: MapDoc, layer: LayerKey, x: number, y: number): BrushId {
  if (!inBounds(doc, x, y)) return 0;
  return getLayer(doc, layer).brush[cellIndex(x, y, doc.width)];
}

export function createLayer(key: LayerKey, cells: number): Layer {
  return { key, visible: true, object: new Uint32Array(cells), brush: new Uint32Array(cells) };
}

export interface CreateDocOptions {
  name?: string;
}

/**
 * 새 맵을 만든다.
 *
 * 모든 칸은 None(미정)으로 시작한다. 어떤 칸이 벽이고 통로인지는 브러쉬로 직접
 * 그리거나 미로 생성 알고리즘이 정한다. 에디터가 미리 테두리를 벽으로 채우면
 * 생성 알고리즘 입장에서는 지워야 할 값이 이미 들어 있는 셈이 된다.
 */
export function createDoc(width: number, height: number, options: CreateDocOptions = {}): MapDoc {
  const { name = '새 맵' } = options;
  const w = normalizeMapSize(width);
  const h = normalizeMapSize(height);
  const cells = w * h;

  return {
    name,
    width: w,
    height: h,
    terrainType: new Uint8Array(cells),
    layers: [createLayer('terrain', cells), createLayer('entity', cells)],
  };
}

/**
 * 격자 크기와 모든 격자 데이터가 완전히 같은지 비교한다.
 * 결과가 이전과 똑같은 편집이 히스토리에 빈 항목을 남기지 않도록 하는 데 쓴다.
 */
export function sameGrid(a: MapDoc, b: MapDoc): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.layers.length !== b.layers.length) return false;
  if (!sameArray(a.terrainType, b.terrainType)) return false;
  for (let i = 0; i < a.layers.length; i++) {
    if (a.layers[i].key !== b.layers[i].key) return false;
    if (!sameArray(a.layers[i].object, b.layers[i].object)) return false;
    if (!sameArray(a.layers[i].brush, b.layers[i].brush)) return false;
  }
  return true;
}

function sameArray(left: Uint8Array | Uint32Array, right: Uint8Array | Uint32Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
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
  // 양쪽 모두 4n+3이라 차이는 4의 배수다. 정확히 가운데로 떨어지고, 옮겨진 뒤에도
  // 내용과 floor 격자의 정렬(2칸 간격)이 그대로 유지된다.
  return Math.floor((newSize - oldSize) / 2);
}

export interface ResizeOptions {
  anchor?: Anchor;
}

/**
 * 내용을 유지한 채 맵 크기를 바꾼다.
 *
 * 원본을 건드리지 않고 새 문서를 만든다. 덕분에 히스토리는 이전/이후 문서의
 * 참조만 들고 있으면 되고, 별도로 스냅샷을 복사할 필요가 없다.
 */
export function resizeDoc(doc: MapDoc, width: number, height: number, options: ResizeOptions = {}): MapDoc {
  const { anchor = DEFAULT_ANCHOR } = options;
  const w = normalizeMapSize(width);
  const h = normalizeMapSize(height);

  const offX = axisOffset(anchor.x === 'left' ? 'start' : anchor.x === 'right' ? 'end' : 'center', doc.width, w);
  const offY = axisOffset(anchor.y === 'top' ? 'start' : anchor.y === 'bottom' ? 'end' : 'center', doc.height, h);

  // 새 맵과 옛 맵이 겹치는 사각형만 복사한다. 벗어나는 부분은 잘린다.
  const x0 = Math.max(0, offX);
  const x1 = Math.min(w, offX + doc.width);
  const y0 = Math.max(0, offY);
  const y1 = Math.min(h, offY + doc.height);

  const copy = <T extends Uint8Array | Uint32Array>(src: T, dst: T): T => {
    for (let y = y0; y < y1; y++) {
      const srcBase = (y - offY) * doc.width - offX;
      const dstBase = y * w;
      for (let x = x0; x < x1; x++) dst[dstBase + x] = src[srcBase + x];
    }
    return dst;
  };

  const terrainType = copy(doc.terrainType, new Uint8Array(w * h));
  const layers = doc.layers.map((layer) => {
    const next = createLayer(layer.key, w * h);
    next.visible = layer.visible;
    copy(layer.object, next.object);
    copy(layer.brush, next.brush);
    return next;
  });

  return { ...doc, width: w, height: h, terrainType, layers };
}
