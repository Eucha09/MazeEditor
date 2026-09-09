import type { Brush } from '../brush';
import { brushIndex, findBrushById } from '../brush';
import { cellKind } from '../lattice';
import type { MapDoc } from '../types';
import { cellIndex, getLayer, inBounds } from '../tilemap';
import { forEachBrushCell } from './brush';

export type PlaceRejection = 'out-of-bounds' | 'cell-kind' | 'blob-overlap' | 'not-fillable';

export const REJECTION_MESSAGE: Record<PlaceRejection, string> = {
  'out-of-bounds': '덩어리 브러쉬는 맵 안에 온전히 들어가야 놓을 수 있습니다.',
  'cell-kind': '이 브러쉬를 놓을 수 없는 칸입니다.',
  'blob-overlap': '덩어리는 다른 덩어리와 겹치거나 맞닿을 수 없습니다.',
  'not-fillable': '이 브러쉬는 채우기를 지원하지 않습니다. 브러쉬 설정에서 채우기 가능을 켜세요.',
};

export function isCellAllowed(doc: MapDoc, brush: Brush, x: number, y: number): boolean {
  return brush.allowedCellKinds.includes(cellKind(doc, x, y));
}

function half(size: number): number {
  return (size - 1) >> 1;
}

/**
 * 덩어리 브러쉬를 (cx, cy)에 놓을 수 있는지 본다.
 *
 * 덩어리는 통째로 하나의 오브젝트이므로 일부만 걸치는 배치를 허용하지 않는다.
 * 맵 밖으로 나가거나, 한 칸이라도 놓을 수 없는 칸 종류에 걸치면 전체가 거부된다.
 * 놓을 수 있으면 null을 반환한다.
 */
export function checkBlobPlacement(
  doc: MapDoc,
  brushes: Brush[],
  brush: Brush,
  cx: number,
  cy: number,
): PlaceRejection | null {
  let rejection: PlaceRejection | null = null;
  forEachBrushCell(cx, cy, brush.size, (x, y) => {
    if (rejection) return;
    if (!inBounds(doc, x, y)) rejection = 'out-of-bounds';
    else if (!isCellAllowed(doc, brush, x, y)) rejection = 'cell-kind';
  });
  if (rejection) return rejection;

  return hasBlobConflict(doc, brushes, brush, cx, cy) ? 'blob-overlap' : null;
}

/**
 * 이미 놓인 덩어리와 겹치거나 맞닿는지 확인한다.
 *
 * 덩어리는 가운데 칸에만 브러쉬 id(와 오브젝트 ID)가 남고 몸통은 0이라, 격자만
 * 봐서는 몸통이 어디까지인지 알 수 없다. 대신 주변에서 다른 덩어리의 "가운데 칸"을
 * 찾아 두 덩어리의 크기로 필요한 간격을 계산한다. 두 덩어리가 서로 닿지 않으려면
 * 중심 사이 거리가 각자의 반지름 합보다 2 이상 커야 한다.
 */
function hasBlobConflict(doc: MapDoc, brushes: Brush[], brush: Brush, cx: number, cy: number): boolean {
  const index = brushIndex(brushes);
  const brushIds = getLayer(doc, brush.layer).brush;
  const mine = half(brush.size);

  let maxOther = 0;
  for (const b of brushes) {
    if (b.blob && b.layer === brush.layer) maxOther = Math.max(maxOther, half(b.size));
  }
  const radius = mine + maxOther + 1;

  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!inBounds(doc, x, y)) continue;
      const id = brushIds[cellIndex(x, y, doc.width)];
      if (id === 0) continue;
      const owner = findBrushById(index, id);
      if (!owner?.blob) continue;
      const needed = mine + half(owner.size) + 2;
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) < needed) return true;
    }
  }
  return false;
}
