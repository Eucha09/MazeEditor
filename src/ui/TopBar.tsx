import { FilePlus, FolderOpen, Save } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';

interface TopBarProps {
  onNewMap: () => void;
}

export function TopBar({ onNewMap }: TopBarProps) {
  const name = useEditorStore((s) => s.doc.name);
  const dirty = useEditorStore((s) => s.dirty);
  const setDocName = useEditorStore((s) => s.setDocName);
  const save = useEditorStore((s) => s.save);
  const open = useEditorStore((s) => s.open);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-edge bg-panel-2 px-3">
      <span className="text-sm font-semibold tracking-tight">Maze Editor</span>

      <div className="flex min-w-0 items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setDocName(e.target.value)}
          spellCheck={false}
          aria-label="맵 이름"
          className="w-52 rounded-md border border-edge bg-panel px-2 py-1 text-sm outline-none focus:border-accent"
        />
        <span
          className={`h-1.5 w-1.5 rounded-full ${dirty ? 'bg-amber-400' : 'bg-transparent'}`}
          title={dirty ? '저장하지 않은 변경이 있습니다' : '저장됨'}
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <TextButton icon={FilePlus} label="새 맵" onClick={onNewMap} />
        <TextButton icon={FolderOpen} label="열기" hotkey="Ctrl+O" onClick={() => void open()} />
        <TextButton icon={Save} label="저장" hotkey="Ctrl+S" onClick={() => void save()} />
      </div>
    </header>
  );
}

interface TextButtonProps {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  hotkey?: string;
  onClick: () => void;
}

function TextButton({ icon: Icon, label, hotkey, onClick }: TextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hotkey ? `${label}  (${hotkey})` : label}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-dim transition-colors hover:bg-white/5 hover:text-ink"
    >
      <Icon size={15} strokeWidth={1.75} />
      {label}
    </button>
  );
}
