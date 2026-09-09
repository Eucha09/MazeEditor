import { describe, expect, it } from 'vitest';
import { defaultBrushes, sameObjectIdForAll, zeroObjectIds, type Brush } from '@/core/brush';
import { TERRAIN_NONE, TERRAIN_WALL } from '@/core/types';
import { brushesToJson, parseBrushesJson } from './brushes';

function brush(over: Partial<Brush> = {}): Brush {
  return {
    id: 999,
    name: '나무',
    group: '숲 지형',
    layer: 'terrain',
    terrainType: TERRAIN_WALL,
    entityType: null,
    allowedCellKinds: ['floor', 'wall', 'pillar'],
    objectIds: sameObjectIdForAll(101),
    unique: false,
    size: 3,
    blob: true,
    fillable: false, // blob과 fillable은 함께 켤 수 없다
    color: null,
    ...over,
  };
}

describe('브러쉬 내보내기/가져오기', () => {
  it('왕복 후에도 설정이 그대로다', () => {
    const brushes = [brush(), ...defaultBrushes()];
    expect(parseBrushesJson(brushesToJson(brushes))).toEqual(brushes);
  });

  it('가져온 값도 설정 규칙에 맞게 정리된다', () => {
    // 바깥에서 손으로 고친 파일이 규칙을 어길 수 있다.
    const wrong = brush({
      layer: 'entity',
      size: 5,
      terrainType: TERRAIN_WALL,
      allowedCellKinds: ['wall'],
      fillable: true,
    });
    const [restored] = parseBrushesJson(brushesToJson([wrong]));

    expect(restored.size).toBe(1); // entity는 크기 1 고정
    expect(restored.terrainType).toBe(TERRAIN_NONE); // entity는 지형 타입을 쓰지 않는다
    expect(restored.fillable).toBe(false); // 세 칸 종류를 다 놓을 수 있어야 채우기 가능
  });

  it('같은 id가 겹치면 뒤엣것에 새 id를 준다', () => {
    const dup = [brush({ id: 500 }), brush({ id: 500, name: '바위' })];
    const restored = parseBrushesJson(brushesToJson(dup));

    expect(restored).toHaveLength(2);
    expect(restored[0].id).toBe(500);
    expect(restored[1].id).not.toBe(500);
  });

  it('형식이 다른 파일은 이유와 함께 거부한다', () => {
    expect(() => parseBrushesJson('{"format":"something-else","version":1,"brushes":[]}')).toThrow(
      /브러쉬 파일 형식/,
    );
    expect(() => parseBrushesJson('not json')).toThrow(/JSON/);
  });

  it('맵 파일과 달리 브러쉬 파일에는 격자 정보가 없다', () => {
    const file = JSON.parse(brushesToJson([brush({ objectIds: zeroObjectIds() })]));
    expect(file.brushes).toHaveLength(1);
    expect(file.terrain).toBeUndefined();
    expect(file.width).toBeUndefined();
  });
});
