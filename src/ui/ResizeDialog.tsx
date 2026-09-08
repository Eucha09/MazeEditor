import { useEffect, useState } from 'react';
import type { Anchor, AnchorX, AnchorY } from '@/core/tilemap';
import { DEFAULT_ANCHOR, normalizeMapSize } from '@/core/tilemap';
import { useEditorStore } from '@/store/editorStore';
import { Modal } from './Modal';
import { SizeField } from './SizeField';

const XS: AnchorX[] = ['left', 'center', 'right'];
const YS: AnchorY[] = ['top', 'middle', 'bottom'];

const X_LABEL: Record<AnchorX, string> = { left: '왼쪽', center: '가운데', right: '오른쪽' };
const Y_LABEL: Record<AnchorY, string> = { top: '위', middle: '가운데', bottom: '아래' };

interface ResizeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ResizeDialog({ open, onClose }: ResizeDialogProps) {
  const doc = useEditorStore((s) => s.doc);
  const resize = useEditorStore((s) => s.resize);

  const [width, setWidth] = useState(String(doc.width));
  const [height, setHeight] = useState(String(doc.height));
  const [anchor, setAnchor] = useState<Anchor>(DEFAULT_ANCHOR);
  const [borderWalls, setBorderWalls] = useState(true);

  // 열 때마다 현재 맵 크기에서 시작한다.
  useEffect(() => {
    if (!open) return;
    setWidth(String(doc.width));
    setHeight(String(doc.height));
  }, [open, doc.width, doc.height]);

  const w = normalizeMapSize(Number(width));
  const h = normalizeMapSize(Number(height));
  const shrinks = w < doc.width || h < doc.height;
  const unchanged = w === doc.width && h === doc.height;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    resize(w, h, anchor, borderWalls);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="맵 크기 조정">
      <form onSubmit={submit}>
        <p className="mb-3 text-[11px] text-ink-dim">
          현재 {doc.width} × {doc.height} · 그려 둔 내용은 유지됩니다.
        </p>

        <div className="mb-1 grid grid-cols-2 gap-2">
          <SizeField label="가로" value={width} onChange={setWidth} />
          <SizeField label="세로" value={height} onChange={setHeight} />
        </div>

        <div className="mb-3">
          <span className="mb-1.5 block text-xs text-ink-dim">기준점</span>
          <div className="flex items-start gap-3">
            <div className="grid w-fit grid-cols-3 gap-0.5 rounded-md border border-edge p-1">
              {YS.map((y) =>
                XS.map((x) => {
                  const selected = anchor.x === x && anchor.y === y;
                  return (
                    <button
                      key={`${x}-${y}`}
                      type="button"
                      onClick={() => setAnchor({ x, y })}
                      aria-pressed={selected}
                      aria-label={`${Y_LABEL[y]} ${X_LABEL[x]}`}
                      title={`${Y_LABEL[y]} ${X_LABEL[x]}`}
                      className={`h-5 w-5 rounded-sm transition-colors ${
                        selected ? 'bg-accent' : 'bg-white/8 hover:bg-white/20'
                      }`}
                    />
                  );
                }),
              )}
            </div>
            <p className="flex-1 text-[11px] leading-relaxed text-ink-dim/80">
              기존 내용을 새 맵의 어디에 붙일지 고릅니다. 가운데를 고르면 가로·세로가
              모두 홀수라 정확히 중앙에 놓입니다.
            </p>
          </div>
        </div>

        <label className="mb-3 flex items-center gap-2 text-xs text-ink-dim">
          <input
            type="checkbox"
            checked={borderWalls}
            onChange={(e) => setBorderWalls(e.target.checked)}
            className="accent-accent"
          />
          바깥 테두리를 벽으로 다시 채우기
        </label>

        {shrinks && (
          <p className="mb-3 rounded-md bg-amber-400/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-300/90">
            맵이 줄어들어 바깥쪽 내용이 잘립니다. <kbd className="font-mono">Ctrl+Z</kbd> 로 되돌릴 수 있습니다.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-ink-dim transition-colors hover:bg-white/5 hover:text-ink"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={unchanged && !borderWalls}
            className="rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/30 disabled:opacity-40 disabled:hover:bg-accent/20"
          >
            적용 ({w}×{h})
          </button>
        </div>
      </form>
    </Modal>
  );
}
