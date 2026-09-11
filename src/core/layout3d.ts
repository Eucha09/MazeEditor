import type { PreviewModel } from './brush';
import { centerCell } from './lattice';
import { getLayer } from './tilemap';
import type { BrushId, MapDoc } from './types';
import { TERRAIN_WALL } from './types';

/**
 * 격자 좌표 → 3D 월드 좌표 환산.
 *
 * 에디터의 2D 격자는 모든 칸이 같은 크기지만, 실제 게임의 3D 맵에서는 칸 종류에
 * 따라 가로·세로 길이가 다르다. 방(floor)은 넓고, 그 사이의 통로 벽(wall)은 한
 * 방향으로만 얇으며, 교차점(pillar)은 양쪽 모두 얇다.
 *
 *   floor  16.5 × 16.5
 *   wall   16.5 × 3  또는  3 × 16.5
 *   pillar  3 × 3
 *
 * 길이가 축마다 따로 정해진다는 점이 핵심이다. 어떤 칸의 x 길이는 그 칸이 놓인
 * 열이 중앙과 짝수 간격인지(= floor 열인지)로만 정해지고, y 길이는 행으로만
 * 정해진다. 위 표는 이 규칙을 칸 종류로 다시 쓴 것일 뿐이다. 덕분에 축별 누적
 * 길이(edges)를 한 번 구해 두면 모든 칸의 위치와 크기를 바로 얻을 수 있다.
 *
 * core/의 다른 파일과 마찬가지로 DOM·three.js에 의존하지 않는다. 게임 런타임이
 * 실제 맵을 만들 때도 같은 값을 써야 하므로 렌더러가 아니라 여기에 둔다.
 */

/** floor 칸의 한 변 길이. */
export const FLOOR_SPAN = 16.5;
/** 얇은 쪽(wall의 짧은 변, pillar의 두 변) 길이. */
export const WALL_SPAN = 3;
/** 지면 위로 솟은 벽의 높이. */
export const WALL_HEIGHT = 7.4;
/** 특수지역을 두르는 벽. 일반 벽보다 조금 높다. 특수지역 문도 같은 높이다. */
export const SPECIAL_WALL_HEIGHT = 11.1;
/** 맵 바깥을 두르는 벽. 일반 벽보다 많이 높다. */
export const OUTER_WALL_HEIGHT = 22.5;

/**
 * 3D 미리보기 모델별 벽 높이. 벽 계열이 아니면 null.
 * 높이는 게임 런타임도 그대로 써야 하는 값이라 렌더러가 아니라 여기에 둔다.
 */
export function wallHeightOf(model: PreviewModel): number | null {
  switch (model) {
    case 'default':
      return WALL_HEIGHT;
    case 'special-wall':
    case 'special-door':
      return SPECIAL_WALL_HEIGHT;
    case 'outer-wall':
      return OUTER_WALL_HEIGHT;
    default:
      return null;
  }
}

/** 지나갈 수 있는 칸 위에 장식물을 세우는 모델인지. */
export function isPropModel(model: PreviewModel): boolean {
  return (
    model === 'start-area' ||
    model === 'safe-area' ||
    model === 'boss-area' ||
    model === 'monster' ||
    model === 'golem' ||
    model === 'plant'
  );
}

/** 격자 축. x는 열(width), y는 행(height)에 대응한다. */
export type Axis = 'x' | 'y';

/**
 * 한 칸이 해당 축에서 차지하는 길이.
 * 중앙과 짝수 간격인 열·행이 floor 격자이므로 넓고, 그 사이는 얇다.
 */
export function cellSpan(doc: MapDoc, axis: Axis, index: number): number {
  const center = centerCell(doc);
  const distance = index - (axis === 'x' ? center.x : center.y);
  return distance % 2 === 0 ? FLOOR_SPAN : WALL_SPAN;
}

/**
 * 맵 전체의 3D 배치.
 *
 * xEdges[i]는 i번 열이 시작하는 월드 x좌표이고 xEdges[width]가 맵의 오른쪽 끝이다
 * (zEdges도 행에 대해 같다). 맵 중앙이 원점에 오도록 좌표를 옮겨 두었으므로
 * 범위는 -totalX/2 … +totalX/2 가 된다. 격자 y는 3D의 z축에 대응한다.
 */
export interface MapLayout3D {
  /** 길이 doc.width + 1 */
  xEdges: Float64Array;
  /** 길이 doc.height + 1 */
  zEdges: Float64Array;
  totalX: number;
  totalZ: number;
}

function axisEdges(count: number, center: number): { edges: Float64Array; total: number } {
  const edges = new Float64Array(count + 1);
  let sum = 0;
  for (let i = 0; i < count; i++) {
    edges[i] = sum;
    sum += (i - center) % 2 === 0 ? FLOOR_SPAN : WALL_SPAN;
  }
  edges[count] = sum;
  // 맵 중앙이 원점에 오도록 통째로 옮긴다.
  const half = sum / 2;
  for (let i = 0; i <= count; i++) edges[i] -= half;
  return { edges, total: sum };
}

