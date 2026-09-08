import { useEffect, useState } from 'react';
import { CanvasView } from '@/render/CanvasView';
import { useEditorStore } from '@/store/editorStore';
import { useHotkeys } from '@/hooks/useHotkeys';
import { NewMapDialog } from '@/ui/NewMapDialog';
import { Palette } from '@/ui/Palette';
import { ResizeDialog } from '@/ui/ResizeDialog';
import { StatusBar } from '@/ui/StatusBar';
import { Toolbar } from '@/ui/Toolbar';
import { TopBar } from '@/ui/TopBar';

export default function App() {
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const dirty = useEditorStore((s) => s.dirty);

  // 대화상자가 떠 있는 동안에는 전역 단축키를 꺼 둔다.
  useHotkeys(!newMapOpen && !resizeOpen);

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
        <Palette />
      </div>

      <StatusBar />
      <NewMapDialog open={newMapOpen} onClose={() => setNewMapOpen(false)} />
      <ResizeDialog open={resizeOpen} onClose={() => setResizeOpen(false)} />
    </div>
  );
}
