import type { BrushId, CellKind, LayerKey, ObjectId, TerrainType } from './types';
import { OBJECT_ID_MAX, OBJECT_ID_MIN, TERRAIN_EMPTY, TERRAIN_NONE, TERRAIN_WALL } from './types';

/** 브러쉬가 가질 수 있는 크기. 브러쉬마다 고정이며 사용 중에 바뀌지 않는다. */
export const BRUSH_SIZES = [1, 3, 5] as const;
export type BrushSize = (typeof BRUSH_SIZES)[number];

export const CELL_KINDS: CellKind[] = ['floor', 'wall', 'pillar'];

export const CELL_KIND_NAME: Record<CellKind, string> = {
  floor: 'floor (바닥)',
  wall: 'wall (벽)',
  pillar: 'pillar (기둥)',
};

/**
 * 엔티티 타입. entity 브러쉬에서만 의미가 있고, 미로 생성 알고리즘이나 게임이
 * 참고할 역할을 나타낸다. 시작·목표·아이템처럼 생성 알고리즘과 무관한 엔티티는
 * null로 둔다.
 *  - seed: 미로 생성 알고리즘에 쓰일 Seed 위치
 *  - monster: 몬스터 스폰
 */
export const ENTITY_TYPES = ['seed', 'monster'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_NAME: Record<EntityType, string> = {
  seed: 'Seed (미로 생성 시드 위치)',
  monster: 'Monster (몬스터 스폰)',
};

/**
 * 3D 미리보기 모델 타입.
 *
 * 이 브러쉬가 칠한 칸을 3D 미리보기에서 어떻게 세울지 정한다. 벽 계열
 * (default·special-wall·special-door·outer-wall)은 지형 타입이 Wall인 칸에서만
 * 의미가 있고 높이·모양만 달라진다. 장식물 계열(start/safe/boss-area, monster,
 * golem, plant)은 반대로 지나갈 수 있는 칸 위에 장식물을 하나 세운다. 어느 쪽인지는
 * layout3d.ts의 wallHeightOf / isPropModel이 판정한다.
 *
 * 값을 늘릴 때는 브러쉬 파일 버전을 올리지 않는다(io/brushes.ts의 스키마 주석 참고).
 *
 * 아래 키 문자열은 브러쉬 파일에 그대로 저장되므로 바꾸지 않는다. 보이는 이름만
 * 바꿀 때는 PREVIEW_MODEL_NAME·PREVIEW_MODEL_SHORT만 고친다 — 키를 바꾸면
 * 스키마의 .catch가 옛 파일의 그 값을 모두 기본 모델로 되돌려 버린다. 그래서
 * start-area가 '용사', safe-area가 '세계수', boss-area가 '나무 정령',
 * monster가 '늑대'로 보이는 식으로 키와 이름이 어긋나 있다.
 */
export const PREVIEW_MODELS = [
  'default',
  'special-wall',
  'special-door',
  'outer-wall',
  'start-area',
  'safe-area',
  'boss-area',
  'monster',
  'golem',
  'plant',
] as const;
export type PreviewModel = (typeof PREVIEW_MODELS)[number];

export const PREVIEW_MODEL_NAME: Record<PreviewModel, string> = {
  default: '기본',
  'special-wall': '특수지역 벽',
  'special-door': '특수지역 문',
  'outer-wall': '외곽 벽',
  'start-area': '용사',
  'safe-area': '세계수',
  'boss-area': '나무 정령',
  monster: '늑대',
  golem: '골렘',
  plant: '식충',
};

/** 팔레트 뱃지처럼 좁은 자리에 쓸 짧은 이름. 기본값은 표시하지 않는다. */
export const PREVIEW_MODEL_SHORT: Record<PreviewModel, string> = {
  default: '',
  'special-wall': '특수벽',
  'special-door': '문',
  'outer-wall': '외곽벽',
  'start-area': '용사',
  'safe-area': '세계수',
  'boss-area': '정령',
  monster: '늑대',
  golem: '골렘',
  plant: '식충',
};

/**
 * 브러쉬 정의.
 *
 * 브러쉬 세트 자체(이름·색·규칙 등)는 맵과 무관하게 따로 보관된다 (io/brushes.ts).
 * 다만 이 브러쉬의 id는 지형 타입·오브젝트 ID와 함께 맵 칸에도 기록되어, 나중에
 * 맵을 다시 열었을 때 각 칸이 어떤 브러쉬로 칠해졌는지 알 수 있게 한다.
 */
export interface Brush {
  id: BrushId;
  name: string;
  /** 팔레트에서 묶이는 그룹 이름 (예: '숲 지형', '엔티티'). 테마별로 늘어난다. */
  group: string;
  layer: LayerKey;
  /** 이 브러쉬가 칠하는 지형 타입. entity 레이어에서는 쓰이지 않는다. */
  terrainType: TerrainType;
  /** entity 레이어에서만 설정할 수 있다. terrain 브러쉬는 항상 null이다. */
  entityType: EntityType | null;
  allowedCellKinds: CellKind[];
  /** 칸 종류별로 맵에 기록할 오브젝트 ID. 허용하지 않는 칸의 값은 쓰이지 않는다. */
  objectIds: Record<CellKind, ObjectId>;
  /** 맵에 하나만 존재할 수 있는 브러쉬 (시작 지점, 목표 지점) */
  unique: boolean;
  /** entity 레이어는 항상 1이다. */
  size: BrushSize;
  /**
   * 하나의 덩어리로 인식할지.
   * true면 드래그로 이어 그릴 수 없고, 다른 덩어리와 겹치거나 맞닿을 수 없다.
   * 오브젝트 ID는 가운데 한 칸에만 기록되고 나머지 칸은 0이 된다.
   */
  blob: boolean;
  /** 채우기 가능 여부. 세 칸 종류를 모두 놓을 수 있을 때만 켤 수 있다. */
  fillable: boolean;
  /** null이면 이름과 종류에서 색을 자동으로 만든다. */
  color: string | null;
  /** 3D 미리보기에서 이 브러쉬가 칠한 칸을 어떻게 세울지. */
  previewModel: PreviewModel;
}

/** 브러쉬 편집 화면이 다루는 값. id는 저장 시점에 정해진다. */
export type BrushDraft = Omit<Brush, 'id'>;

export function zeroObjectIds(): Record<CellKind, ObjectId> {
  return { floor: 0, wall: 0, pillar: 0 };
}

export function sameObjectIdForAll(id: ObjectId): Record<CellKind, ObjectId> {
  return { floor: id, wall: id, pillar: id };
}

/**
 * 채우기를 켤 수 있는지.
 * 세 칸 종류를 모두 놓을 수 있어야 하고, unique나 blob은 "칸 하나(또는 덩어리
 * 하나)"를 전제하는 설정이라 "연결된 영역 전체를 같은 값으로 바꾼다"는 채우기와
 * 함께 쓰면 의미가 어긋난다 — 채우기가 unique 오브젝트를 여러 칸에 복제하거나,
 * blob의 "가운데 칸에만 ID를 남긴다"는 규칙과 충돌한다.
 */
export function canBeFillable(allowedCellKinds: CellKind[], blob: boolean, unique: boolean): boolean {
  return !blob && !unique && CELL_KINDS.every((k) => allowedCellKinds.includes(k));
}

export function objectIdFor(brush: Brush, kind: CellKind): ObjectId {
  return brush.objectIds[kind] ?? 0;
}

/**
 * 브러쉬 설정끼리 어긋나지 않도록 값을 맞춘다.
 * 편집 화면과 파일 가져오기 양쪽에서 같은 규칙을 쓰기 위해 한곳에 모아 둔다.
 */
export function normalizeDraft(draft: BrushDraft): BrushDraft {
  const allowed = CELL_KINDS.filter((k) => draft.allowedCellKinds.includes(k));
  // 하나도 없으면 아무 데도 못 그리는 브러쉬가 되므로 floor를 남긴다.
  const allowedCellKinds = allowed.length > 0 ? allowed : ['floor' as CellKind];
  const entity = draft.layer === 'entity';

  return {
    ...draft,
    name: draft.name.trim() || '이름 없음',
    group: draft.group.trim() || '기타',
    allowedCellKinds,
    // entity는 지형 타입을 쓰지 않으므로 None으로 고정해 파일에 헷갈리는 값이 남지 않게 한다.
    terrainType: entity ? TERRAIN_NONE : draft.terrainType,
    // 반대로 엔티티 타입은 entity 브러쉬에서만 의미가 있다.
    entityType: entity ? draft.entityType : null,
    size: entity ? 1 : draft.size,
    fillable: canBeFillable(allowedCellKinds, draft.blob, draft.unique) && draft.fillable,
    // 파일에서 온 값이 목록에 없는 문자열일 수 있다. 모르는 모델은 기본으로 되돌린다.
    previewModel: PREVIEW_MODELS.includes(draft.previewModel) ? draft.previewModel : 'default',
    objectIds: {
      floor: sanitizeObjectId(draft.objectIds.floor),
      wall: sanitizeObjectId(draft.objectIds.wall),
      pillar: sanitizeObjectId(draft.objectIds.pillar),
    },
  };
}

/**
 * 오브젝트 ID를 저장할 수 있는 정수로 맞춘다.
 * 음수는 그대로 두고, 소수점은 0 쪽으로 버리며(-2.7 → -2), 맵 격자(Int32Array)에
 * 들어가는 범위로 자른다. 파일 가져오기(normalizeDraft)와 편집 창 입력이 같은
 * 규칙을 쓰도록 여기 하나만 둔다.
 */
export function sanitizeObjectId(value: number): ObjectId {
  if (!Number.isFinite(value)) return 0;
  // `|| 0`은 -0을 0으로 바꾼다.
  const id = Math.trunc(value) || 0;
  return Math.min(OBJECT_ID_MAX, Math.max(OBJECT_ID_MIN, id));
}

/** 이름이 같으면 항상 같은 색이 나온다. 브러쉬를 여러 개 만들어도 서로 구분된다. */
function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * 자동 색.
 * 색조는 이름에서 뽑고, 채도와 밝기는 종류에서 정한다. 덕분에 같은 종류끼리는
 * 비슷한 톤으로 보이면서도 브러쉬마다 색이 갈린다.
 */
export function autoColor(name: string, layer: LayerKey, terrainType: TerrainType): string {
  const hue = hueOf(name);
  if (layer === 'entity') return `hsl(${hue}, 70%, 62%)`;
  if (terrainType === TERRAIN_WALL) return `hsl(${hue}, 14%, 52%)`;
  if (terrainType === TERRAIN_EMPTY) return `hsl(${hue}, 16%, 22%)`;
  return `hsl(${hue}, 10%, 16%)`;
}

export function brushColor(brush: Brush): string {
  return brush.color ?? autoColor(brush.name, brush.layer, brush.terrainType);
}

/** 기존 브러쉬들과 겹치지 않는 다음 정수 id. */
export function newBrushId(existing: Brush[]): BrushId {
  return existing.reduce((max, b) => Math.max(max, b.id), 0) + 1;
}

/**
 * 팔레트에서 브러쉬 하나를 다른 자리로 옮긴 새 배열을 돌려준다.
 *
 * 팔레트의 표시 순서·숫자 단축키(1~9)·그룹 묶음이 모두 이 배열 순서 하나로
 * 정해지고, io/brushes.ts가 배열을 그 순서 그대로 저장하고 불러온다. 그래서
 * "정렬 값"을 브러쉬마다 따로 두지 않고 배열 순서 자체가 정렬 값이다.
 *
 * beforeId가 가리키는 브러쉬 바로 앞에 끼워 넣는다. beforeId가 null이거나
 * 목록에 없으면 targetGroup의 마지막 브러쉬 뒤에 붙인다(그 그룹이 아직
 * 비어 있으면 배열 맨 끝). 옮긴 자리의 그룹이 원래 그룹과 다르면 브러쉬의
 * group도 그 그룹으로 바꾼다 — 팔레트가 group별로 나눠 보여 주므로, 안 바꾸면
 * 옮긴 자리에 머무르지 못하고 원래 그룹으로 튕겨 나온다.
 *
 * 옮길 필요가 없으면(브러쉬를 못 찾거나 자기 앞에 놓는 경우) 원본 배열을
 * 그대로 돌려준다 — 부르는 쪽에서 참조 비교로 "바뀐 게 없음"을 알 수 있다.
 */
export function reorderBrushes(
  brushes: Brush[],
  draggedId: BrushId,
  targetGroup: string,
  beforeId: BrushId | null,
): Brush[] {
  if (draggedId === beforeId) return brushes;
  const dragged = brushes.find((b) => b.id === draggedId);
  if (!dragged) return brushes;

  const moved = dragged.group === targetGroup ? dragged : { ...dragged, group: targetGroup };
  const rest = brushes.filter((b) => b.id !== draggedId);

  let insertAt = rest.findIndex((b) => b.id === beforeId);
  if (insertAt === -1) {
    insertAt = rest.length;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i].group === targetGroup) {
        insertAt = i + 1;
        break;
      }
    }
  }

  // rest에서 insertAt 자리는 원래 배열에서 dragged가 있던 자리와 같은 지점이다
  // (제거하면서 뒤쪽이 한 칸씩 당겨졌으므로). 그룹도 그대로면 바뀐 게 없다.
  if (moved === dragged && insertAt === brushes.indexOf(dragged)) return brushes;

  return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
}

