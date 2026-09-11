import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_MAP_SIZE,
  MIN_MAP_SIZE,
  cellIndex,
  createDoc,
  getBrushId,
  getGrid,
  getLayer,
  isValidMapSize,
  normalizeMapSize,
  resizeDoc,
  sameGrid,
  type Anchor,
} from './tilemap';
import { centerCell, cellKind, isProtectedCell } from './lattice';
import type { Brush } from './brush';
import {
  autoColor,
  brushColor,
  buildBrushIndex,
  canBeFillable,
  defaultBrushes,
  findBrushById,
  newBrushId,
  normalizeDraft,
  objectIdFor,
  reorderBrushes,
  sameObjectIdForAll,
  zeroObjectIds,
} from './brush';
import { History, type Stroke } from './history';
import { forEachBrushCell, forEachLineCell } from './tools/brush';
import { checkBlobPlacement } from './tools/place';
import { floodFillRegion } from './tools/fill';
import { generateMazePreview } from './tools/generateMaze';
import { computeBrushResync } from './tools/resyncBrush';
import type { MapLayout3D } from './layout3d';
import {
  FLOOR_SPAN,
  OUTER_WALL_HEIGHT,
  SPECIAL_WALL_HEIGHT,
  WALL_HEIGHT,
  WALL_SPAN,
  cellBox3D,
  cellSpan,
  forEachPreviewCell,
  isPropModel,
  mapLayout3D,
  wallHeightOf,
} from './layout3d';
import { parseJson, toJson } from './io/serialize';
import { mapFileSchema } from './io/schema';
import type { GridId, MapDoc } from './types';
import { OBJECT_ID_MAX, OBJECT_ID_MIN, TERRAIN_EMPTY, TERRAIN_NONE, TERRAIN_WALL } from './types';

/** 스토어가 하는 일과 동일하게, 변경을 기록하면서 격자 한 칸에 값을 쓴다. */
function write(doc: MapDoc, stroke: Stroke, grid: GridId, x: number, y: number, value: number): void {
  const data = getGrid(doc, grid);
  const index = cellIndex(x, y, doc.width);
  const before = data[index];
  if (before === value) return;
  data[index] = value;
  stroke.changes.push({ grid, index, before, after: value });
}

function makeBrush(over: Partial<Brush> = {}): Brush {
  return {
    id: 999,
    name: '테스트',
    group: '테스트',
    layer: 'terrain',
    terrainType: TERRAIN_WALL,
    entityType: null,
    allowedCellKinds: ['floor', 'wall', 'pillar'],
    objectIds: zeroObjectIds(),
    unique: false,
    size: 1,
    blob: false,
    fillable: false,
    color: null,
    previewModel: 'default',
    ...over,
  };
}

/** 테스트에서 쓰기 편하도록 forEachPreviewCell 결과를 배열로 모은다. */
function collectPreview(
  doc: MapDoc,
  terrainType: Uint8Array,
  layout: MapLayout3D,
  brushes: Brush[] = [],
) {
  const walls: Array<{ model: string; height: number; cx: number; cz: number; sx: number; sz: number }> = [];
  const props: Array<{ model: string; cx: number; cz: number }> = [];
  const modelOf = (id: number) => brushes.find((b) => b.id === id)?.previewModel ?? 'default';
  forEachPreviewCell(doc, terrainType, layout, modelOf, {
    wall: (model, height, cx, cz, sx, sz) => walls.push({ model, height, cx, cz, sx, sz }),
    prop: (model, cx, cz) => props.push({ model, cx, cz }),
  });
  return { walls, props };
}

describe('createDoc', () => {
  it('모든 칸이 None(미정)이고 오브젝트·브러쉬 id가 없다', () => {
    const doc = createDoc(11, 7);

    expect(doc.terrainType.length).toBe(77);
    expect(doc.terrainType.every((v) => v === TERRAIN_NONE)).toBe(true);
    expect(getLayer(doc, 'terrain').object.every((v) => v === 0)).toBe(true);
    expect(getLayer(doc, 'terrain').brush.every((v) => v === 0)).toBe(true);
    expect(getLayer(doc, 'entity').object.every((v) => v === 0)).toBe(true);
    expect(getLayer(doc, 'entity').brush.every((v) => v === 0)).toBe(true);
  });

  it('getBrushId는 범위 밖에서 0을 돌려준다', () => {
    const doc = createDoc(11, 7);
    getLayer(doc, 'terrain').brush[cellIndex(3, 2, doc.width)] = 42;
    expect(getBrushId(doc, 'terrain', 3, 2)).toBe(42);
    expect(getBrushId(doc, 'terrain', -1, 2)).toBe(0);
    expect(getBrushId(doc, 'terrain', 3, 999)).toBe(0);
  });

  it('두 레이어의 격자 크기가 같다', () => {
    const doc = createDoc(11, 7);
    expect(getLayer(doc, 'entity').object.length).toBe(doc.terrainType.length);
  });
});

describe('브러쉬 기하', () => {
  it('크기 3 브러쉬는 중심 주변 9칸을 덮는다', () => {
    const cells: string[] = [];
    forEachBrushCell(5, 5, 3, (x, y) => cells.push(`${x},${y}`));
    expect(cells).toHaveLength(9);
    expect(cells).toContain('4,4');
    expect(cells).toContain('5,5');
    expect(cells).toContain('6,6');
  });

  it('직선은 양 끝점을 포함하고 중간에 끊기지 않는다', () => {
    const cells: Array<[number, number]> = [];
    forEachLineCell(0, 0, 7, 3, (x, y) => cells.push([x, y]));

    expect(cells[0]).toEqual([0, 0]);
    expect(cells[cells.length - 1]).toEqual([7, 3]);
    // 연속한 셀은 항상 8방향으로 인접해야 한다 (점선이 생기지 않는다).
    for (let i = 1; i < cells.length; i++) {
      const dx = Math.abs(cells[i][0] - cells[i - 1][0]);
      const dy = Math.abs(cells[i][1] - cells[i - 1][1]);
      expect(Math.max(dx, dy)).toBe(1);
    }
  });
});

