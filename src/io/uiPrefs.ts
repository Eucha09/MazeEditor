/**
 * 창 크기 같은 UI 레이아웃 취향. 문서 내용이 아니므로 autosave와는 별도로,
 * 그리고 브러쉬처럼 내보내기/가져오기 대상도 아니므로 조용히 localStorage에만 둔다.
 */
const PALETTE_WIDTH_KEY = 'maze-editor:palette-width:v1';
const USAGE_PANEL_KEY = 'maze-editor:usage-panel-open:v1';

export function loadPaletteWidth(fallback: number): number {
  try {
    const raw = localStorage.getItem(PALETTE_WIDTH_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function savePaletteWidth(width: number): void {
  try {
    localStorage.setItem(PALETTE_WIDTH_KEY, String(Math.round(width)));
  } catch {
    // 시크릿 모드 등 저장이 막힌 경우. 이번 세션에서만 못 기억할 뿐이니 무시한다.
  }
}

/** 상태창을 펼쳐 둔 채로 닫았는지. */
export function loadUsagePanelOpen(fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(USAGE_PANEL_KEY);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

export function saveUsagePanelOpen(open: boolean): void {
  try {
    localStorage.setItem(USAGE_PANEL_KEY, open ? '1' : '0');
  } catch {
    // 위와 같다.
  }
}
