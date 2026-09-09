import type { CellKind, CellPos, MapDoc } from './types';

/**
 * 중앙 기준 격자 분류.
 *
 * 맵 중앙을 기준으로 가로·세로 2칸 간격에 놓인 칸들(중앙 포함)을 floor라 하고,
 * 항상 지나갈 수 있어야 한다 — 통행 불가(solid) 타일은 이 칸에 놓을 수 없다.
 * floor 칸 사이에 있는 칸은 wall, wall 칸 사이(= floor 네 칸이 대각선으로
 * 맞닿는 교차점)는 pillar다. (floor, wall, pillar) x (floor, wall, pillar)
 * 순서로 반복되는 표준 셀-벽-기둥 미로 격자다.
 *
 * 맵 크기가 4n+3이면 중앙 좌표 (w-1)/2 가 항상 홀수가 되어 floor 칸도 홀수
 * 좌표에만 놓인다. 바깥 테두리는 x=0, x=w-1 처럼 짝수 좌표라 floor와 절대
 * 겹치지 않는다. normalizeMapSize가 이 크기를 강제하므로 "테두리는 벽인데
 * 벽을 그릴 수 없는 칸" 같은 모순 상태가 생기지 않는다.
 */
export function centerCell(doc: MapDoc): CellPos {
  return { x: (doc.width - 1) >> 1, y: (doc.height - 1) >> 1 };
}

export function cellKind(doc: MapDoc, x: number, y: number): CellKind {
  const center = centerCell(doc);
  // 음수 나머지도 0과 비교하면 되므로 별도 보정이 필요 없다 (-2 % 2 === -0).
  const evenX = (x - center.x) % 2 === 0;
  const evenY = (y - center.y) % 2 === 0;
  if (evenX && evenY) return 'floor';
  if (evenX !== evenY) return 'wall';
  return 'pillar';
}

export function isProtectedCell(doc: MapDoc, x: number, y: number): boolean {
  return cellKind(doc, x, y) === 'floor';
}