describe('History', () => {
  it('undo는 스트로크 이전 상태를 정확히 복원한다', () => {
    const doc = createDoc(11, 11);
    const snapshot = Uint8Array.from(doc.terrainType);

    const history = new History();
    const stroke: Stroke = { label: 'brush', changes: [] };
    forEachLineCell(2, 2, 8, 8, (x, y) => write(doc, stroke, 'terrainType', x, y, TERRAIN_WALL));
    expect(history.commit(stroke)).toBe(true);
    expect(doc.terrainType).not.toEqual(snapshot);

    expect(history.undo(doc)).toBe(doc);
    expect(doc.terrainType).toEqual(snapshot);

    expect(history.redo(doc)).toBe(doc);
    expect(doc.terrainType[cellIndex(5, 5, 11)]).toBe(TERRAIN_WALL);
  });

  it('지형 타입과 오브젝트 ID를 한 스트로크에서 함께 되돌린다', () => {
    const doc = createDoc(11, 11);
    const history = new History();
    const stroke: Stroke = { label: 'brush', changes: [] };

    write(doc, stroke, 'terrainType', 3, 3, TERRAIN_WALL);
    write(doc, stroke, 'terrainObject', 3, 3, 42);
    write(doc, stroke, 'entityObject', 5, 5, 7);
    history.commit(stroke);

    history.undo(doc);
    const i = cellIndex(3, 3, 11);
    expect(doc.terrainType[i]).toBe(TERRAIN_NONE);
    expect(getLayer(doc, 'terrain').object[i]).toBe(0);
    expect(getLayer(doc, 'entity').object[cellIndex(5, 5, 11)]).toBe(0);
  });

  it('값이 바뀌지 않은 스트로크는 히스토리에 쌓지 않는다', () => {
    const doc = createDoc(11, 11);
    const history = new History();
    const stroke: Stroke = { label: 'brush', changes: [] };
    // 이미 None인 칸에 None을 칠한다.
    write(doc, stroke, 'terrainType', 5, 5, TERRAIN_NONE);
    expect(history.commit(stroke)).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('새 스트로크를 쌓으면 redo 스택이 비워진다', () => {
    const doc = createDoc(11, 11);
    const history = new History();

    const first: Stroke = { label: 'brush', changes: [] };
    write(doc, first, 'terrainType', 4, 4, TERRAIN_WALL);
    history.commit(first);
    history.undo(doc);
    expect(history.canRedo).toBe(true);

    const second: Stroke = { label: 'brush', changes: [] };
    write(doc, second, 'terrainType', 5, 5, TERRAIN_WALL);
    history.commit(second);
    expect(history.canRedo).toBe(false);
  });
});

describe('직렬화', () => {
  it('JSON 왕복 후에도 지형 타입·오브젝트 ID·브러쉬 id가 같다', () => {
    const doc = createDoc(15, 11, { name: 'level-07' });
    const stroke: Stroke = { label: 'brush', changes: [] };
    forEachLineCell(2, 2, 12, 8, (x, y) => write(doc, stroke, 'terrainType', x, y, TERRAIN_WALL));
    write(doc, stroke, 'terrainObject', 4, 4, 1234);
    write(doc, stroke, 'terrainBrush', 4, 4, 2);
    write(doc, stroke, 'entityObject', 1, 1, 3);
    write(doc, stroke, 'entityBrush', 1, 1, 3);
    write(doc, stroke, 'entityObject', 13, 9, 4);
    write(doc, stroke, 'entityBrush', 13, 9, 4);

    const restored = parseJson(toJson(doc));

    expect(restored.name).toBe('level-07');
    expect(restored.width).toBe(15);
    expect(restored.height).toBe(11);
    expect(restored.terrainType).toEqual(doc.terrainType);
    expect(getLayer(restored, 'terrain').object).toEqual(getLayer(doc, 'terrain').object);
    expect(getLayer(restored, 'terrain').brush).toEqual(getLayer(doc, 'terrain').brush);
    expect(getLayer(restored, 'entity').object).toEqual(getLayer(doc, 'entity').object);
    expect(getLayer(restored, 'entity').brush).toEqual(getLayer(doc, 'entity').brush);
  });

  it('맵 파일에는 각 칸을 칠한 브러쉬 id도 함께 저장된다', () => {
    const file = JSON.parse(toJson(createDoc(7, 7)));
    expect(Object.keys(file.terrain).sort()).toEqual(['brush', 'object', 'type']);
    expect(Object.keys(file.entity).sort()).toEqual(['brush', 'object']);
  });

  it('브러쉬 정보는 맵 파일에 들어가지 않는다', () => {
    const file = JSON.parse(toJson(createDoc(7, 7)));
    expect(file.tileset).toBeUndefined();
    expect(file.brushes).toBeUndefined();
    expect(Object.keys(file).sort()).toEqual(
      ['entity', 'format', 'height', 'name', 'terrain', 'version', 'width'].sort(),
    );
  });

  it('행 길이가 width와 다르면 거부한다', () => {
    const file = JSON.parse(toJson(createDoc(7, 7)));
    file.terrain.type[2] = [1, 1, 1];
    expect(mapFileSchema.safeParse(file).success).toBe(false);
  });

  it('지형 타입에 3 이상이 있으면 거부한다', () => {
    const file = JSON.parse(toJson(createDoc(7, 7)));
    file.terrain.type[1][1] = 5;
    expect(mapFileSchema.safeParse(file).success).toBe(false);
  });

  it('entity 격자가 없으면 거부한다', () => {
    const file = JSON.parse(toJson(createDoc(7, 7)));
    delete file.entity;
    expect(mapFileSchema.safeParse(file).success).toBe(false);
  });

  it('format이 다른 파일은 거부한다', () => {
    expect(() => parseJson('{"format":"tiled","version":2}')).toThrow();
  });

  it('옛 버전 파일은 이유를 알려 주며 거부한다', () => {
    expect(() => parseJson('{"format":"maze-editor","version":1}')).toThrow(/버전 1/);
    expect(() => parseJson('{"format":"maze-editor","version":2}')).toThrow(/버전 2/);
  });

  it('음수 오브젝트 ID도 격자와 파일 왕복에서 그대로 유지된다', () => {
    const doc = createDoc(7, 7);
    const stroke: Stroke = { label: 'brush', changes: [] };
    write(doc, stroke, 'terrainObject', 1, 1, -5);
    write(doc, stroke, 'entityObject', 3, 3, OBJECT_ID_MIN);
    write(doc, stroke, 'entityObject', 5, 5, OBJECT_ID_MAX);

    // 격자 자체가 음수를 담아야 한다. 부호 없는 배열이면 큰 양수로 바뀐다.
    expect(getLayer(doc, 'terrain').object[cellIndex(1, 1, 7)]).toBe(-5);

    const text = toJson(doc);
    const restored = parseJson(text);
    expect(getLayer(restored, 'terrain').object[cellIndex(1, 1, 7)]).toBe(-5);
    expect(getLayer(restored, 'entity').object[cellIndex(3, 3, 7)]).toBe(OBJECT_ID_MIN);
    expect(getLayer(restored, 'entity').object[cellIndex(5, 5, 7)]).toBe(OBJECT_ID_MAX);
    // 음수가 든 행도 한 줄로 접힌다.
    expect(text).toContain('[0, -5, 0, 0, 0, 0, 0]');
  });

  it('오브젝트 ID가 저장 범위를 넘거나 브러쉬 id가 음수면 거부한다', () => {
    const tooBig = JSON.parse(toJson(createDoc(7, 7)));
    tooBig.entity.object[1][1] = OBJECT_ID_MAX + 1;
    expect(mapFileSchema.safeParse(tooBig).success).toBe(false);

    const negativeBrush = JSON.parse(toJson(createDoc(7, 7)));
    negativeBrush.terrain.brush[1][1] = -1;
    expect(mapFileSchema.safeParse(negativeBrush).success).toBe(false);
  });

  it('크기를 바꿔도 음수 오브젝트 ID가 유지된다', () => {
    const doc = createDoc(7, 7);
    getLayer(doc, 'entity').object[cellIndex(3, 3, 7)] = -42;
    const bigger = resizeDoc(doc, 11, 11);
    expect(getLayer(bigger, 'entity').object[cellIndex(5, 5, 11)]).toBe(-42);
  });
});

describe('맵 크기 (4n+3 강제)', () => {
  it('규칙에 맞지 않는 값은 위쪽으로 올린다', () => {
    expect(normalizeMapSize(3)).toBe(3);
    expect(normalizeMapSize(4)).toBe(7);
    expect(normalizeMapSize(7)).toBe(7);
    expect(normalizeMapSize(8)).toBe(11);
    expect(normalizeMapSize(32)).toBe(35);
    expect(normalizeMapSize(33)).toBe(35);
    expect(normalizeMapSize(35)).toBe(35);
  });

  it('허용 범위 밖이면 4n+3인 경계로 잘라낸다', () => {
    expect(MIN_MAP_SIZE % 4).toBe(3);
    expect(MAX_MAP_SIZE % 4).toBe(3);
    expect(normalizeMapSize(0)).toBe(MIN_MAP_SIZE);
    expect(normalizeMapSize(-10)).toBe(MIN_MAP_SIZE);
    expect(normalizeMapSize(9999)).toBe(MAX_MAP_SIZE);
    expect(normalizeMapSize(Number.NaN)).toBe(MIN_MAP_SIZE);
  });

  it('normalizeMapSize의 결과는 항상 isValidMapSize를 만족한다', () => {
    for (let n = -5; n <= 60; n++) expect(isValidMapSize(normalizeMapSize(n))).toBe(true);
  });

  it('홀수라도 4n+1이면 유효하지 않다', () => {
    expect(isValidMapSize(9)).toBe(false);
    expect(isValidMapSize(33)).toBe(false);
    expect(isValidMapSize(11)).toBe(true);
    expect(isValidMapSize(10)).toBe(false);
    expect(isValidMapSize(7.5)).toBe(false);
    expect(isValidMapSize(MAX_MAP_SIZE + 4)).toBe(false);
  });

  it('createDoc에 아무 값이나 넘겨도 규칙에 맞는 맵이 나온다', () => {
    const doc = createDoc(10, 8);
    expect(doc.width).toBe(11);
    expect(doc.height).toBe(11);
    expect(doc.terrainType.length).toBe(11 * 11);
  });
});

describe('cellKind (floor / wall / pillar 분류)', () => {
  it('중앙 칸은 언제나 floor다', () => {
    const doc = createDoc(15, 11);
    const c = centerCell(doc);
    expect(c).toEqual({ x: 7, y: 5 });
    expect(cellKind(doc, c.x, c.y)).toBe('floor');
  });

  it('중앙에서 가로·세로 모두 짝수 칸 차이면 floor다', () => {
    const doc = createDoc(11, 11); // 중앙 (5,5)
    expect(cellKind(doc, 5, 5)).toBe('floor');
    expect(cellKind(doc, 3, 5)).toBe('floor');
    expect(cellKind(doc, 5, 1)).toBe('floor');
  });

  it('한 축만 홀수 칸 차이면 wall이다', () => {
    const doc = createDoc(11, 11);
    expect(cellKind(doc, 4, 5)).toBe('wall');
    expect(cellKind(doc, 5, 4)).toBe('wall');
    expect(cellKind(doc, 6, 5)).toBe('wall');
  });

  it('두 축 다 홀수 칸 차이면 pillar다 (wall 칸들의 교차점)', () => {
    const doc = createDoc(11, 11);
    expect(cellKind(doc, 4, 4)).toBe('pillar');
    expect(cellKind(doc, 6, 4)).toBe('pillar');
    expect(cellKind(doc, 4, 6)).toBe('pillar');
  });

  it('바깥 테두리는 어떤 유효 크기에서도 floor 칸이 아니다', () => {
    // 겹치면 "테두리는 벽이어야 하는데 벽을 놓을 수 없는 칸"이 생긴다. 4n+3 규칙이 있는 이유.
    for (let size = MIN_MAP_SIZE; size <= 43; size += 4) {
      const doc = createDoc(size, size);
      for (let i = 0; i < size; i++) {
        expect(isProtectedCell(doc, i, 0)).toBe(false);
        expect(isProtectedCell(doc, i, size - 1)).toBe(false);
        expect(isProtectedCell(doc, 0, i)).toBe(false);
        expect(isProtectedCell(doc, size - 1, i)).toBe(false);
      }
    }
  });

  it('isProtectedCell은 floor 칸인지와 같은 뜻이다', () => {
    const doc = createDoc(15, 11);
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        expect(isProtectedCell(doc, x, y)).toBe(cellKind(doc, x, y) === 'floor');
      }
    }
  });

  it('크기를 바꿔도 옮겨진 내용과 격자의 정렬이 유지된다', () => {
    // floor 칸 위에만 표식을 찍어 두고, 리사이즈 후에도 표식이 전부 floor 위에 있는지 본다.
    const doc = createDoc(11, 11);
    const src = getLayer(doc, 'entity').object;
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        if (isProtectedCell(doc, x, y)) src[cellIndex(x, y, doc.width)] = 9;
      }
    }

    const anchors: Anchor[] = [
      { x: 'left', y: 'top' },
      { x: 'center', y: 'middle' },
      { x: 'right', y: 'bottom' },
    ];

    for (const anchor of anchors) {
      for (const [w, h] of [[19, 15], [7, 7]] as const) {
        const next = resizeDoc(doc, w, h, { anchor });
        const moved = getLayer(next, 'entity').object;
        let marks = 0;
        for (let y = 0; y < next.height; y++) {
          for (let x = 0; x < next.width; x++) {
            if (moved[cellIndex(x, y, next.width)] !== 9) continue;
            marks++;
            expect(isProtectedCell(next, x, y)).toBe(true);
          }
        }
        expect(marks).toBeGreaterThan(0);
      }
    }
  });
});