const GROUP_FOREST = '숲 지형';
const GROUP_ENTITY = '엔티티';

/** 저장된 브러쉬가 없을 때 쓰는 기본 세트. */
export function defaultBrushes(): Brush[] {
  return [
    {
      id: 1,
      name: '바닥',
      group: GROUP_FOREST,
      layer: 'terrain',
      terrainType: TERRAIN_EMPTY,
      entityType: null,
      allowedCellKinds: [...CELL_KINDS],
      objectIds: zeroObjectIds(),
      unique: false,
      size: 1,
      blob: false,
      fillable: true,
      color: '#232834',
      previewModel: 'default',
    },
    {
      id: 2,
      name: '벽',
      group: GROUP_FOREST,
      layer: 'terrain',
      terrainType: TERRAIN_WALL,
      entityType: null,
      // floor 칸은 항상 지나갈 수 있어야 하므로 벽을 놓을 수 없다.
      allowedCellKinds: ['wall', 'pillar'],
      objectIds: zeroObjectIds(),
      unique: false,
      size: 1,
      blob: false,
      fillable: false,
      color: '#6b7689',
      previewModel: 'default',
    },
    {
      id: 3,
      name: '시작',
      group: GROUP_ENTITY,
      layer: 'entity',
      terrainType: TERRAIN_NONE,
      entityType: null,
      allowedCellKinds: [...CELL_KINDS],
      objectIds: sameObjectIdForAll(1),
      unique: true,
      size: 1,
      blob: false,
      fillable: false,
      color: '#4ade80',
      previewModel: 'default',
    },
    {
      id: 4,
      name: '목표',
      group: GROUP_ENTITY,
      layer: 'entity',
      terrainType: TERRAIN_NONE,
      entityType: null,
      allowedCellKinds: [...CELL_KINDS],
      objectIds: sameObjectIdForAll(2),
      unique: true,
      size: 1,
      blob: false,
      fillable: false,
      color: '#f472b6',
      previewModel: 'default',
    },
    {
      id: 5,
      name: '아이템',
      group: GROUP_ENTITY,
      layer: 'entity',
      terrainType: TERRAIN_NONE,
      entityType: null,
      allowedCellKinds: [...CELL_KINDS],
      objectIds: sameObjectIdForAll(3),
      unique: false,
      size: 1,
      blob: false,
      fillable: false,
      color: '#fbbf24',
      previewModel: 'default',
    },
    {
      id: 6,
      name: '적 스폰',
      group: GROUP_ENTITY,
      layer: 'entity',
      terrainType: TERRAIN_NONE,
      entityType: null,
      allowedCellKinds: [...CELL_KINDS],
      objectIds: sameObjectIdForAll(4),
      unique: false,
      size: 1,
      blob: false,
      fillable: false,
      color: '#f87171',
      previewModel: 'default',
    },
  ];
}

/**
 * id로 브러쉬를 찾기 위한 조회 테이블.
 * 렌더러가 칸 색을 정할 때, 호버 정보를 보여줄 때 프레임마다 쓰므로 배열 참조가
 * 바뀔 때만 다시 만든다. 맵 칸에는 브러쉬 id가 직접 기록되어 있으므로(Layer.brush)
 * 오브젝트 ID처럼 레이어별로 나눠 찾을 필요가 없다.
 */
export type BrushIndex = Map<BrushId, Brush>;

export function buildBrushIndex(brushes: Brush[]): BrushIndex {
  const m: BrushIndex = new Map();
  for (const b of brushes) m.set(b.id, b);
  return m;
}

let cachedSource: Brush[] | null = null;
let cachedIndex: BrushIndex | null = null;

export function brushIndex(brushes: Brush[]): BrushIndex {
  if (cachedSource !== brushes || !cachedIndex) {
    cachedSource = brushes;
    cachedIndex = buildBrushIndex(brushes);
  }
  return cachedIndex;
}

export function findBrushById(index: BrushIndex, id: BrushId): Brush | undefined {
  return id === 0 ? undefined : index.get(id);
}
