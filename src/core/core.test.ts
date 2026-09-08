import { describe, expect, it } from 'vitest';
import {
  MAX_MAP_SIZE,
  MIN_MAP_SIZE,
  cellIndex,
  createDoc,
  getLayer,
  isValidMapSize,
  normalizeMapSize,
  resizeDoc,
  sameGrid,
  type Anchor,
} from './tilemap';
import { centerCell, isProtectedCell } from './lattice';
import { TILE_FLOOR, TILE_ITEM, TILE_NONE, TILE_WALL } from './tileset';
import { History, type Stroke } from './history';
import { forEachBrushCell, forEachLineCell } from './tools/brush';
import { parseJson, toJson } from './io/serialize';
import { mapFileSchema } from './io/schema';
import type { LayerKey, MapDoc, TileId } from './types';

/** 스토어가 하는 일과 동일하게, 변경을 기록하면서 셀에 값을 쓴다. */
function write(doc: MapDoc, stroke: Stroke, key: LayerKey, x: number, y: number, tile: TileId): void {
  const layer = getLayer(doc, key);
  const index = cellIndex(x, y, doc.width);
  const before = layer.data[index];
  if (before === tile) return;
  layer.data[index] = tile;
  stroke.changes.push({ layer: key, index, before, after: tile });
}