describe('브러쉬 설정', () => {
  it('newBrushId는 기존 브러쉬들과 겹치지 않는 다음 정수를 돌려준다', () => {
    expect(newBrushId([])).toBe(1);
    expect(newBrushId([makeBrush({ id: 3 }), makeBrush({ id: 7 })])).toBe(8);
    expect(newBrushId(defaultBrushes())).toBe(7);
  });

  it('entity 레이어는 크기가 1로 고정되고 지형 타입을 쓰지 않는다', () => {
    const { id: _id, ...draft } = makeBrush({ layer: 'entity', size: 5, terrainType: TERRAIN_WALL });
    const normalized = normalizeDraft(draft);
    expect(normalized.size).toBe(1);
    expect(normalized.terrainType).toBe(TERRAIN_NONE);
  });

  it('엔티티 타입은 entity 브러쉬에서만 값을 유지하고, terrain 브러쉬는 항상 null로 정리된다', () => {
    const { id: _id, ...entityDraft } = makeBrush({ layer: 'entity', entityType: 'monster' });
    expect(normalizeDraft(entityDraft).entityType).toBe('monster');

    const { id: _id2, ...terrainDraft } = makeBrush({ layer: 'terrain', entityType: 'seed' });
    expect(normalizeDraft(terrainDraft).entityType).toBeNull();
  });

  it('세 칸 종류를 모두 놓을 수 있을 때만 채우기를 켤 수 있다', () => {
    expect(canBeFillable(['floor', 'wall', 'pillar'], false, false)).toBe(true);
    expect(canBeFillable(['wall', 'pillar'], false, false)).toBe(false);

    const { id: _id, ...draft } = makeBrush({ allowedCellKinds: ['wall', 'pillar'], fillable: true });
    expect(normalizeDraft(draft).fillable).toBe(false);
  });

  it('unique나 blob이면 세 칸 종류를 다 놓을 수 있어도 채우기를 켤 수 없다', () => {
    expect(canBeFillable(['floor', 'wall', 'pillar'], true, false)).toBe(false);
    expect(canBeFillable(['floor', 'wall', 'pillar'], false, true)).toBe(false);

    const { id: _id, ...blobDraft } = makeBrush({ blob: true, fillable: true });
    expect(normalizeDraft(blobDraft).fillable).toBe(false);

    const { id: _id2, ...uniqueDraft } = makeBrush({ unique: true, fillable: true });
    expect(normalizeDraft(uniqueDraft).fillable).toBe(false);
  });

  it('놓을 수 있는 칸 종류가 하나도 없으면 floor를 남긴다', () => {
    const { id: _id, ...draft } = makeBrush({ allowedCellKinds: [] });
    expect(normalizeDraft(draft).allowedCellKinds).toEqual(['floor']);
  });

  it('오브젝트 ID는 정수로 맞추되 음수는 그대로 둔다', () => {
    const { id: _id, ...draft } = makeBrush({ objectIds: { floor: -3, wall: 2.7, pillar: Number.NaN } });
    expect(normalizeDraft(draft).objectIds).toEqual({ floor: -3, wall: 2, pillar: 0 });
  });

  it('오브젝트 ID의 소수점은 0 쪽으로 버리고 저장 범위 밖은 자른다', () => {
    const { id: _id, ...draft } = makeBrush({ objectIds: { floor: -2.7, wall: -3e10, pillar: 3e10 } });
    expect(normalizeDraft(draft).objectIds).toEqual({ floor: -2, wall: OBJECT_ID_MIN, pillar: OBJECT_ID_MAX });
  });

  it('색을 지정하지 않으면 이름에서 자동으로 정해진다', () => {
    const auto = makeBrush({ name: '나무', color: null });
    expect(brushColor(auto)).toBe(autoColor('나무', auto.layer, auto.terrainType));
    // 같은 이름이면 항상 같은 색, 다른 이름이면 다른 색.
    expect(autoColor('나무', 'terrain', TERRAIN_WALL)).toBe(autoColor('나무', 'terrain', TERRAIN_WALL));
    expect(autoColor('나무', 'terrain', TERRAIN_WALL)).not.toBe(autoColor('바위', 'terrain', TERRAIN_WALL));
  });

  it('색을 지정하면 그 값을 그대로 쓴다', () => {
    expect(brushColor(makeBrush({ color: '#123456' }))).toBe('#123456');
  });

  it('id로 브러쉬를 찾는다. 서로 다른 브러쉬가 같은 오브젝트 ID를 써도 섞이지 않는다', () => {
    const wall = makeBrush({ id: 10, layer: 'terrain', objectIds: sameObjectIdForAll(7) });
    const enemy = makeBrush({ id: 20, layer: 'entity', objectIds: sameObjectIdForAll(7) });
    const index = buildBrushIndex([wall, enemy]);

    expect(findBrushById(index, 10)?.id).toBe(10);
    expect(findBrushById(index, 20)?.id).toBe(20);
    expect(findBrushById(index, 99)).toBeUndefined();
    expect(findBrushById(index, 0)).toBeUndefined();
  });

  it('기본 세트의 벽 브러쉬는 floor 칸에 놓을 수 없다', () => {
    const wall = defaultBrushes().find((b) => b.name === '벽')!;
    expect(wall.allowedCellKinds).not.toContain('floor');
    expect(wall.terrainType).toBe(TERRAIN_WALL);
  });

  it('기본 세트의 바닥 브러쉬는 채우기가 가능하다', () => {
    const floor = defaultBrushes().find((b) => b.name === '바닥')!;
    expect(floor.fillable).toBe(true);
    expect(floor.terrainType).toBe(TERRAIN_EMPTY);
  });
});