export function mapLayout3D(doc: MapDoc): MapLayout3D {
  const center = centerCell(doc);
  const x = axisEdges(doc.width, center.x);
  const z = axisEdges(doc.height, center.y);
  return { xEdges: x.edges, zEdges: z.edges, totalX: x.total, totalZ: z.total };
}

/** 한 칸이 차지하는 월드 영역. y(높이)는 쓰는 쪽에서 정한다. */
export interface CellBox3D {
  /** 칸 가운데의 월드 좌표 */
  cx: number;
  cz: number;
  /** 칸의 가로·세로 길이 */
  sx: number;
  sz: number;
}

export function cellBox3D(layout: MapLayout3D, x: number, y: number): CellBox3D {
  const x0 = layout.xEdges[x];
  const x1 = layout.xEdges[x + 1];
  const z0 = layout.zEdges[y];
  const z1 = layout.zEdges[y + 1];
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, sx: x1 - x0, sz: z1 - z0 };
}

/** 3D 미리보기에서 한 칸에 무엇을 세울지 알려 주는 콜백 묶음. */
export interface PreviewVisitors {
  /** 지형 타입이 Wall인 칸. model은 벽 계열이고 height는 그 모델의 높이다. */
  wall(model: PreviewModel, height: number, cx: number, cz: number, sx: number, sz: number): void;
  /** 지나갈 수 있는 칸에 놓인 지역 장식물. 칸 가운데(cx, cz)에 하나 세운다. */
  prop(model: PreviewModel, cx: number, cz: number, sx: number, sz: number): void;
}

/**
 * 미리보기 격자를 칸마다 훑으면서 무엇을 세울지 알려 준다.
 *
 * 칸마다 상자를 하나씩 세우는 단순한 방식이다. 이어진 벽을 하나로 합치면
 * 상자 수는 줄겠지만, 어차피 인스턴싱으로 한 번에 그리므로 합치는 대신
 * "격자 한 칸 = 상자 하나"라는 대응을 그대로 두는 편이 이해하기 쉽다.
 * 객체를 만들지 않도록 값을 콜백 인자로 넘긴다 (가장 큰 맵은 26만 칸이다).
 *
 * 어떤 모델을 쓸지는 그 칸을 칠한 브러쉬가 정한다(modelOfBrush). 두 레이어를
 * 모두 보되 지형 브러쉬를 먼저 본다 — 벽 모양은 지형 쪽 설정이고, 지역
 * 장식물은 보통 엔티티 브러쉬에 붙기 때문이다.
 *
 * 벽 계열 모델은 지형 타입이 Wall인 칸에서만 세운다. 미로 생성기가 그 칸을
 * 뚫어 버렸다면 브러쉬 설정과 무관하게 통로이므로 아무것도 세우지 않는다.
 * 반대로 지역 장식물은 지나갈 수 있는 칸에만 세운다 — 벽 속에 갇힌 용사나
 * 나무는 미리보기에서 오히려 헷갈린다.
 */
export function forEachPreviewCell(
  doc: MapDoc,
  terrainType: Uint8Array,
  layout: MapLayout3D,
  modelOfBrush: (brushId: BrushId) => PreviewModel,
  visit: PreviewVisitors,
): void {
  const terrainBrush = getLayer(doc, 'terrain').brush;
  const entityBrush = getLayer(doc, 'entity').brush;

  for (let y = 0; y < doc.height; y++) {
    const z0 = layout.zEdges[y];
    const z1 = layout.zEdges[y + 1];
    const row = y * doc.width;

    for (let x = 0; x < doc.width; x++) {
      const i = row + x;
      const fromTerrain = modelOfBrush(terrainBrush[i]);
      const fromEntity = modelOfBrush(entityBrush[i]);
      if (fromTerrain === 'default' && fromEntity === 'default' && terrainType[i] !== TERRAIN_WALL) {
        continue;
      }

      const x0 = layout.xEdges[x];
      const x1 = layout.xEdges[x + 1];
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const sx = x1 - x0;
      const sz = z1 - z0;

      if (terrainType[i] === TERRAIN_WALL) {
        const model = pickWallModel(fromTerrain, fromEntity);
        visit.wall(model, wallHeightOf(model) ?? WALL_HEIGHT, cx, cz, sx, sz);
        continue;
      }

      const prop = isPropModel(fromTerrain) ? fromTerrain : isPropModel(fromEntity) ? fromEntity : null;
      if (prop) visit.prop(prop, cx, cz, sx, sz);
    }
  }
}

/** 벽 칸에 쓸 모델. 벽 계열로 지정된 쪽이 있으면 그것을, 없으면 기본 벽을 쓴다. */
function pickWallModel(fromTerrain: PreviewModel, fromEntity: PreviewModel): PreviewModel {
  for (const model of [fromTerrain, fromEntity]) {
    if (model !== 'default' && wallHeightOf(model) !== null) return model;
  }
  return 'default';
}
