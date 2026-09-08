import { useEffect } from 'react';
import { BRUSH_SIZES, useEditorStore } from '@/store/editorStore';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/** 에디터 전역 단축키. 모달이 열려 있는 동안에는 enabled=false로 꺼 둔다. */
export function useHotkeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const s = useEditorStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) s.redo();
            else s.undo();
            return;
          case 'y':
            e.preventDefault();
            s.redo();
            return;
          case 's':
            e.preventDefault();
            void s.save(e.shiftKey);
            return;
          case 'o':
            e.preventDefault();
            void s.open();
            return;
          case '0':
            e.preventDefault();
            s.requestFit();
            return;
          default:
            return;
        }
      }

      if (e.altKey) return;

      switch (e.key) {
        case 'b':
        case 'B':
          s.setTool('brush');
          return;
        case 'e':
        case 'E':
          s.setTool('eraser');
          return;
        case '#':
          s.toggleGrid();
          return;
        case '[':
        case ']': {
          const i = BRUSH_SIZES.indexOf(s.brushSize as (typeof BRUSH_SIZES)[number]);
          const next = e.key === '[' ? i - 1 : i + 1;
          const size = BRUSH_SIZES[Math.min(BRUSH_SIZES.length - 1, Math.max(0, next))];
          s.setBrushSize(size);
          return;
        }
        default:
          break;
      }

      // 숫자 키는 팔레트에 보이는 순서대로 타일을 고른다.
      if (e.key >= '1' && e.key <= '9') {
        const tile = s.doc.tileset[Number(e.key) - 1];
        if (tile) s.setActiveTile(tile.id);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