describe('reorderBrushes (팔레트 순서 변경)', () => {
  const names = (bs: Brush[]) => bs.map((b) => b.name);

  function set(): Brush[] {
    return [
      makeBrush({ id: 1, name: 'A', group: '지형' }),
      makeBrush({ id: 2, name: 'B', group: '지형' }),
      makeBrush({ id: 3, name: 'C', group: '지형' }),
      makeBrush({ id: 4, name: 'X', group: '엔티티' }),
      makeBrush({ id: 5, name: 'Y', group: '엔티티' }),
    ];
  }

  it('같은 그룹 안에서 다른 브러쉬 앞으로 옮긴다', () => {
    const out = reorderBrushes(set(), 3, '지형', 1); // C를 A 앞으로
    expect(names(out)).toEqual(['C', 'A', 'B', 'X', 'Y']);
    expect(out.every((b) => (b.name === 'C' ? b.group === '지형' : true))).toBe(true);
  });

  it('beforeId가 null이면 그 그룹의 끝으로 옮긴다', () => {
    const out = reorderBrushes(set(), 1, '지형', null); // A를 지형 그룹 끝으로
    expect(names(out)).toEqual(['B', 'C', 'A', 'X', 'Y']);
  });

  it('다른 그룹으로 옮기면 group도 그 그룹으로 바뀐다', () => {
    const out = reorderBrushes(set(), 2, '엔티티', 5); // B를 Y 앞(엔티티)으로
    expect(names(out)).toEqual(['A', 'C', 'X', 'B', 'Y']);
    expect(out.find((b) => b.name === 'B')!.group).toBe('엔티티');
  });

  it('다른 그룹 끝으로 옮긴다 (beforeId null)', () => {
    const out = reorderBrushes(set(), 1, '엔티티', null);
    expect(names(out)).toEqual(['B', 'C', 'X', 'Y', 'A']);
    expect(out.find((b) => b.name === 'A')!.group).toBe('엔티티');
  });

  it('제자리에 놓으면 원본 배열을 그대로 돌려준다', () => {
    const input = set();
    expect(reorderBrushes(input, 2, '지형', 3)).toBe(input); // B를 C(바로 뒤 항목) 앞 = 제자리
    expect(reorderBrushes(input, 2, '지형', 2)).toBe(input); // 자기 앞
  });

  it('없는 브러쉬 id면 원본을 그대로 돌려준다', () => {
    const input = set();
    expect(reorderBrushes(input, 999, '지형', 1)).toBe(input);
  });

  it('새 그룹으로 옮기면 배열 맨 끝에 붙는다', () => {
    const out = reorderBrushes(set(), 3, '장식', null);
    expect(names(out)).toEqual(['A', 'B', 'X', 'Y', 'C']);
    expect(out.find((b) => b.name === 'C')!.group).toBe('장식');
  });
});

describe('덩어리 브러쉬 배치', () => {
  const blob3 = makeBrush({ id: 101, blob: true, size: 3, objectIds: sameObjectIdForAll(10) });

  /** 덩어리를 실제로 놓았을 때처럼 가운데 칸에 오브젝트 ID와 브러쉬 id를 함께 남긴다. */
  function placeBlobCenter(doc: MapDoc, brush: Brush, x: number, y: number): void {
    const i = cellIndex(x, y, doc.width);
    getLayer(doc, brush.layer).object[i] = objectIdFor(brush, cellKind(doc, x, y));
    getLayer(doc, brush.layer).brush[i] = brush.id;
  }

  it('맵 밖으로 나가면 통째로 거부된다', () => {
    const doc = createDoc(11, 11);
    expect(checkBlobPlacement(doc, [blob3], blob3, 0, 5)).toBe('out-of-bounds');
    expect(checkBlobPlacement(doc, [blob3], blob3, 5, 5)).toBeNull();
  });

  it('칸 종류 제한은 클릭한 가운데 칸만 본다 — 몸통이 다른 종류를 걸쳐도 된다', () => {
    const doc = createDoc(11, 11); // 중앙 (5,5)는 floor, (4,5)는 wall 칸이다.
    const noFloor = makeBrush({ ...blob3, allowedCellKinds: ['wall', 'pillar'] });

    // 가운데가 floor면 floor를 허용하지 않는 브러쉬로는 놓을 수 없다.
    expect(checkBlobPlacement(doc, [noFloor], noFloor, 5, 5)).toBe('cell-kind');
    // 가운데를 wall 칸으로 옮기면, 3x3 몸통이 floor·pillar 칸도 걸치지만 놓을 수 있다.
    expect(checkBlobPlacement(doc, [noFloor], noFloor, 4, 5)).toBeNull();
  });

  it('이미 놓인 덩어리와 맞닿으면 거부되고, 한 칸 떨어지면 놓을 수 있다', () => {
    const doc = createDoc(15, 15);
    // 중심 (5,5)에 3x3 덩어리가 하나 놓여 있다 (가운데 칸에만 ID가 남는다).
    placeBlobCenter(doc, blob3, 5, 5);

    // 중심이 3 떨어지면 몸통끼리 맞닿는다.
    expect(checkBlobPlacement(doc, [blob3], blob3, 8, 5)).toBe('blob-overlap');
    // 4 떨어지면 사이에 한 칸이 남는다.
    expect(checkBlobPlacement(doc, [blob3], blob3, 9, 5)).toBeNull();
    // 같은 자리에도 겹쳐 놓을 수 없다.
    expect(checkBlobPlacement(doc, [blob3], blob3, 5, 5)).toBe('blob-overlap');
  });

  it('덩어리가 아닌 브러쉬가 찍어 둔 칸과는 겹칠 수 있다', () => {
    const doc = createDoc(15, 15);
    const plain = makeBrush({ id: 102, objectIds: sameObjectIdForAll(20) });
    placeBlobCenter(doc, plain, 6, 5);

    expect(checkBlobPlacement(doc, [blob3, plain], blob3, 5, 5)).toBeNull();
  });

  it('오브젝트 ID가 전부 0인 덩어리끼리도 브러쉬 id로 정확히 충돌을 감지한다', () => {
    // 게임에 남길 데이터가 없는 순수 장식용 덩어리 (오브젝트 ID 없음).
    const doc = createDoc(15, 15);
    const decorBlob = makeBrush({ id: 103, blob: true, size: 3, objectIds: zeroObjectIds() });
    placeBlobCenter(doc, decorBlob, 5, 5);

    expect(checkBlobPlacement(doc, [decorBlob], decorBlob, 8, 5)).toBe('blob-overlap');
  });

  it('크기가 1인 덩어리는 바로 옆 칸에 놓을 수 없다', () => {
    const doc = createDoc(15, 15);
    const blob1 = makeBrush({ id: 104, blob: true, size: 1, objectIds: sameObjectIdForAll(30) });
    placeBlobCenter(doc, blob1, 5, 5);

    expect(checkBlobPlacement(doc, [blob1], blob1, 6, 5)).toBe('blob-overlap');
    expect(checkBlobPlacement(doc, [blob1], blob1, 7, 5)).toBeNull();
  });
});

