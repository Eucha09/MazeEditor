import type { CellPos, MapDoc } from './types';

/**
 * 보호 격자.
 *
 * 맵 중앙을 기준으로 가로·세로 2칸 간격에 놓인 칸들(중앙 포함)은 항상 지나갈 수
 * 있어야 한다. 통행 불가(solid) 타일은 이 칸에 놓을 수 없다.
 *
 * 맵 크기가 4n+3이면 중앙 좌표 (w-1)/2 가 항상 홀수가 되어 격자도 홀수 좌표에만
 * 놓인다. 바깥 테두리는 x=0, x=w-1 처럼 짝수 좌표라 격자와 절대 겹치지 않는다.
 * normalizeMapSize가 이 크기를 강제하므로 "테두리는 벽인데 벽을 그릴 수 없는 칸"
 * 같은 모순 상태가 생기지 않는다.
 */
export function centerCell(doc: MapDoc): CellPos {
  return { x: (doc.width - 1) >> 1, y: (doc.height - 1) >> 1 };
}

export function isProtectedCell(doc: MapDoc, x: number, y: number): boolean {
  const cx = (doc.width - 1) >> 1;
  const cy = (doc.height - 1) >> 1;
  // 음수 나머지도 0과 비교하면 되므로 별도 보정이 필요 없다 (-2 % 2 === -0).
  return (x - cx) % 2 === 0 && (y - cy) % 2 === 0;
}
