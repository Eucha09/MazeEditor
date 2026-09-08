import type { TileDef, TileId } from './types';

/** 0은 "비어있음". 엔티티 레이어의 기본값이며 팔레트에는 나타나지 않는다. */
export const TILE_NONE: TileId = 0;

export const TILE_FLOOR: TileId = 1;
export const TILE_WALL: TileId = 2;
export const TILE_START: TileId = 3;
export const TILE_GOAL: TileId = 4;
export const TILE_ITEM: TileId = 5;
export const TILE_ENEMY: TileId = 6;

export const DEFAULT_TILESET: TileDef[] = [
  { id: TILE_FLOOR, key: 'floor', name: '바닥', color: '#232834', solid: false, unique: false, layer: 'terrain' },
  { id: TILE_WALL, key: 'wall', name: '벽', color: '#6b7689', solid: true, unique: false, layer: 'terrain' },
  { id: TILE_START, key: 'start', name: '시작', color: '#4ade80', solid: false, unique: true, layer: 'entity' },
  { id: TILE_GOAL, key: 'goal', name: '목표', color: '#f472b6', solid: false, unique: true, layer: 'entity' },
  { id: TILE_ITEM, key: 'item', name: '아이템', color: '#fbbf24', solid: false, unique: false, layer: 'entity' },
  { id: TILE_ENEMY, key: 'enemy', name: '적 스폰', color: '#f87171', solid: false, unique: false, layer: 'entity' },
];

/** id로 타일 정의를 빠르게 찾기 위한 조회 테이블. */
export function indexTileset(tileset: TileDef[]): Map<TileId, TileDef> {
  const m = new Map<TileId, TileDef>();
  for (const t of tileset) m.set(t.id, t);
  return m;
}

let cachedSource: TileDef[] | null = null;
let cachedIndex: Map<TileId, TileDef> | null = null;

/**
 * indexTileset의 메모이즈 버전.
 * 렌더 루프(매 프레임)와 브러쉬(칠하는 셀마다)에서 호출되므로 매번 Map을 새로 만들면 안 된다.
 * 타일셋 배열의 참조가 바뀔 때만 다시 만든다.
 */
export function tilesetIndex(tileset: TileDef[]): Map<TileId, TileDef> {
  if (cachedSource !== tileset || !cachedIndex) {
    cachedSource = tileset;
    cachedIndex = indexTileset(tileset);
  }
  return cachedIndex;
}