describe('floodFillRegion (채우기)', () => {
  it('맵 전체가 None이면 전체가 한 영역이다', () => {
    const doc = createDoc(11, 11);
    const region = floodFillRegion(doc, 'terrain', 5, 5);
    expect(region).toHaveLength(11 * 11);
  });

  it('지형 타입이 다른 칸에는 번지지 않는다', () => {
    const doc = createDoc(11, 11);
    // 세로줄 하나를 벽으로 세워 왼쪽/오른쪽을 나눈다.
    for (let y = 0; y < doc.height; y++) doc.terrainType[cellIndex(5, y, doc.width)] = TERRAIN_WALL;

    const left = floodFillRegion(doc, 'terrain', 2, 5);
    expect(left.some(({ x }) => x >= 5)).toBe(false);
    expect(left.length).toBeGreaterThan(0);
  });

  it('지형 타입이 같아도 오브젝트 ID가 다르면 번지지 않는다', () => {
    const doc = createDoc(11, 11);
    const terrain = getLayer(doc, 'terrain').object;
    // 둘 다 Empty지만 텍스처(오브젝트 ID)가 다른 두 칸.
    terrain[cellIndex(2, 2, doc.width)] = 1;
    terrain[cellIndex(3, 2, doc.width)] = 2;

    const region = floodFillRegion(doc, 'terrain', 2, 2);
    expect(region).toEqual([{ x: 2, y: 2 }]);
  });

  it('대각선으로만 붙어 있으면 이어진 것으로 보지 않는다 (4방향)', () => {
    const doc = createDoc(11, 11);
    const terrain = getLayer(doc, 'terrain').object;
    terrain[cellIndex(2, 2, doc.width)] = 5;
    terrain[cellIndex(3, 3, doc.width)] = 5; // 대각선 이웃, 상하좌우로는 안 이어짐
    doc.terrainType[cellIndex(2, 2, doc.width)] = TERRAIN_WALL;
    doc.terrainType[cellIndex(3, 3, doc.width)] = TERRAIN_WALL;

    const region = floodFillRegion(doc, 'terrain', 2, 2);
    expect(region).toEqual([{ x: 2, y: 2 }]);
  });

  it('entity 레이어는 오브젝트 ID만 비교한다 (지형 타입이 없으므로)', () => {
    const doc = createDoc(11, 11);
    const entity = getLayer(doc, 'entity').object;
    entity[cellIndex(1, 1, doc.width)] = 7;
    entity[cellIndex(2, 1, doc.width)] = 7;
    entity[cellIndex(3, 1, doc.width)] = 0;

    const region = floodFillRegion(doc, 'entity', 1, 1);
    expect(region.sort((a, b) => a.x - b.x)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it('맵 밖에서 시작하면 빈 배열을 돌려준다', () => {
    const doc = createDoc(11, 11);
    expect(floodFillRegion(doc, 'terrain', -1, 0)).toEqual([]);
  });
});

describe('resizeDoc', () => {
  it('가운데 기준으로 넓히면 기존 내용이 정확히 중앙에 놓인다', () => {
    const doc = createDoc(7, 7);
    doc.terrainType[cellIndex(3, 3, 7)] = TERRAIN_WALL;
    getLayer(doc, 'entity').object[cellIndex(1, 1, 7)] = 3;

    const big = resizeDoc(doc, 11, 11);

    expect(big.width).toBe(11);
    expect(big.terrainType[cellIndex(5, 5, 11)]).toBe(TERRAIN_WALL);
    expect(getLayer(big, 'entity').object[cellIndex(3, 3, 11)]).toBe(3);
  });

  it('원본 문서를 건드리지 않는다', () => {
    // 히스토리가 스냅샷 복사 없이 이전 문서 참조만 들고 있을 수 있는 근거.
    const doc = createDoc(7, 7);
    doc.terrainType[cellIndex(3, 3, 7)] = TERRAIN_WALL;
    const snapshot = Uint8Array.from(doc.terrainType);

    resizeDoc(doc, 11, 11);

    expect(doc.width).toBe(7);
    expect(doc.terrainType).toEqual(snapshot);
  });

  it('왼쪽 위 기준으로 줄이면 바깥쪽이 잘린다', () => {
    const doc = createDoc(11, 11);
    doc.terrainType[cellIndex(1, 1, 11)] = TERRAIN_WALL;
    doc.terrainType[cellIndex(9, 9, 11)] = TERRAIN_WALL;

    const small = resizeDoc(doc, 7, 7, { anchor: { x: 'left', y: 'top' } });

    expect(small.terrainType[cellIndex(1, 1, 7)]).toBe(TERRAIN_WALL);
    expect(Array.from(small.terrainType).filter((v) => v === TERRAIN_WALL)).toHaveLength(1);
  });

  it('규칙에 안 맞는 값을 넘겨도 4n+3 크기로 조정된다', () => {
    const r = resizeDoc(createDoc(7, 7), 8, 12);
    expect(r.width).toBe(11);
    expect(r.height).toBe(15);
  });
});

describe('History - 문서 교체 편집', () => {
  it('크기 조정을 되돌리면 이전 문서를 돌려준다', () => {
    const before = createDoc(7, 7);
    const after = resizeDoc(before, 11, 11);
    const history = new History();

    history.commitDoc('resize', before, after);

    expect(history.canUndo).toBe(true);
    expect(history.undo(after)).toBe(before);
    expect(history.redo(before)).toBe(after);
  });

  it('붓질과 크기 조정이 섞여도 역순으로 되돌아간다', () => {
    const docA = createDoc(7, 7);
    const history = new History();

    const stroke: Stroke = { label: 'brush', changes: [] };
    write(docA, stroke, 'terrainType', 2, 2, TERRAIN_WALL);
    history.commit(stroke);

    const docB = resizeDoc(docA, 11, 11);
    history.commitDoc('resize', docA, docB);

    const afterResizeUndo = history.undo(docB);
    expect(afterResizeUndo).toBe(docA);
    expect(afterResizeUndo?.width).toBe(7);

    history.undo(docA);
    expect(docA.terrainType[cellIndex(2, 2, 7)]).toBe(TERRAIN_NONE);
  });
});

describe('sameGrid', () => {
  it('같은 크기·같은 내용이면 true', () => {
    expect(sameGrid(createDoc(11, 11), createDoc(11, 11))).toBe(true);
  });

  it('지형 타입이 한 칸이라도 다르면 false', () => {
    const a = createDoc(11, 11);
    const b = createDoc(11, 11);
    b.terrainType[cellIndex(4, 4, 11)] = TERRAIN_WALL;
    expect(sameGrid(a, b)).toBe(false);
  });

  it('오브젝트 ID가 한 칸이라도 다르면 false', () => {
    const a = createDoc(11, 11);
    const b = createDoc(11, 11);
    getLayer(b, 'entity').object[cellIndex(4, 4, 11)] = 1;
    expect(sameGrid(a, b)).toBe(false);
  });

  it('크기가 다르면 false', () => {
    expect(sameGrid(createDoc(11, 11), createDoc(15, 11))).toBe(false);
  });

  it('같은 크기로 리사이즈하면 결과가 원본과 같다', () => {
    const doc = createDoc(11, 11);
    expect(sameGrid(doc, resizeDoc(doc, 11, 11))).toBe(true);
  });
});

describe('computeBrushResync (브러쉬 설정 변경을 이미 칠해진 칸에 반영)', () => {
  /** editorStore.writeBrushCell과 같은 순서로 한 칸을 "칠한다". */
  function paintTerrainCell(doc: MapDoc, stroke: Stroke, brush: Brush, x: number, y: number): void {
    write(doc, stroke, 'terrainType', x, y, brush.terrainType);
    write(doc, stroke, 'terrainObject', x, y, objectIdFor(brush, cellKind(doc, x, y)));
    write(doc, stroke, 'terrainBrush', x, y, brush.id);
  }

  function paintEntityCell(doc: MapDoc, stroke: Stroke, brush: Brush, x: number, y: number): void {
    write(doc, stroke, 'entityObject', x, y, objectIdFor(brush, cellKind(doc, x, y)));
    write(doc, stroke, 'entityBrush', x, y, brush.id);
  }

  it('오브젝트 ID를 바꾸면 이미 칠해진 칸의 object 값이 새 값으로 바뀐다', () => {
    const doc = createDoc(11, 11);
    const stroke: Stroke = { label: 'paint', changes: [] };
    const original = makeBrush({ id: 5, terrainType: TERRAIN_WALL, objectIds: sameObjectIdForAll(1) });
    paintTerrainCell(doc, stroke, original, 5, 6); // wall 칸

    const updated = { ...original, objectIds: sameObjectIdForAll(9) };
    const changes = computeBrushResync(doc, updated);

    const index = cellIndex(5, 6, 11);
    expect(changes).toContainEqual({ grid: 'terrainObject', index, before: 1, after: 9 });
  });

  it('지형 타입을 바꾸면 이미 칠해진 칸의 terrainType도 함께 바뀐다', () => {
    const doc = createDoc(11, 11);
    const stroke: Stroke = { label: 'paint', changes: [] };
    const original = makeBrush({ id: 5, terrainType: TERRAIN_WALL, objectIds: sameObjectIdForAll(1) });
    paintTerrainCell(doc, stroke, original, 5, 6);

    const updated: Brush = { ...original, terrainType: TERRAIN_EMPTY };
    const changes = computeBrushResync(doc, updated);

    const index = cellIndex(5, 6, 11);
    expect(changes).toContainEqual({ grid: 'terrainType', index, before: TERRAIN_WALL, after: TERRAIN_EMPTY });
  });

  it('칸 종류에 따라 다른 오브젝트 ID를 쓰는 브러쉬는 칸마다 알맞은 값으로 다시 계산된다', () => {
    const doc = createDoc(11, 11);
    const stroke: Stroke = { label: 'paint', changes: [] };
    const original = makeBrush({
      id: 5,
      terrainType: TERRAIN_WALL,
      objectIds: { floor: 1, wall: 2, pillar: 3 },
    });
    // (5,5) floor, (5,6) wall, (6,6) pillar — 셋 다 이 브러쉬로 칠한다.
    paintTerrainCell(doc, stroke, original, 5, 5);
    paintTerrainCell(doc, stroke, original, 5, 6);
    paintTerrainCell(doc, stroke, original, 6, 6);

    const updated = { ...original, objectIds: { floor: 10, wall: 20, pillar: 30 } };
    const changes = computeBrushResync(doc, updated);

    expect(changes).toContainEqual({ grid: 'terrainObject', index: cellIndex(5, 5, 11), before: 1, after: 10 });
    expect(changes).toContainEqual({ grid: 'terrainObject', index: cellIndex(5, 6, 11), before: 2, after: 20 });
    expect(changes).toContainEqual({ grid: 'terrainObject', index: cellIndex(6, 6, 11), before: 3, after: 30 });
  });

  it('다른 브러쉬로 칠해진 칸은 건드리지 않는다', () => {
    const doc = createDoc(11, 11);
    const stroke: Stroke = { label: 'paint', changes: [] };
    const a = makeBrush({ id: 5, terrainType: TERRAIN_WALL, objectIds: sameObjectIdForAll(1) });
    const b = makeBrush({ id: 6, terrainType: TERRAIN_WALL, objectIds: sameObjectIdForAll(1) });
    paintTerrainCell(doc, stroke, a, 5, 6);
    paintTerrainCell(doc, stroke, b, 6, 5);

    const updatedA = { ...a, objectIds: sameObjectIdForAll(9) };
    const changes = computeBrushResync(doc, updatedA);

    expect(changes.some((c) => c.index === cellIndex(6, 5, 11))).toBe(false);
  });

  it('entity 브러쉬는 object만 다시 계산되고 terrainType은 건드리지 않는다', () => {
    const doc = createDoc(11, 11);
    const stroke: Stroke = { label: 'paint', changes: [] };
    write(doc, stroke, 'terrainType', 5, 5, TERRAIN_EMPTY);
    const original = makeBrush({ id: 5, layer: 'entity', terrainType: TERRAIN_NONE, objectIds: sameObjectIdForAll(1) });
    paintEntityCell(doc, stroke, original, 5, 5);

    const updated = { ...original, objectIds: sameObjectIdForAll(9) };
    const changes = computeBrushResync(doc, updated);

    expect(changes).toEqual([
      { grid: 'entityObject', index: cellIndex(5, 5, 11), before: 1, after: 9 },
    ]);
  });

  it('브러쉬 레이어를 terrain에서 entity로 바꿔도, 예전에 칠한 terrain 칸의 terrainType은 건드리지 않는다', () => {
    const doc = createDoc(11, 11);
    const stroke: Stroke = { label: 'paint', changes: [] };
    const original = makeBrush({ id: 5, layer: 'terrain', terrainType: TERRAIN_WALL, objectIds: sameObjectIdForAll(1) });
    paintTerrainCell(doc, stroke, original, 5, 6);

    // normalizeDraft라면 entity 레이어 전환 시 terrainType을 None으로 강제하지만,
    // 여기서는 resync 쪽이 그 값을 그대로 따라가지 않는지만 본다.
    const updated: Brush = { ...original, layer: 'entity', terrainType: TERRAIN_NONE, objectIds: sameObjectIdForAll(9) };
    const changes = computeBrushResync(doc, updated);

    const index = cellIndex(5, 6, 11);
    expect(changes).toContainEqual({ grid: 'terrainObject', index, before: 1, after: 9 });
    expect(changes.some((c) => c.grid === 'terrainType')).toBe(false);
  });

  it('덩어리 브러쉬는 가운데 칸만 다시 계산된다', () => {
    const doc = createDoc(11, 11);
    const stroke: Stroke = { label: 'paint', changes: [] };
    const original = makeBrush({ id: 5, terrainType: TERRAIN_WALL, blob: true, objectIds: sameObjectIdForAll(1) });
    // 가운데 칸은 브러쉬 id가 남지만, 몸통 칸은 0으로 남는다 (core/tools/place.ts 참고).
    paintTerrainCell(doc, stroke, original, 5, 5);
    write(doc, stroke, 'terrainType', 5, 6, original.terrainType);
    write(doc, stroke, 'terrainObject', 5, 6, 0);
    write(doc, stroke, 'terrainBrush', 5, 6, 0);

    const updated: Brush = { ...original, terrainType: TERRAIN_EMPTY, objectIds: sameObjectIdForAll(9) };
    const changes = computeBrushResync(doc, updated);

    expect(changes.some((c) => c.index === cellIndex(5, 5, 11))).toBe(true);
    expect(changes.some((c) => c.index === cellIndex(5, 6, 11))).toBe(false);
  });

  it('바뀐 값이 실제로 없으면 빈 배열을 돌려준다', () => {
    const doc = createDoc(11, 11);
    const stroke: Stroke = { label: 'paint', changes: [] };
    const brush = makeBrush({ id: 5, terrainType: TERRAIN_WALL, objectIds: sameObjectIdForAll(1) });
    paintTerrainCell(doc, stroke, brush, 5, 6);

    expect(computeBrushResync(doc, brush)).toEqual([]);
  });
});

describe('generateMazePreview (미로 생성 미리보기)', () => {
  function placeEntityBrush(doc: MapDoc, brush: Brush, x: number, y: number): void {
    const i = cellIndex(x, y, doc.width);
    getLayer(doc, 'entity').object[i] = objectIdFor(brush, cellKind(doc, x, y));
    getLayer(doc, 'entity').brush[i] = brush.id;
  }

  /** 4방향으로 이어진 Empty 칸만 타고 to까지 갈 수 있는지 본다. */
  function reachableViaEmpty(terrainType: Uint8Array, width: number, height: number, from: number, to: number): boolean {
    if (terrainType[from] !== TERRAIN_EMPTY || terrainType[to] !== TERRAIN_EMPTY) return false;
    const seen = new Uint8Array(width * height);
    const stack = [from];
    seen[from] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (i === to) return true;
      const x = i % width;
      const y = (i - x) / width;
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ];
      for (const n of neighbors) {
        if (n < 0 || seen[n] || terrainType[n] !== TERRAIN_EMPTY) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    return false;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Seed가 없으면 뼈대만 결정된다 (floor는 Empty, 나머지는 Wall)', () => {
    const doc = createDoc(11, 11);
    const result = generateMazePreview(doc, []);

    expect(result.seedCount).toBe(0);
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const expected = isProtectedCell(doc, x, y) ? TERRAIN_EMPTY : TERRAIN_WALL;
        expect(result.terrainType[cellIndex(x, y, doc.width)]).toBe(expected);
      }
    }
  });

  it('entityType이 monster인 브러쉬는 시드로 세지 않는다', () => {
    const doc = createDoc(11, 11);
    const monster = makeBrush({ id: 1, layer: 'entity', entityType: 'monster' });
    placeEntityBrush(doc, monster, 5, 5);

    expect(generateMazePreview(doc, [monster]).seedCount).toBe(0);
  });

  it('시드 칸은 원래 지형과 무관하게 항상 Empty가 된다', () => {
    const doc = createDoc(11, 11);
    // 시드가 지형 값보다 우선한다는 것을 보이기 위해 일부러 Wall 위에 놓는다.
    doc.terrainType[cellIndex(3, 5, 11)] = TERRAIN_WALL;
    const seed = makeBrush({ id: 1, layer: 'entity', entityType: 'seed' });
    placeEntityBrush(doc, seed, 3, 5);

    const result = generateMazePreview(doc, [seed]);
    expect(result.seedCount).toBe(1);
    expect(result.terrainType[cellIndex(3, 5, 11)]).toBe(TERRAIN_EMPTY);
  });

  it('결과에는 None이 남지 않는다', () => {
    const doc = createDoc(15, 15);
    const seed = makeBrush({ id: 1, layer: 'entity', entityType: 'seed' });
    placeEntityBrush(doc, seed, 7, 7);

    const result = generateMazePreview(doc, [seed]);
    expect(Array.from(result.terrainType)).not.toContain(TERRAIN_NONE);
  });

  it('미리 놓인 벽은 절대 뚫리지 않는다', () => {
    const doc = createDoc(15, 15);
    const seed = makeBrush({ id: 1, layer: 'entity', entityType: 'seed' });
    placeEntityBrush(doc, seed, 7, 7);
    // 시드 바로 옆 wall 칸에 미리 벽을 세워 둔다.
    doc.terrainType[cellIndex(8, 7, 15)] = TERRAIN_WALL;

    const result = generateMazePreview(doc, [seed]);
    expect(result.terrainType[cellIndex(8, 7, 15)]).toBe(TERRAIN_WALL);
  });

  it('원본 문서를 건드리지 않는다', () => {
    const doc = createDoc(11, 11);
    const seed = makeBrush({ id: 1, layer: 'entity', entityType: 'seed' });
    placeEntityBrush(doc, seed, 5, 5);
    const snapshot = Uint8Array.from(doc.terrainType);

    generateMazePreview(doc, [seed]);

    expect(doc.terrainType).toEqual(snapshot);
  });

  it('서로 다른 시드의 길이 마주쳤을 때 확률에 따라 연결하거나 연결하지 않는다', () => {
    // (3,5)와 (5,5)는 중앙(5,5) 기준 floor 칸이면서 2칸 거리라 곧바로 이웃한다.
    const doc = createDoc(11, 11);
    const seedA = makeBrush({ id: 1, layer: 'entity', entityType: 'seed' });
    const seedB = makeBrush({ id: 2, layer: 'entity', entityType: 'seed' });
    placeEntityBrush(doc, seedA, 3, 5);
    placeEntityBrush(doc, seedB, 5, 5);
    const from = cellIndex(3, 5, 11);
    const to = cellIndex(5, 5, 11);

    // Math.random을 0으로 고정하면 연결 확률 검사(0 < 0.1)가 항상 참이 된다.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const linked = generateMazePreview(doc, [seedA, seedB]);
    expect(reachableViaEmpty(linked.terrainType, 11, 11, from, to)).toBe(true);
    vi.restoreAllMocks();

    // 0.5는 0.1보다 작지 않으므로 연결 확률 검사가 항상 거짓이 된다.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const separate = generateMazePreview(doc, [seedA, seedB]);
    expect(reachableViaEmpty(separate.terrainType, 11, 11, from, to)).toBe(false);
  });
});

