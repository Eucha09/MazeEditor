/** 브러쉬 도구의 순수 기하 계산. 맵이나 스토어를 알지 못한다. */

/** 중심 (cx, cy)에 놓인 size x size 정사각 브러쉬가 덮는 셀. */
export function forEachBrushCell(
  cx: number,
  cy: number,
  size: number,
  fn: (x: number, y: number) => void,
): void {
  const half = Math.floor(size / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      fn(cx + dx, cy + dy);
    }
  }
}

/**
 * 두 셀을 잇는 직선 위의 셀 (Bresenham).
 *
 * 포인터 이벤트는 빠르게 드래그하면 셀을 건너뛰며 도착한다. 이전 셀과 현재 셀을
 * 직선으로 이어 칠해야 선이 점선으로 끊기지 않는다.
 */
export function forEachLineCell(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fn: (x: number, y: number) => void,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    fn(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
