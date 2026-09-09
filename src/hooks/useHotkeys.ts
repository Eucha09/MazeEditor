import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useBrushStore } from '@/store/brushStore';

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
        case 'g':
        case 'G':
          s.setTool('fill');
          return;
        case '#':
          s.toggleGrid();
          return;
        case 'm':
        case 'M':
          s.generateMaze();
          return;
        case 'Escape':
          if (s.mazePreview) s.exitMazePreview();
          return;
        default:
          break;
      }

      // 숫자 키는 팔레트에 보이는 순서대로 브러쉬를 고른다.
      if (e.key >= '1' && e.key <= '9') {
        const brushStore = useBrushStore.getState();
        const brush = brushStore.brushes[Number(e.key) - 1];
        if (brush) {
          brushStore.setActiveBrush(brush.id);
          s.setTool('brush');
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
