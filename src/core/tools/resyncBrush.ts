import type { Brush } from '../brush';
import { objectIdFor } from '../brush';
import { cellKind } from '../lattice';
import { cellIndex, getLayer, objectGridOf } from '../tilemap';
import type { GridId, LayerKey, MapDoc } from '../types';

export interface BrushSyncChange {
  grid: GridId;
  index: number;
  before: number;
  after: number;
}

const LAYERS: LayerKey[] = ['terrain', 'entity'];

/**
 * 브러쉬 설정을 고친 뒤, 이미 이 브러쉬로 칠해진 칸들을 새 설정에 맞게
 * 다시 계산한다.
 *
 * 칸에 박힌 object·terrainType 값은 칠한 시점의 브러쉬 설정을 그대로 얼려 둔
 * 결과물이다. 브러쉬를 고친 뒤에도 맵이 옛 값을 들고 있으면 "팔레트에는 새
 * 오브젝트 ID가 보이는데 맵에는 옛 값이 그대로"인 상태가 되므로, 브러쉬 id가
 * 남아 있는 모든 칸을 찾아 지금 설정대로 다시 계산해 준다. 찾는 방법은 unique
 * 브러쉬 재배치(editorStore.clearPreviousUnique)와 같다 — object id가 아니라
 * brush id로 "이 브러쉬가 칠한 칸"을 판정한다.
 *
 * 칸이 어느 레이어에 기록되어 있는지는 칠했을 때의 brush.layer를 따른다.
 * 브러쉬 id는 파일 전체에서 유일하므로(io/brushes.ts) 두 레이어를 모두 뒤져도
 * 안전하다 — 브러쉬의 레이어를 나중에 바꾼 경우에도(드문 편집이지만) 예전에
 * 칠해진 칸을 놓치지 않는다. 다만 terrainType은 지금 브러쉬가 terrain
 * 레이어일 때만 맞춰 쓴다 — entity로 바뀐 브러쉬의 terrainType은 항상 None으로
 * 고정되므로(normalizeDraft), 그 값을 그대로 따라가면 과거에 그려 둔 벽·바닥이
 * 조용히 지워지는 부작용이 생긴다.
 *
 * 덩어리 브러쉬의 몸통 칸은 brush id가 0으로 남으므로(가운데 칸에만 id가
 * 붙는다, core/tools/place.ts 참고) 여기서도 가운데 칸만 갱신된다 — 다른
 * 브러쉬 로직과 같은 한계다.
 *
 * 문서를 직접 바꾸지 않고 바뀔 칸 목록만 돌려준다. 실제 반영과 히스토리
 * 기록은 부르는 쪽(editorStore)이 한다 — 되돌리기가 가능해야 하기 때문이다.
 */
export function computeBrushResync(doc: MapDoc, brush: Brush): BrushSyncChange[] {
  const changes: BrushSyncChange[] = [];

  for (const layerKey of LAYERS) {
    const layer = getLayer(doc, layerKey);
    const objectGrid = objectGridOf(layerKey);

    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const i = cellIndex(x, y, doc.width);
        if (layer.brush[i] !== brush.id) continue;

        const nextObject = objectIdFor(brush, cellKind(doc, x, y));
        if (layer.object[i] !== nextObject) {
          changes.push({ grid: objectGrid, index: i, before: layer.object[i], after: nextObject });
        }

        if (layerKey === 'terrain' && brush.layer === 'terrain' && doc.terrainType[i] !== brush.terrainType) {
          changes.push({ grid: 'terrainType', index: i, before: doc.terrainType[i], after: brush.terrainType });
        }
      }
    }
  }

  return changes;
}
