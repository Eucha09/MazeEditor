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
  sameObjectIdForAll,
  zeroObjectIds,
} from './brush';
import { History, type Stroke } from './history';
import { forEachBrushCell, forEachLineCell } from './tools/brush';
import { checkBlobPlacement } from './tools/place';
import { floodFillRegion } from './tools/fill';
import { generateMazePreview } from './tools/generateMaze';
import { parseJson, toJson } from './io/serialize';
import { mapFileSchema } from './io/schema';
import type { GridId, MapDoc } from './types';
import { TERRAIN_EMPTY, TERRAIN_NONE, TERRAIN_WALL } from './types';

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
    ...over,
  };
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

  it('오브젝트 ID는 0 이상의 정수로 맞춘다', () => {
    const { id: _id, ...draft } = makeBrush({ objectIds: { floor: -3, wall: 2.7, pillar: Number.NaN } });
    expect(normalizeDraft(draft).objectIds).toEqual({ floor: 0, wall: 2, pillar: 0 });
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

  it('한 칸이라도 놓을 수 없는 칸 종류에 걸치면 거부된다', () => {
    const doc = createDoc(11, 11);
    // 3x3은 floor/wall/pillar를 모두 덮으므로 floor를 빼면 어디에도 놓을 수 없다.
    const noFloor = makeBrush({ ...blob3, allowedCellKinds: ['wall', 'pillar'] });
    expect(checkBlobPlacement(doc, [noFloor], noFloor, 5, 5)).toBe('cell-kind');
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
