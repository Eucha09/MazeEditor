import { describe, expect, it } from 'vitest';
import { defaultBrushes, reorderBrushes, sameObjectIdForAll, zeroObjectIds, type Brush } from '@/core/brush';
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
    previewModel: 'default',
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

  it('3D 미리보기 모델 타입이 왕복해도 유지된다', () => {
    const brushes = [
      brush({ id: 1, previewModel: 'outer-wall' }),
      brush({ id: 2, previewModel: 'special-door' }),
      brush({ id: 3, previewModel: 'boss-area' }),
      brush({ id: 4, previewModel: 'monster' }),
      brush({ id: 5, previewModel: 'golem' }),
      brush({ id: 6, previewModel: 'plant' }),
    ];
    expect(parseBrushesJson(brushesToJson(brushes)).map((b) => b.previewModel)).toEqual([
      'outer-wall',
      'special-door',
      'boss-area',
      'monster',
      'golem',
      'plant',
    ]);
  });

  it('음수 오브젝트 ID가 왕복해도 유지된다', () => {
    const negative = brush({ objectIds: { floor: -1, wall: -250, pillar: 7 } });
    const [restored] = parseBrushesJson(brushesToJson([negative]));
    expect(restored.objectIds).toEqual({ floor: -1, wall: -250, pillar: 7 });
  });

  it('모델 타입이 없던 예전(v3) 파일도 기본 모델로 읽힌다', () => {
    // v4에서 추가된 항목이라 예전 파일에는 아예 없다. 브러쉬 세트를 통째로
    // 잃는 것보다 기본값을 채우는 편이 낫다.
    const file = JSON.parse(brushesToJson([brush()]));
    file.version = 3;
    delete file.brushes[0].previewModel;

    const [restored] = parseBrushesJson(JSON.stringify(file));
    expect(restored.previewModel).toBe('default');
    expect(restored.name).toBe('나무');
  });

  it('모르는 모델 타입은 파일을 튕기지 않고 기본 모델로 받는다', () => {
    // 나중 버전에서 모델이 늘어나도 예전 에디터가 그 파일을 열 수 있어야 한다.
    const file = JSON.parse(brushesToJson([brush()]));
    file.brushes[0].previewModel = '없는-모델';

    const [restored] = parseBrushesJson(JSON.stringify(file));
    expect(restored.previewModel).toBe('default');
    expect(restored.name).toBe('나무');
  });

  it('팔레트에서 바꾼 순서가 저장·복원 후에도 유지된다', () => {
    const original = defaultBrushes();
    // '벽'(id 2)을 '엔티티' 그룹 맨 끝으로 옮긴다.
    const reordered = reorderBrushes(original, 2, '엔티티', null);
    expect(reordered.map((b) => b.name)).toEqual(['바닥', '시작', '목표', '아이템', '적 스폰', 'Seed', '벽']);

    const restored = parseBrushesJson(brushesToJson(reordered));
    expect(restored.map((b) => b.name)).toEqual(reordered.map((b) => b.name));
    expect(restored.find((b) => b.name === '벽')!.group).toBe('엔티티');
  });
});