describe('layout3d (칸 종류별 3D 크기)', () => {
  it('칸 종류에 따라 가로·세로 길이가 정해진다', () => {
    const doc = createDoc(11, 11);
    const center = centerCell(doc);
    const spanOf = (x: number, y: number) => [cellSpan(doc, 'x', x), cellSpan(doc, 'y', y)];

    // floor 16.5 × 16.5, wall 16.5 × 3 또는 3 × 16.5, pillar 3 × 3
    expect(cellKind(doc, center.x, center.y)).toBe('floor');
    expect(spanOf(center.x, center.y)).toEqual([FLOOR_SPAN, FLOOR_SPAN]);

    expect(cellKind(doc, center.x, center.y + 1)).toBe('wall');
    expect(spanOf(center.x, center.y + 1)).toEqual([FLOOR_SPAN, WALL_SPAN]);

    expect(cellKind(doc, center.x + 1, center.y)).toBe('wall');
    expect(spanOf(center.x + 1, center.y)).toEqual([WALL_SPAN, FLOOR_SPAN]);

    expect(cellKind(doc, center.x + 1, center.y + 1)).toBe('pillar');
    expect(spanOf(center.x + 1, center.y + 1)).toEqual([WALL_SPAN, WALL_SPAN]);
  });

  it('맵 전체 길이는 floor 열·행 수와 나머지 열·행 수의 합이다', () => {
    const doc = createDoc(7, 11);
    const layout = mapLayout3D(doc);

    // 7칸(중앙 3)이면 floor 열은 1,3,5 세 개, 나머지 네 개다.
    expect(layout.totalX).toBeCloseTo(3 * FLOOR_SPAN + 4 * WALL_SPAN);
    // 11칸(중앙 5)이면 floor 행은 1,3,5,7,9 다섯 개, 나머지 여섯 개다.
    expect(layout.totalZ).toBeCloseTo(5 * FLOOR_SPAN + 6 * WALL_SPAN);
  });

  it('맵 중앙이 원점에 오고 칸 경계가 빈틈없이 이어진다', () => {
    const doc = createDoc(11, 7);
    const layout = mapLayout3D(doc);

    expect(layout.xEdges[0]).toBeCloseTo(-layout.totalX / 2);
    expect(layout.xEdges[doc.width]).toBeCloseTo(layout.totalX / 2);
    expect(layout.zEdges[0]).toBeCloseTo(-layout.totalZ / 2);
    expect(layout.zEdges[doc.height]).toBeCloseTo(layout.totalZ / 2);

    for (let x = 0; x < doc.width; x++) {
      expect(layout.xEdges[x + 1] - layout.xEdges[x]).toBeCloseTo(cellSpan(doc, 'x', x));
    }

    // 가운데 floor 칸은 원점을 중심으로 놓인다.
    const center = centerCell(doc);
    const box = cellBox3D(layout, center.x, center.y);
    expect(box.cx).toBeCloseTo(0);
    expect(box.cz).toBeCloseTo(0);
    expect(box.sx).toBeCloseTo(FLOOR_SPAN);
    expect(box.sz).toBeCloseTo(FLOOR_SPAN);
  });

  it('벽 상자는 Wall 칸에만, 칸 크기 그대로 만들어진다', () => {
    const doc = createDoc(11, 11);
    const layout = mapLayout3D(doc);
    const terrainType = new Uint8Array(doc.width * doc.height);
    const center = centerCell(doc);
    // 중앙 floor의 오른쪽 wall 칸 하나만 벽으로 둔다.
    terrainType[cellIndex(center.x + 1, center.y, doc.width)] = TERRAIN_WALL;
    terrainType[cellIndex(center.x, center.y, doc.width)] = TERRAIN_EMPTY;

    const walls = collectPreview(doc, terrainType, layout).walls;

    expect(walls).toHaveLength(1);
    const [wall] = walls;
    expect(wall.sx).toBeCloseTo(WALL_SPAN);
    expect(wall.sz).toBeCloseTo(FLOOR_SPAN);
    expect(wall.cx).toBeCloseTo((FLOOR_SPAN + WALL_SPAN) / 2);
    expect(wall.cz).toBeCloseTo(0);
    // 모델을 지정하지 않았으면 기본 벽 높이다.
    expect(wall.model).toBe('default');
    expect(wall.height).toBe(WALL_HEIGHT);
    expect(WALL_HEIGHT).toBe(7.4);
  });

  it('미로 생성 미리보기 결과를 그대로 벽 상자로 옮길 수 있다', () => {
    const doc = createDoc(11, 11);
    const seed = makeBrush({ id: 1, layer: 'entity', entityType: 'seed' });
    getLayer(doc, 'entity').brush[cellIndex(5, 5, doc.width)] = seed.id;
    const preview = generateMazePreview(doc, [seed]).terrainType;
    const layout = mapLayout3D(doc);

    let wallCells = 0;
    for (let i = 0; i < preview.length; i++) if (preview[i] === TERRAIN_WALL) wallCells++;

    expect(collectPreview(doc, preview, layout).walls).toHaveLength(wallCells);
    expect(wallCells).toBeGreaterThan(0);
  });
});

