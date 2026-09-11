import { create } from 'zustand';
import type { Brush, BrushDraft } from '@/core/brush';
import { defaultBrushes, newBrushId, normalizeDraft, reorderBrushes } from '@/core/brush';
import type { BrushId } from '@/core/types';
import { brushesToJson, loadBrushes, parseBrushesJson, saveBrushes } from '@/io/brushes';
import { openTextFile, saveTextAs } from '@/io/fileDialog';

interface BrushState {
  brushes: Brush[];
  activeBrushId: BrushId | null;

  setActiveBrush: (id: BrushId) => void;
  addBrush: (draft: BrushDraft) => Brush;
  updateBrush: (id: BrushId, draft: BrushDraft) => void;
  deleteBrush: (id: BrushId) => void;
  /**
   * 팔레트에서 브러쉬를 끌어다 놓아 순서를 바꾼다. beforeId 브러쉬 바로 앞에
   * 놓이며, null이면 targetGroup의 끝에 붙는다. 다른 그룹으로 옮기면 group도
   * 바뀐다. 바뀐 순서는 브러쉬 파일에 그대로 저장된다(배열 순서 = 정렬 값).
   */
  moveBrush: (draggedId: BrushId, targetGroup: string, beforeId: BrushId | null) => void;
  /** 성공/실패를 알릴 문구를 돌려준다. 알림 표시는 부르는 쪽(UI)이 한다. */
  exportBrushes: () => Promise<string | null>;
  importBrushes: () => Promise<string | null>;
  resetBrushes: () => string;
}

/** 활성 브러쉬가 사라졌을 때 고를 다음 브러쉬. */
function fallbackActive(brushes: Brush[], current: BrushId | null): BrushId | null {
  if (current && brushes.some((b) => b.id === current)) return current;
  return brushes[0]?.id ?? null;
}

const initial = loadBrushes();

export const useBrushStore = create<BrushState>()((set, get) => {
  function commit(brushes: Brush[]): void {
    saveBrushes(brushes);
    set({ brushes, activeBrushId: fallbackActive(brushes, get().activeBrushId) });
  }

  return {
    brushes: initial,
    activeBrushId: initial[0]?.id ?? null,

    setActiveBrush: (activeBrushId) => set({ activeBrushId }),

    addBrush: (draft) => {
      const brush: Brush = { id: newBrushId(get().brushes), ...normalizeDraft(draft) };
      commit([...get().brushes, brush]);
      set({ activeBrushId: brush.id });
      return brush;
    },

    updateBrush: (id, draft) => {
      commit(get().brushes.map((b) => (b.id === id ? { id, ...normalizeDraft(draft) } : b)));
    },

    deleteBrush: (id) => {
      const brushes = get().brushes.filter((b) => b.id !== id);
      saveBrushes(brushes);
      // 지운 것이 활성 브러쉬였다면 남아 있는 첫 브러쉬로 옮긴다.
      const active = get().activeBrushId === id ? (brushes[0]?.id ?? null) : get().activeBrushId;
      set({ brushes, activeBrushId: active });
    },

    moveBrush: (draggedId, targetGroup, beforeId) => {
      const next = reorderBrushes(get().brushes, draggedId, targetGroup, beforeId);
      // 참조가 그대로면 옮길 필요가 없었던 것이므로 저장도 건너뛴다.
      if (next !== get().brushes) commit(next);
    },

    exportBrushes: async () => {
      const text = brushesToJson(get().brushes);
      try {
        const result = await saveTextAs('brushes.json', text);
        if (!result) return null;
        return `브러쉬 내보냄 · ${result.fileName}`;
      } catch (err) {
        return `브러쉬 내보내기 실패: ${err instanceof Error ? err.message : String(err)}`;
      }
    },

    importBrushes: async () => {
      const result = await openTextFile();
      if (!result) return null;
      try {
        const brushes = parseBrushesJson(result.text);
        if (brushes.length === 0) return '가져온 파일에 브러쉬가 없습니다.';
        saveBrushes(brushes);
        set({ brushes, activeBrushId: brushes[0].id });
        return `브러쉬 ${brushes.length}개 가져옴 · ${result.fileName}`;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },

    resetBrushes: () => {
      const brushes = defaultBrushes();
      saveBrushes(brushes);
      set({ brushes, activeBrushId: brushes[0]?.id ?? null });
      return '브러쉬를 기본 세트로 되돌렸습니다.';
    },
  };
});

/** 지금 선택된 브러쉬. 없으면 null. */
export function activeBrush(): Brush | null {
  const { brushes, activeBrushId } = useBrushStore.getState();
  return brushes.find((b) => b.id === activeBrushId) ?? null;
}
