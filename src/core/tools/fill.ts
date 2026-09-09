import type { CellPos, LayerKey, MapDoc } from '../types';
import { cellIndex, getLayer, inBounds } from '../tilemap';

/**
 * (x0, y0)과 정확히 같은 값을 가진, 4방향으로 이어진 칸들을 모두 찾는다.
 *
 * terrain 레이어는 지형 타입과 오브젝트 ID가 둘 다 같아야 같은 칸으로 본다 —
 * 그래야 지형 타입은 같은 Wall이라도 텍스처(오브젝트 ID)가 다른 옆 영역까지
 * 번지지 않는다. entity 레이어는 지형 타입이 없으므로 오브젝트 ID만 비교한다.
 *
 * 재귀 대신 스택을 직접 다뤄서, 맵 전체가 한 덩어리인 최악의 경우(511x511)에도
 * 콜 스택이 넘치지 않는다.
 */
export function floodFillRegion(doc: MapDoc, layer: LayerKey, x0: number, y0: number): CellPos[] {
  if (!inBounds(doc, x0, y0)) return [];

  const { width, height } = doc;
  const object = getLayer(doc, layer).object;
  const terrainType = doc.terrainType;
  const startIndex = cellIndex(x0, y0, width);
  const startType = terrainType[startIndex];
  const startObject = object[startIndex];

  const matches = (i: number): boolean => {
    if (layer === 'terrain' && terrainType[i] !== startType) return false;
    return object[i] === startObject;
  };

  const visited = new Uint8Array(width * height);
  visited[startIndex] = 1;
  const stack = [startIndex];
  const result: CellPos[] = [];

  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    result.push({ x, y });

    const left = x > 0 ? i - 1 : -1;
    const right = x < width - 1 ? i + 1 : -1;
    const up = y > 0 ? i - width : -1;
    const down = y < height - 1 ? i + width : -1;

    for (const n of [left, right, up, down]) {
      if (n < 0 || visited[n]) continue;
      visited[n] = 1;
      if (matches(n)) stack.push(n);
    }
  }

  return result;
}
