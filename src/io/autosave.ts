import type { MapDoc } from '@/core/types';
import { parseJson, toJson } from '@/core/io/serialize';

const KEY = 'maze-editor:autosave:v1';
const DEBOUNCE_MS = 600;

let timer: number | undefined;

/** 편집 중 계속 호출해도 안전하다. 마지막 호출 기준 DEBOUNCE_MS 뒤 한 번만 저장한다. */
export function scheduleAutosave(doc: MapDoc): void {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    try {
      localStorage.setItem(KEY, toJson(doc));
    } catch {
      // 용량 초과 등. 자동 저장 실패로 편집을 막을 이유는 없다.
    }
  }, DEBOUNCE_MS);
}

export function loadAutosave(): MapDoc | null {
  const text = localStorage.getItem(KEY);
  if (!text) return null;
  try {
    return parseJson(text);
  } catch {
    // 포맷이 바뀌었거나 깨진 데이터. 조용히 버리고 새 맵으로 시작한다.
    localStorage.removeItem(KEY);
    return null;
  }
}

export function clearAutosave(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
  localStorage.removeItem(KEY);
}