describe('3D 미리보기 모델 타입', () => {
  it('모델마다 정해진 벽 높이를 돌려준다', () => {
    expect(wallHeightOf('default')).toBe(WALL_HEIGHT);
    expect(wallHeightOf('special-wall')).toBe(SPECIAL_WALL_HEIGHT);
    expect(wallHeightOf('special-wall')).toBe(11.1);
    // 문은 특수지역 벽과 같은 높이다.
    expect(wallHeightOf('special-door')).toBe(SPECIAL_WALL_HEIGHT);
    expect(wallHeightOf('outer-wall')).toBe(OUTER_WALL_HEIGHT);
    expect(wallHeightOf('outer-wall')).toBe(22.5);
    // 지역 계열은 벽이 아니다.
    expect(wallHeightOf('start-area')).toBeNull();
    expect(wallHeightOf('safe-area')).toBeNull();
    expect(wallHeightOf('boss-area')).toBeNull();
    expect(wallHeightOf('monster')).toBeNull();
    expect(wallHeightOf('golem')).toBeNull();
    expect(wallHeightOf('plant')).toBeNull();
  });

  it('지역 계열과 몬스터들만 장식물로 분류한다', () => {
    expect(isPropModel('start-area')).toBe(true);
    expect(isPropModel('safe-area')).toBe(true);
    expect(isPropModel('boss-area')).toBe(true);
    expect(isPropModel('monster')).toBe(true);
    expect(isPropModel('golem')).toBe(true);
    expect(isPropModel('plant')).toBe(true);
    expect(isPropModel('default')).toBe(false);
    expect(isPropModel('special-wall')).toBe(false);
    expect(isPropModel('special-door')).toBe(false);
    expect(isPropModel('outer-wall')).toBe(false);
  });

  it('브러쉬가 지정한 모델대로 벽 높이가 정해진다', () => {
    const doc = createDoc(11, 11);
    const layout = mapLayout3D(doc);
    const outer = makeBrush({ id: 2, previewModel: 'outer-wall' });
    const terrainType = new Uint8Array(doc.width * doc.height);

    const plain = cellIndex(6, 5, doc.width);
    const tall = cellIndex(5, 6, doc.width);
    terrainType[plain] = TERRAIN_WALL;
    terrainType[tall] = TERRAIN_WALL;
    getLayer(doc, 'terrain').brush[tall] = outer.id;

    const { walls } = collectPreview(doc, terrainType, layout, [outer]);
    expect(walls).toHaveLength(2);
    expect(walls.find((w) => w.model === 'outer-wall')?.height).toBe(OUTER_WALL_HEIGHT);
    expect(walls.find((w) => w.model === 'default')?.height).toBe(WALL_HEIGHT);
  });

  it('지역 장식물은 지나갈 수 있는 칸에만, 칸 가운데에 하나 선다', () => {
    const doc = createDoc(11, 11);
    const layout = mapLayout3D(doc);
    const tree = makeBrush({ id: 3, layer: 'entity', previewModel: 'safe-area' });
    const terrainType = new Uint8Array(doc.width * doc.height);

    const center = cellIndex(5, 5, doc.width);
    terrainType[center] = TERRAIN_EMPTY;
    getLayer(doc, 'entity').brush[center] = tree.id;

    const { props, walls } = collectPreview(doc, terrainType, layout, [tree]);
    expect(walls).toHaveLength(0);
    expect(props).toHaveLength(1);
    expect(props[0].model).toBe('safe-area');
    // 중앙 floor 칸이므로 원점에 선다.
    expect(props[0].cx).toBeCloseTo(0);
    expect(props[0].cz).toBeCloseTo(0);
  });

  it('미로 생성기가 뚫어 버린 칸에는 특수 벽을 세우지 않는다', () => {
    const doc = createDoc(11, 11);
    const layout = mapLayout3D(doc);
    const special = makeBrush({ id: 4, previewModel: 'special-wall' });
    const terrainType = new Uint8Array(doc.width * doc.height);

    const carved = cellIndex(6, 5, doc.width);
    // 브러쉬로는 특수 벽을 칠해 뒀지만 미리보기에서는 통로가 되었다.
    getLayer(doc, 'terrain').brush[carved] = special.id;
    terrainType[carved] = TERRAIN_EMPTY;

    const { walls, props } = collectPreview(doc, terrainType, layout, [special]);
    expect(walls).toHaveLength(0);
    expect(props).toHaveLength(0);
  });

  it('벽 칸에 놓인 지역 장식물은 무시된다', () => {
    const doc = createDoc(11, 11);
    const layout = mapLayout3D(doc);
    const boss = makeBrush({ id: 5, layer: 'entity', previewModel: 'boss-area' });
    const terrainType = new Uint8Array(doc.width * doc.height);

    const blocked = cellIndex(6, 5, doc.width);
    getLayer(doc, 'entity').brush[blocked] = boss.id;
    terrainType[blocked] = TERRAIN_WALL;

    const { walls, props } = collectPreview(doc, terrainType, layout, [boss]);
    expect(props).toHaveLength(0);
    // 벽 계열 모델이 아니므로 기본 벽으로 선다.
    expect(walls).toHaveLength(1);
    expect(walls[0].model).toBe('default');
  });
});
