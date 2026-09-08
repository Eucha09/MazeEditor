/**
 * 에디터의 핵심 데이터 타입.
 * 이 파일을 포함한 core/ 이하는 React와 DOM에 의존하지 않는다.
 * 게임 런타임에서 그대로 재사용할 수 있도록 유지할 것.
 */

/** 타일 ID. 0은 "비어있음"으로 예약되어 있다. */
export type TileId = number;

export type LayerKey = 'terrain' | 'entity';

export interface TileDef {
  id: TileId;
  /** 코드에서 참조할 안정적인 식별자 */
  key: string;
  /** UI 표시용 이름 */
  name: string;
  color: string;
  /** 게임에서 통과할 수 없는 타일인지 */
  solid: boolean;
  /** 맵에 하나만 존재할 수 있는 타일 (시작 지점, 목표 지점) */
  unique: boolean;
  /** 이 타일이 찍히는 레이어 */
  layer: LayerKey;
}

export interface Layer {
  key: LayerKey;
  name: string;
  visible: boolean;
  /** 지우개가 이 레이어에 써 넣는 값 */
  defaultTile: TileId;
  /** 길이 width * height. index = y * width + x */
  data: Uint16Array;
}

export interface MapDoc {
  name: string;
  width: number;
  height: number;
  tileset: TileDef[];
  layers: Layer[];
}

export interface CellPos {
  x: number;
  y: number;
}

export type ToolId = 'brush' | 'eraser';
