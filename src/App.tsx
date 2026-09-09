import { useEffect, useState } from 'react';
import type { Brush } from '@/core/brush';
import { CanvasView } from '@/render/CanvasView';
import { useEditorStore } from '@/store/editorStore';
import { useHotkeys } from '@/hooks/useHotkeys';
import { loadPaletteWidth, savePaletteWidth } from '@/io/uiPrefs';
import { BrushDialog } from '@/ui/BrushDialog';
import { NewMapDialog } from '@/ui/NewMapDialog';
import { Palette } from '@/ui/Palette';
import { ResizeDialog } from '@/ui/ResizeDialog';
import { ResizeHandle } from '@/ui/ResizeHandle';
import { StatusBar } from '@/ui/StatusBar';
import { Toolbar } from '@/ui/Toolbar';
import { TopBar } from '@/ui/TopBar';

const PALETTE_DEFAULT_WIDTH = 224;
const PALETTE_MIN_WIDTH = 200;
const PALETTE_MAX_WIDTH = 480;

export default function App() {
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [brushDialog, setBrushDialog] = useState<{ open: boolean; brush: Brush | null }>({
    open: false,
    brush: null,
  });
  const [paletteWidth, setPaletteWidth] = useState(() => loadPaletteWidth(PALETTE_DEFAULT_WIDTH));
  const dirty = useEditorStore((s) => s.dirty);

  // 핸들은 왼쪽에 있으므로 오른쪽(팔레트 쪽)으로 끌면 폭이 줄고, 왼쪽(캔버스 쪽)으로
  // 끌면 늘어난다 — 그래서 델타를 뺀다.
  const resizePalette = (deltaX: number) => {
    setPaletteWidth((w) => {
      const next = Math.min(PALETTE_MAX_WIDTH, Math.max(PALETTE_MIN_WIDTH, w - deltaX));
      savePaletteWidth(next);
      return next;
    });
  };

  // 대화상자가 떠 있는 동안에는 전역 단축키를 꺼 둔다.
  useHotkeys(!newMapOpen && !resizeOpen && !brushDialog.open);

  // 저장하지 않은 편집이 있으면 탭을 닫기 전에 확인한다.
  // (자동 저장이 있긴 하지만 브라우저를 바꾸면 복구되지 않는다)
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <div className="flex h-full flex-col">
      <TopBar onNewMap={() => setNewMapOpen(true)} onResize={() => setResizeOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <main className="min-w-0 flex-1">
          <CanvasView />
        </main>
        <ResizeHandle label="브러쉬 패널 너비 조절" onDrag={resizePalette} />
        <Palette
          width={paletteWidth}
          onAddBrush={() => setBrushDialog({ open: true, brush: null })}
          onEditBrush={(brush) => setBrushDialog({ open: true, brush })}
        />
      </div>

      <StatusBar />
      <NewMapDialog open={newMapOpen} onClose={() => setNewMapOpen(false)} />
      <ResizeDialog open={resizeOpen} onClose={() => setResizeOpen(false)} />
      <BrushDialog
        open={brushDialog.open}
        brush={brushDialog.brush}
        onClose={() => setBrushDialog({ open: false, brush: null })}
      />
    </div>
  );
}
