import type { BrushId, MapDoc } from '../types';

/** 브러쉬 하나가 맵에서 차지하고 있는 칸 수. */
export interface BrushUsage {
  brushId: BrushId;
  count: number;
}

/**
 * 맵에 실제로 칠해져 있는 브러쉬와 그 칸 수를 센다. 많이 쓰인 순으로 돌려준다.
 *
 * 오브젝트 ID가 아니라 브러쉬 id로 센다 — 오브젝트 ID를 0으로 두는 장식용
 * 브러쉬가 칠한 칸도 세어야 하고, 여러 브러쉬가 같은 오브젝트 ID를 쓰더라도
 * 서로 구분되어야 하기 때문이다.
 *
 * 두 레이어를 모두 훑어 합친다. 한 브러쉬의 id가 두 레이어에 걸쳐 남아 있을 수
 * 있다 — 칠한 뒤에 브러쉬의 layer 설정을 바꿀 수 있기 때문이다(resyncBrush.ts 참고).
 *
 * 팔레트에서 지워진 브러쉬의 id도 빼지 않고 돌려준다. 맵에는 여전히 남아 있는
 * 칸이라 감추면 칸 수가 맞지 않는 것처럼 보인다. 이름은 부르는 쪽에서 붙인다.
 */
export function countBrushUsage(doc: MapDoc): BrushUsage[] {
  const counts = new Map<BrushId, number>();
  for (const layer of doc.layers) {
    const ids = layer.brush;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id !== 0) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([brushId, count]) => ({ brushId, count }))
    .sort((a, b) => b.count - a.count || a.brushId - b.brushId);
}
