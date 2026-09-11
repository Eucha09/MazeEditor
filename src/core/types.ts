/**
 * 에디터의 핵심 데이터 타입.
 * 이 파일을 포함한 core/ 이하는 React와 DOM에 의존하지 않는다.
 * 게임 런타임에서 그대로 재사용할 수 있도록 유지할 것.
 */

/**
 * 지형 타입. 게임의 통행 판정 기준이며 맵 파일에 그대로 저장된다.
 *  - None: 아직 정해지지 않음 (미로 생성 알고리즘이 채울 예정)
 *  - Empty: 지나갈 수 있음
 *  - Wall: 지나갈 수 없음
 */
export const TERRAIN_NONE = 0;
export const TERRAIN_EMPTY = 1;
export const TERRAIN_WALL = 2;
export type TerrainType = typeof TERRAIN_NONE | typeof TERRAIN_EMPTY | typeof TERRAIN_WALL;

export const TERRAIN_TYPES: TerrainType[] = [TERRAIN_NONE, TERRAIN_EMPTY, TERRAIN_WALL];

export const TERRAIN_TYPE_NAME: Record<TerrainType, string> = {
  [TERRAIN_NONE]: 'None (미정)',
  [TERRAIN_EMPTY]: 'Empty (통행 가능)',
  [TERRAIN_WALL]: 'Wall (통행 불가)',
};

export type LayerKey = 'terrain' | 'entity';

/**
 * 중앙 기준 격자 위치에 따른 칸 종류. (lattice.ts의 cellKind 참고)
 *  - floor: 중앙과 가로·세로 모두 2칸 간격인 칸. 항상 지나갈 수 있어야 한다.
 *  - wall: floor 칸들 사이에 있는 칸. 통로를 막는 벽 한 칸.
 *  - pillar: wall 칸들 사이, 즉 floor 네 칸이 대각선으로 맞닿는 교차점.
 */
export type CellKind = 'floor' | 'wall' | 'pillar';

/**
 * 게임에서 참조할 오브젝트 ID. 0은 "오브젝트 없음".
 * 음수도 쓸 수 있다. 그래서 맵 격자는 부호 있는 32비트 정수(Int32Array)로 저장하고,
 * 값은 아래 범위 안이어야 한다.
 */
export type ObjectId = number;
export const OBJECT_ID_MIN = -2147483648;
export const OBJECT_ID_MAX = 2147483647;

/** 브러쉬 정의의 정수 식별자. 0은 "브러쉬로 칠해진 적 없음". (core/brush.ts 참고) */
export type BrushId = number;

/** 문서 안의 격자 배열. 지형 타입은 Uint8, 오브젝트 ID는 Int32, 브러쉬 id는 Uint32다. */
export type GridArray = Uint8Array | Int32Array | Uint32Array;

export interface Layer {
  key: LayerKey;
  visible: boolean;
  /**
   * 길이 width * height. index = y * width + x. 0이면 오브젝트 없음.
   * 음수 ID를 담아야 하므로 부호 있는 Int32Array다 — 부호 없는 배열에 음수를 넣으면
   * 큰 양수로 바뀌어 버린다.
   */
  object: Int32Array;
  /**
   * 이 칸을 찍은 브러쉬의 id. 게임은 쓰지 않는 에디터 전용 메타데이터로,
   * 같은 오브젝트 ID를 여러 브러쉬가 공유해도 어떤 브러쉬였는지 정확히 추적하고
   * (호버 정보, unique 브러쉬 재배치 시 이전 칸 찾기), 맵을 다시 열었을 때 어떤
   * 브러쉬로 칠했는지 알 수 있게 한다.
   */
  brush: Uint32Array;
}

export interface MapDoc {
  name: string;
  width: number;
  height: number;
  /** 지형 타입 격자. terrain 레이어에 대응하며 entity 레이어에는 없다. */
  terrainType: Uint8Array;
  layers: Layer[];
}

/**
 * 편집 대상이 되는 격자의 식별자.
 * 히스토리가 "어느 격자의 몇 번 칸이 무엇에서 무엇으로 바뀌었는지"만 기록하면
 * 되도록, 문서 안의 모든 격자에 이름을 붙여 둔다.
 */
export type GridId = 'terrainType' | 'terrainObject' | 'terrainBrush' | 'entityObject' | 'entityBrush';

export interface CellPos {
  x: number;
  y: number;
}

export type ToolId = 'brush' | 'eraser' | 'fill';
