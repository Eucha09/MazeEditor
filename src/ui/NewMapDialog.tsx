import { useEffect, useRef, useState } from 'react';
import { MAX_MAP_SIZE, MIN_MAP_SIZE, clampMapSize } from '@/core/tilemap';
import { DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH, useEditorStore } from '@/store/editorStore';

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
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) firstFieldRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const w = clampMapSize(Number(width));
  const h = clampMapSize(Number(height));
  const evenSize = w % 2 === 0 || h % 2 === 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    newDoc(w, h, name.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="w-80 rounded-lg border border-edge bg-panel-2 p-4 shadow-2xl"
        aria-label="새 맵 만들기"
      >
        <h2 className="mb-3 text-sm font-semibold">새 맵</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-ink-dim">이름</span>
          <input
            ref={firstFieldRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            className="w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <NumberField label="가로" value={width} onChange={setWidth} />
          <NumberField label="세로" value={height} onChange={setHeight} />
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
          바깥 테두리는 벽으로 채워집니다.
          {evenSize && (
            <>
              {' '}
              <span className="text-amber-400/90">
                자동 미로 생성은 홀수 크기에서 결과가 깔끔합니다.
              </span>
            </>
          )}
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
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-dim">{label}</span>
      <input
        type="number"
        min={MIN_MAP_SIZE}
        max={MAX_MAP_SIZE}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
