import { useEffect } from 'react';
import { tilesetIndex } from '@/core/tileset';
import { useEditorStore } from '@/store/editorStore';

const NOTICE_MS = 5000;

export function StatusBar() {
  const doc = useEditorStore((s) => s.doc);
  const hover = useEditorStore((s) => s.hover);
  const scale = useEditorStore((s) => s.camera.scale);
  const tool = useEditorStore((s) => s.tool);
  const activeTileId = useEditorStore((s) => s.activeTileId);
  const notice = useEditorStore((s) => s.notice);
  const setNotice = useEditorStore((s) => s.setNotice);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice, setNotice]);

  const inside = hover && hover.x >= 0 && hover.y >= 0 && hover.x < doc.width && hover.y < doc.height;
  const activeTile = tilesetIndex(doc.tileset).get(activeTileId);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-edge bg-panel-2 px-3 text-xs text-ink-dim">
      <span className="w-24 font-mono">{inside ? `${hover.x}, ${hover.y}` : '— , —'}</span>
      <span className="font-mono">
        {doc.width} × {doc.height}
      </span>
      <span className="font-mono">{scale.toFixed(1)} px/셀</span>
      <span>{tool === 'eraser' ? '지우개' : `브러쉬 · ${activeTile?.name ?? '?'}`}</span>

      {notice && <span className="ml-auto truncate text-ink">{notice}</span>}
    </footer>
  );
}
