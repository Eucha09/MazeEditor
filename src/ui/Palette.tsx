import type { LayerKey, TileDef } from '@/core/types';
import { BRUSH_SIZES, useEditorStore } from '@/store/editorStore';

const LAYER_TITLE: Record<LayerKey, string> = {
  terrain: '지형',
  entity: '엔티티',
};

export function Palette() {
  const tileset = useEditorStore((s) => s.doc.tileset);
  const activeTileId = useEditorStore((s) => s.activeTileId);
  const tool = useEditorStore((s) => s.tool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setActiveTile = useEditorStore((s) => s.setActiveTile);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);

  // 팔레트에 보이는 순서가 곧 숫자 단축키 순서다.
  const hotkeyOf = (tile: TileDef) => {
    const i = tileset.indexOf(tile);
    return i >= 0 && i < 9 ? String(i + 1) : undefined;
  };

  const groups: LayerKey[] = ['terrain', 'entity'];

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-l border-edge bg-panel-2 p-3" aria-label="타일 팔레트">
      {groups.map((layer) => (
        <section key={layer}>
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
            {LAYER_TITLE[layer]}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {tileset
              .filter((t) => t.layer === layer)
              .map((tile) => {
                const selected = tool === 'brush' && tile.id === activeTileId;
                return (
                  <li key={tile.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTile(tile.id)}
                      aria-pressed={selected}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        selected ? 'bg-accent/20 text-ink' : 'text-ink-dim hover:bg-white/5 hover:text-ink'
                      }`}
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded-sm ring-1 ring-white/15"
                        style={{ background: tile.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{tile.name}</span>
                      {tile.unique && (
                        <span className="rounded bg-white/10 px-1 text-[10px] text-ink-dim" title="맵에 하나만 놓을 수 있습니다">
                          1개
                        </span>
                      )}
                      <kbd className="font-mono text-[11px] text-ink-dim/70">{hotkeyOf(tile)}</kbd>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <section>
        <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          브러쉬 크기
        </h2>
        <div className="flex gap-1">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setBrushSize(size)}
              aria-pressed={brushSize === size}
              className={`h-8 flex-1 rounded-md text-sm transition-colors ${
                brushSize === size ? 'bg-accent/20 text-accent' : 'text-ink-dim hover:bg-white/5 hover:text-ink'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-dim/70">
          <kbd className="font-mono">[</kbd> <kbd className="font-mono">]</kbd> 로도 조절합니다.
          시작·목표는 크기와 무관하게 한 칸만 놓입니다.
        </p>
      </section>

      <section className="mt-auto border-t border-edge pt-3">
        <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">조작</h2>
        <dl className="space-y-1 text-[11px] text-ink-dim/80">
          <Row k="드래그" v="연속으로 칠하기" />
          <Row k="우클릭" v="지우개" />
          <Row k="Space + 드래그" v="화면 이동" />
          <Row k="휠" v="확대 / 축소" />
        </dl>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-dim/70">
          <span className="text-accent">·</span> 점이 찍힌 칸은 중앙 기준 2칸 간격의 보호 격자입니다.
          항상 지나갈 수 있어야 하므로 벽 같은 통행 불가 타일을 놓을 수 없습니다.
        </p>
      </section>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="font-mono">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
