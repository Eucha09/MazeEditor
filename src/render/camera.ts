import type { CellPos } from '@/core/types';

/**
 * 화면 좌표와 격자 좌표의 변환을 담당한다.
 *
 * 변환 규칙은 반드시 이 파일에만 존재해야 한다. 여기저기 흩어지면 줌/팬 상태에서
 * 브러쉬가 커서와 어긋나는 버그를 추적하기 어려워진다.
 *
 *   screen = cell * scale + offset
 */
export interface Camera {
  /** 격자 원점(0,0)이 놓이는 화면 좌표 (CSS 픽셀) */
  ox: number;
  oy: number;
  /** 셀 하나의 화면 크기 (CSS 픽셀) */
  scale: number;
}

export const MIN_SCALE = 2;
export const MAX_SCALE = 96;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function screenToCell(cam: Camera, sx: number, sy: number): CellPos {
  return {
    x: Math.floor((sx - cam.ox) / cam.scale),
    y: Math.floor((sy - cam.oy) / cam.scale),
  };
}

export function cellToScreen(cam: Camera, x: number, y: number): { x: number; y: number } {
  return { x: x * cam.scale + cam.ox, y: y * cam.scale + cam.oy };
}

export function pan(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, ox: cam.ox + dx, oy: cam.oy + dy };
}

/** 커서 아래의 격자 지점이 그대로 머물도록 확대/축소한다. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const scale = clampScale(cam.scale * factor);
  if (scale === cam.scale) return cam;
  const k = scale / cam.scale;
  return {
    scale,
    ox: sx - (sx - cam.ox) * k,
    oy: sy - (sy - cam.oy) * k,
  };
}

/** 맵 전체가 뷰포트에 들어오도록 맞추고 가운데 정렬한다. */
export function fitToView(
  mapW: number,
  mapH: number,
  viewW: number,
  viewH: number,
  padding = 32,
): Camera {
  const avail = { w: Math.max(1, viewW - padding * 2), h: Math.max(1, viewH - padding * 2) };
  const scale = clampScale(Math.min(avail.w / mapW, avail.h / mapH));
  return {
    scale,
    ox: (viewW - mapW * scale) / 2,
    oy: (viewH - mapH * scale) / 2,
  };
}
