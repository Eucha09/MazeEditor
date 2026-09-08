import { useEffect, useRef, useState } from 'react';
import { normalizeMapSize } from '@/core/tilemap';
import { DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH, useEditorStore } from '@/store/editorStore';
import { Modal } from './Modal';
import { SizeField } from './SizeField';

// 미로 크기는 홀수여야 하므로 프리셋도 모두 홀수로 둔다.
const PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: '작게', w: 21, h: 15 },
  { label: '기본', w: DEFAULT_MAP_WIDTH, h: DEFAULT_MAP_HEIGHT },
  { label: '크게', w: 51, h: 39 },
];

interface NewMapDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewMapDialog({ open, onClose }: NewMapDialogProps) {
  const newDoc = useEditorStore((s) => s.newDoc);
  const dirty = useEditorStore((s) => s.dirty);

  const [width, setWidth] = useState(String(DEFAULT_MAP_WIDTH));
  const [height, setHeight] = useState(String(DEFAULT_MAP_HEIGHT));
  const [name, setName] = useState('level-01');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  const w = normalizeMapSize(Number(width));
  const h = normalizeMapSize(Number(height));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    newDoc(w, h, name.trim());
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="새 맵">
      <form onSubmit={submit}>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-ink-dim">이름</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            className="w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <div className="mb-1 grid grid-cols-2 gap-2">
          <SizeField label="가로" value={width} onChange={setWidth} />
          <SizeField label="세로" value={height} onChange={setHeight} />
        </div>

        <div className="mb-3 flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setWidth(String(p.w));
                setHeight(String(p.h));
              }}
              className="flex-1 rounded-md border border-edge px-2 py-1 text-xs text-ink-dim transition-colors hover:border-accent hover:text-ink"
            >
              {p.label} {p.w}×{p.h}
            </button>
          ))}
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-ink-dim/80">
          바깥 테두리는 벽으로 채워집니다. 가로·세로는 홀수만 쓸 수 있습니다 &mdash; 셀 기반
          미로에서는 벽도 한 칸을 차지해서 2n+1 이라야 통로와 벽이 딱 떨어집니다.
        </p>

        {dirty && (
          <p className="mb-3 rounded-md bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-300/90">
            저장하지 않은 변경이 있습니다. 새 맵을 만들면 사라집니다.
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
            className="rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/30"
          >
            만들기 ({w}×{h})
          </button>
        </div>
      </form>
    </Modal>
  );
}
