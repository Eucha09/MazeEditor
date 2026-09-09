import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, Pencil, Plus, Upload } from 'lucide-react';
import type { Brush } from '@/core/brush';
import { brushColor } from '@/core/brush';
import { useBrushStore } from '@/store/brushStore';
import { useEditorStore } from '@/store/editorStore';

interface PaletteProps {
  width: number;
  onAddBrush: () => void;
  onEditBrush: (brush: Brush) => void;
}

export function Palette({ width, onAddBrush, onEditBrush }: PaletteProps) {
  const brushes = useBrushStore((s) => s.brushes);
  const activeBrushId = useBrushStore((s) => s.activeBrushId);
  const setActiveBrush = useBrushStore((s) => s.setActiveBrush);
  const exportBrushes = useBrushStore((s) => s.exportBrushes);
  const importBrushes = useBrushStore((s) => s.importBrushes);
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const setNotice = useEditorStore((s) => s.setNotice);

  // 접힌 그룹 이름의 집합. 새 테마가 추가되면 그룹도 자동으로 늘어난다.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (group: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  // 팔레트에 보이는 순서가 곧 숫자 단축키 순서다.
  const hotkeyOf = (brush: Brush) => {
    const i = brushes.indexOf(brush);
    return i >= 0 && i < 9 ? String(i + 1) : undefined;
  };

  const select = (brush: Brush) => {
    setActiveBrush(brush.id);
    // 채우기 도구를 골라 둔 채로 브러쉬만 바꾸려는 경우가 있으므로, 채우기 중에는
    // 도구를 브러쉬로 되돌리지 않는다. 지우개는 활성 브러쉬와 무관하게 동작하므로
    // 브러쉬를 고르면 곧바로 칠하려는 의도로 보고 브러쉬 도구로 바꾼다.
    if (tool !== 'fill') setTool('brush');
  };

  const runTransfer = async (action: () => Promise<string | null>) => {
    const message = await action();
    if (message) setNotice(message);
  };

  // brushes에 등장하는 순서대로 그룹을 묶는다.
  const groups: string[] = [];
  for (const b of brushes) if (!groups.includes(b.group)) groups.push(b.group);

  return (
    <aside
      style={{ width }}
      className="flex shrink-0 flex-col gap-4 overflow-y-auto border-l border-edge bg-panel-2 p-3"
      aria-label="브러쉬 팔레트"
    >
      {groups.map((group) => {
        const open = !collapsed.has(group);
        return (
          <section key={group}>
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              aria-expanded={open}
              className="mb-1.5 flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink-dim hover:text-ink"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {group}
            </button>
            {open && (
              <ul className="flex flex-col gap-0.5">
                {brushes
                  .filter((b) => b.group === group)
                  .map((brush) => {
                    const selected = tool !== 'eraser' && brush.id === activeBrushId;
                    return (
                      <li key={brush.id} className="group/row flex items-center">
                        <button
                          type="button"
                          onClick={() => select(brush)}
                          aria-pressed={selected}
                          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            selected ? 'bg-accent/20 text-ink' : 'text-ink-dim hover:bg-white/5 hover:text-ink'
                          }`}
                        >
                          <span
                            className="h-4 w-4 shrink-0 rounded-sm ring-1 ring-white/15"
                            style={{ background: brushColor(brush) }}
                          />
                          <span className="min-w-0 flex-1 truncate">{brush.name}</span>
                          <Badges brush={brush} />
                          <kbd className="font-mono text-[11px] text-ink-dim/70">{hotkeyOf(brush)}</kbd>
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditBrush(brush)}
                          title={`${brush.name} 수정`}
                          aria-label={`${brush.name} 수정`}
                          className="ml-0.5 grid h-7 w-6 shrink-0 place-items-center rounded text-ink-dim/0 transition-colors group-hover/row:text-ink-dim hover:bg-white/5 hover:!text-ink"
                        >
                          <Pencil size={13} />
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        );
      })}

      <section>
        <button
          type="button"
          onClick={onAddBrush}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-edge py-1.5 text-sm text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          <Plus size={14} /> 브러쉬 추가
        </button>
        <div className="mt-1.5 flex gap-1">
          <SmallButton icon={Download} label="내보내기" onClick={() => void runTransfer(exportBrushes)} />
          <SmallButton icon={Upload} label="가져오기" onClick={() => void runTransfer(importBrushes)} />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-dim/70">
          브러쉬는 맵 파일과 따로 보관됩니다. 맵에는 지형 타입과 오브젝트 ID만 저장됩니다.
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
          <span className="text-accent">·</span> 점이 찍힌 칸은 중앙 기준 2칸 간격의 floor 칸입니다.
          항상 지나갈 수 있어야 하므로 벽 같은 통행 불가 브러쉬를 놓을 수 없습니다.
        </p>
      </section>
    </aside>
  );
}

function Badges({ brush }: { brush: Brush }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {brush.size > 1 && <Badge text={`${brush.size}×${brush.size}`} title="브러쉬 크기" />}
      {brush.blob && <Badge text="덩어리" title="하나의 덩어리로 인식합니다" />}
      {brush.unique && <Badge text="1개" title="맵에 하나만 놓을 수 있습니다" />}
      {brush.fillable && <Badge text="채우기" title="채우기 도구를 쓸 수 있습니다" />}
      {brush.entityType && (
        <Badge
          text={brush.entityType === 'seed' ? 'Seed' : 'Monster'}
          title={
            brush.entityType === 'seed'
              ? '미로 생성 알고리즘에 쓰일 Seed 위치입니다'
              : '몬스터 스폰입니다'
          }
        />
      )}
    </span>
  );
}

function Badge({ text, title }: { text: string; title: string }) {
  return (
    <span className="rounded bg-white/10 px-1 text-[10px] text-ink-dim" title={title}>
      {text}
    </span>
  );
}

function SmallButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] text-ink-dim transition-colors hover:bg-white/5 hover:text-ink"
    >
      <Icon size={12} /> {label}
    </button>
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
