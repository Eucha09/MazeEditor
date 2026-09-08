import { Brush, Eraser, Grid3x3, Maximize2, Redo2, Undo2 } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { IconButton } from './IconButton';

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const showGrid = useEditorStore((s) => s.showGrid);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const setTool = useEditorStore((s) => s.setTool);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const requestFit = useEditorStore((s) => s.requestFit);

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-edge bg-panel-2 py-2" aria-label="도구">
      <IconButton icon={Brush} label="브러쉬" hotkey="B" active={tool === 'brush'} onClick={() => setTool('brush')} />
      <IconButton icon={Eraser} label="지우개" hotkey="E" active={tool === 'eraser'} onClick={() => setTool('eraser')} />

      <hr className="my-1 w-6 border-edge" />

      <IconButton icon={Undo2} label="실행 취소" hotkey="Ctrl+Z" disabled={!canUndo} onClick={undo} />
      <IconButton icon={Redo2} label="다시 실행" hotkey="Ctrl+Shift+Z" disabled={!canRedo} onClick={redo} />

      <hr className="my-1 w-6 border-edge" />

      <IconButton icon={Grid3x3} label="격자 표시" hotkey="#" active={showGrid} onClick={toggleGrid} />
      <IconButton icon={Maximize2} label="화면 맞춤" hotkey="Ctrl+0" onClick={requestFit} />
    </nav>
  );
}