describe('createDoc', () => {
  it('테두리를 벽으로 채우고 내부는 바닥으로 둔다', () => {
    const doc = createDoc(11, 7);
    const terrain = getLayer(doc, 'terrain');

    expect(terrain.data[cellIndex(0, 0, 11)]).toBe(TILE_WALL);
    expect(terrain.data[cellIndex(10, 6, 11)]).toBe(TILE_WALL);
    expect(terrain.data[cellIndex(5, 0, 11)]).toBe(TILE_WALL);
    expect(terrain.data[cellIndex(0, 3, 11)]).toBe(TILE_WALL);

    expect(terrain.data[cellIndex(5, 3, 11)]).toBe(TILE_FLOOR);
    expect(terrain.data[cellIndex(1, 1, 11)]).toBe(TILE_FLOOR);
  });

  it('엔티티 레이어는 비어 있고 크기가 지형과 같다', () => {
    const doc = createDoc(11, 7);
    const entity = getLayer(doc, 'entity');
    expect(entity.data.length).toBe(77);
    expect(entity.data.every((v) => v === TILE_NONE)).toBe(true);
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
    const terrain = getLayer(doc, 'terrain');
    const snapshot = Uint16Array.from(terrain.data);

    const history = new History();
    const stroke: Stroke = { label: 'brush', changes: [] };
    forEachLineCell(2, 2, 8, 8, (x, y) => write(doc, stroke, 'terrain', x, y, TILE_WALL));
    expect(history.commit(stroke)).toBe(true);
    expect(terrain.data).not.toEqual(snapshot);

    expect(history.undo(doc)).toBe(doc);
    expect(terrain.data).toEqual(snapshot);

    expect(history.redo(doc)).toBe(doc);
    expect(terrain.data[cellIndex(5, 5, 11)]).toBe(TILE_WALL);
  });

  it('값이 바뀌지 않은 스트로크는 히스토리에 쌓지 않는다', () => {
    const doc = createDoc(11, 11);
    const history = new History();
    const stroke: Stroke = { label: 'brush', changes: [] };
    // 이미 바닥인 칸에 바닥을 칠한다.
    write(doc, stroke, 'terrain', 5, 5, TILE_FLOOR);
    expect(history.commit(stroke)).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('새 스트로크를 쌓으면 redo 스택이 비워진다', () => {
    const doc = createDoc(11, 11);
    const history = new History();

    const first: Stroke = { label: 'brush', changes: [] };
    write(doc, first, 'terrain', 4, 4, TILE_WALL);
    history.commit(first);
    history.undo(doc);
    expect(history.canRedo).toBe(true);

    const second: Stroke = { label: 'brush', changes: [] };
    write(doc, second, 'terrain', 5, 5, TILE_WALL);
    history.commit(second);
    expect(history.canRedo).toBe(false);
  });
});

describe('직렬화', () => {
  it('JSON 왕복 후에도 내용이 같다', () => {
    const doc = createDoc(15, 11, { name: 'level-07' });
    const stroke: Stroke = { label: 'brush', changes: [] };
    forEachLineCell(2, 2, 12, 8, (x, y) => write(doc, stroke, 'terrain', x, y, TILE_WALL));
    write(doc, stroke, 'entity', 1, 1, 3);
    write(doc, stroke, 'entity', 13, 9, 4);

    const restored = parseJson(toJson(doc));

    expect(restored.name).toBe('level-07');
    expect(restored.width).toBe(15);
    expect(restored.height).toBe(11);
    expect(getLayer(restored, 'terrain').data).toEqual(getLayer(doc, 'terrain').data);
    expect(getLayer(restored, 'entity').data).toEqual(getLayer(doc, 'entity').data);
  });

  it('행 길이가 width와 다르면 거부한다', () => {
    const doc = createDoc(7, 7);
    const file = JSON.parse(toJson(doc));
    file.layers[0].rows[2] = [1, 1, 1];
    expect(mapFileSchema.safeParse(file).success).toBe(false);
  });

  it('필수 레이어가 없으면 거부한다', () => {
    const doc = createDoc(7, 7);
    const file = JSON.parse(toJson(doc));
    file.layers = file.layers.filter((l: { key: string }) => l.key !== 'entity');
    expect(mapFileSchema.safeParse(file).success).toBe(false);
  });

  it('format이 다른 파일은 거부한다', () => {
    expect(() => parseJson('{"format":"tiled","version":1}')).toThrow();
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
    expect(getLayer(doc, 'terrain').data.length).toBe(11 * 11);
  });
});

describe('보호 격자', () => {
  it('중앙 칸은 언제나 보호된다', () => {
    const doc = createDoc(15, 11);
    const c = centerCell(doc);
    expect(c).toEqual({ x: 7, y: 5 });
    expect(isProtectedCell(doc, c.x, c.y)).toBe(true);
  });

  it('중앙에서 2칸 간격인 칸만 보호된다', () => {
    const doc = createDoc(11, 11); // 중앙 (5,5)
    expect(isProtectedCell(doc, 3, 5)).toBe(true);
    expect(isProtectedCell(doc, 5, 1)).toBe(true);
    expect(isProtectedCell(doc, 9, 9)).toBe(true);
    expect(isProtectedCell(doc, 4, 5)).toBe(false);
    expect(isProtectedCell(doc, 5, 4)).toBe(false);
    expect(isProtectedCell(doc, 4, 4)).toBe(false);
  });

  it('바깥 테두리는 어떤 유효 크기에서도 보호 격자와 겹치지 않는다', () => {
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

  it('크기를 바꿔도 옮겨진 내용과 격자의 정렬이 유지된다', () => {
    // 보호 격자 위에만 표식을 찍어 두고, 리사이즈 후에도 표식이 전부 격자 위에 있는지 본다.
    const doc = createDoc(11, 11, { borderWalls: false });
    const src = getLayer(doc, 'entity');
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        if (isProtectedCell(doc, x, y)) src.data[cellIndex(x, y, doc.width)] = TILE_ITEM;
      }
    }

    const anchors: Anchor[] = [
      { x: 'left', y: 'top' },
      { x: 'center', y: 'middle' },
      { x: 'right', y: 'bottom' },
    ];

    for (const anchor of anchors) {
      for (const [w, h] of [[19, 15], [7, 7]] as const) {
        const next = resizeDoc(doc, w, h, { anchor, borderWalls: false });
        const moved = getLayer(next, 'entity');
        let marks = 0;
        for (let y = 0; y < next.height; y++) {
          for (let x = 0; x < next.width; x++) {
            if (moved.data[cellIndex(x, y, next.width)] !== TILE_ITEM) continue;
            marks++;
            expect(isProtectedCell(next, x, y)).toBe(true);
          }
        }
        expect(marks).toBeGreaterThan(0);
      }
    }
  });
});

describe('resizeDoc', () => {
  it('가운데 기준으로 넓히면 기존 내용이 정확히 중앙에 놓인다', () => {
    const doc = createDoc(7, 7, { borderWalls: false });
    getLayer(doc, 'terrain').data[cellIndex(3, 3, 7)] = TILE_WALL;
    getLayer(doc, 'entity').data[cellIndex(1, 1, 7)] = 3;

    const big = resizeDoc(doc, 11, 11, { borderWalls: false });

    expect(big.width).toBe(11);
    expect(big.height).toBe(11);
    expect(getLayer(big, 'terrain').data[cellIndex(5, 5, 11)]).toBe(TILE_WALL);
    expect(getLayer(big, 'entity').data[cellIndex(3, 3, 11)]).toBe(3);
  });

  it('원본 문서를 건드리지 않는다', () => {
    // 히스토리가 스냅샷 복사 없이 이전 문서 참조만 들고 있을 수 있는 근거.
    const doc = createDoc(7, 7);
    const snapshot = Uint16Array.from(getLayer(doc, 'terrain').data);

    resizeDoc(doc, 11, 11);

    expect(doc.width).toBe(7);
    expect(getLayer(doc, 'terrain').data).toEqual(snapshot);
  });

  it('왼쪽 위 기준으로 줄이면 바깥쪽이 잘린다', () => {
    const doc = createDoc(11, 11, { borderWalls: false });
    const t = getLayer(doc, 'terrain');
    t.data[cellIndex(1, 1, 11)] = TILE_WALL;
    t.data[cellIndex(9, 9, 11)] = TILE_WALL;

    const small = resizeDoc(doc, 7, 7, { anchor: { x: 'left', y: 'top' }, borderWalls: false });

    expect(getLayer(small, 'terrain').data[cellIndex(1, 1, 7)]).toBe(TILE_WALL);
    expect(Array.from(getLayer(small, 'terrain').data).filter((v) => v === TILE_WALL)).toHaveLength(1);
  });

  it('테두리 다시 채우기를 켜면 새 바깥 줄이 벽이 된다', () => {
    const big = resizeDoc(createDoc(7, 7), 11, 11, { borderWalls: true });
    const t = getLayer(big, 'terrain');

    expect(t.data[cellIndex(0, 0, 11)]).toBe(TILE_WALL);
    expect(t.data[cellIndex(10, 5, 11)]).toBe(TILE_WALL);
    expect(t.data[cellIndex(5, 5, 11)]).toBe(TILE_FLOOR);
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
    const docA = createDoc(7, 7, { borderWalls: false });
    const history = new History();

    const stroke: Stroke = { label: 'brush', changes: [] };
    write(docA, stroke, 'terrain', 2, 2, TILE_WALL);
    history.commit(stroke);

    const docB = resizeDoc(docA, 11, 11, { borderWalls: false });
    history.commitDoc('resize', docA, docB);

    const afterResizeUndo = history.undo(docB);
    expect(afterResizeUndo).toBe(docA);
    expect(afterResizeUndo?.width).toBe(7);

    history.undo(docA);
    expect(getLayer(docA, 'terrain').data[cellIndex(2, 2, 7)]).toBe(TILE_FLOOR);
  });
});

describe('sameGrid', () => {
  it('같은 크기·같은 내용이면 true', () => {
    expect(sameGrid(createDoc(11, 11), createDoc(11, 11))).toBe(true);
  });

  it('크기가 그대로여도 셀 하나가 다르면 false', () => {
    const a = createDoc(11, 11);
    const b = createDoc(11, 11);
    getLayer(b, 'terrain').data[cellIndex(4, 4, 11)] = TILE_WALL;
    expect(sameGrid(a, b)).toBe(false);
  });

  it('크기가 다르면 false', () => {
    expect(sameGrid(createDoc(11, 11), createDoc(15, 11))).toBe(false);
  });

  it('같은 크기로 리사이즈하면 결과가 원본과 같다', () => {
    const doc = createDoc(11, 11);
    expect(sameGrid(doc, resizeDoc(doc, 11, 11, { borderWalls: true }))).toBe(true);
  });
});
