import { describe, expect, it } from 'vitest';
import { cellIndex, createDoc, getLayer } from './tilemap';
import { TILE_FLOOR, TILE_NONE, TILE_WALL } from './tileset';
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
    const doc = createDoc(7, 5);
    const terrain = getLayer(doc, 'terrain');

    expect(terrain.data[cellIndex(0, 0, 7)]).toBe(TILE_WALL);
    expect(terrain.data[cellIndex(6, 4, 7)]).toBe(TILE_WALL);
    expect(terrain.data[cellIndex(3, 0, 7)]).toBe(TILE_WALL);
    expect(terrain.data[cellIndex(0, 2, 7)]).toBe(TILE_WALL);

    expect(terrain.data[cellIndex(3, 2, 7)]).toBe(TILE_FLOOR);
    expect(terrain.data[cellIndex(1, 1, 7)]).toBe(TILE_FLOOR);
  });

  it('엔티티 레이어는 비어 있고 크기가 지형과 같다', () => {
    const doc = createDoc(7, 5);
    const entity = getLayer(doc, 'entity');
    expect(entity.data.length).toBe(35);
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
    const doc = createDoc(9, 9);
    const terrain = getLayer(doc, 'terrain');
    const snapshot = Uint16Array.from(terrain.data);

    const history = new History();
    const stroke: Stroke = { label: 'brush', changes: [] };
    forEachLineCell(2, 2, 6, 6, (x, y) => write(doc, stroke, 'terrain', x, y, TILE_WALL));
    expect(history.commit(stroke)).toBe(true);
    expect(terrain.data).not.toEqual(snapshot);

    expect(history.undo(doc)).toBe(true);
    expect(terrain.data).toEqual(snapshot);

    expect(history.redo(doc)).toBe(true);
    expect(terrain.data[cellIndex(4, 4, 9)]).toBe(TILE_WALL);
  });

  it('값이 바뀌지 않은 스트로크는 히스토리에 쌓지 않는다', () => {
    const doc = createDoc(9, 9);
    const history = new History();
    const stroke: Stroke = { label: 'brush', changes: [] };
    // 이미 바닥인 칸에 바닥을 칠한다.
    write(doc, stroke, 'terrain', 4, 4, TILE_FLOOR);
    expect(history.commit(stroke)).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('새 스트로크를 쌓으면 redo 스택이 비워진다', () => {
    const doc = createDoc(9, 9);
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
    const doc = createDoc(13, 11, { name: 'level-07' });
    const stroke: Stroke = { label: 'brush', changes: [] };
    forEachLineCell(2, 2, 10, 8, (x, y) => write(doc, stroke, 'terrain', x, y, TILE_WALL));
    write(doc, stroke, 'entity', 1, 1, 3);
    write(doc, stroke, 'entity', 11, 9, 4);

    const restored = parseJson(toJson(doc));

    expect(restored.name).toBe('level-07');
    expect(restored.width).toBe(13);
    expect(restored.height).toBe(11);
    expect(getLayer(restored, 'terrain').data).toEqual(getLayer(doc, 'terrain').data);
    expect(getLayer(restored, 'entity').data).toEqual(getLayer(doc, 'entity').data);
  });

  it('행 길이가 width와 다르면 거부한다', () => {
    const doc = createDoc(5, 5);
    const file = JSON.parse(toJson(doc));
    file.layers[0].rows[2] = [1, 1, 1];
    expect(mapFileSchema.safeParse(file).success).toBe(false);
  });

  it('필수 레이어가 없으면 거부한다', () => {
    const doc = createDoc(5, 5);
    const file = JSON.parse(toJson(doc));
    file.layers = file.layers.filter((l: { key: string }) => l.key !== 'entity');
    expect(mapFileSchema.safeParse(file).success).toBe(false);
  });

  it('format이 다른 파일은 거부한다', () => {
    expect(() => parseJson('{"format":"tiled","version":1}')).toThrow();
  });
});
