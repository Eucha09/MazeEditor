import type { Layer, LayerKey, MapDoc, TileId } from './types';
import { DEFAULT_TILESET, TILE_FLOOR, TILE_NONE, TILE_WALL } from './tileset';

export const MIN_MAP_SIZE = 3;
export const MAX_MAP_SIZE = 512;

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

export interface CreateDocOptions {
  name?: string;
  /** 테두리를 벽으로 채운다. 미로는 바깥이 막혀 있어야 하므로 기본값 true. */
  borderWalls?: boolean;
}

export function createDoc(width: number, height: number, options: CreateDocOptions = {}): MapDoc {
  const { name = '새 맵', borderWalls = true } = options;
  const cells = width * height;

  const terrain = createLayer('terrain', '지형', TILE_FLOOR, cells);
  const entity = createLayer('entity', '엔티티', TILE_NONE, cells);

  if (borderWalls) {
    for (let x = 0; x < width; x++) {
      terrain.data[cellIndex(x, 0, width)] = TILE_WALL;
      terrain.data[cellIndex(x, height - 1, width)] = TILE_WALL;
    }
    for (let y = 0; y < height; y++) {
      terrain.data[cellIndex(0, y, width)] = TILE_WALL;
      terrain.data[cellIndex(width - 1, y, width)] = TILE_WALL;
    }
  }

  return {
    name,
    width,
    height,
    tileset: DEFAULT_TILESET.map((t) => ({ ...t })),
    layers: [terrain, entity],
  };
}

export function clampMapSize(n: number): number {
  if (!Number.isFinite(n)) return MIN_MAP_SIZE;
  return Math.min(MAX_MAP_SIZE, Math.max(MIN_MAP_SIZE, Math.floor(n)));
}
