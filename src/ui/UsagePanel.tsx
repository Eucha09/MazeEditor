import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { brushColor, brushIndex, findBrushById } from '@/core/brush';
import { countBrushUsage } from '@/core/tools/usage';
import { loadUsagePanelOpen, saveUsagePanelOpen } from '@/io/uiPrefs';
import { UNKNOWN_BRUSH_COLOR } from '@/render/renderer';
import { useBrushStore } from '@/store/brushStore';
import { useEditorStore } from '@/store/editorStore';

/**
 * 상태창: 지금 맵에 칠해져 있는 브러쉬와 브러쉬별 칸 수.
 *
 * 캔버스 위에 겹쳐 두고 접을 수 있게 했다. 편집 중 계속 보고 싶은 정보지만
 * 늘 자리를 차지할 만큼은 아니라서, 접으면 제목 줄만 남는다. 접었는지 여부는
 * 팔레트 너비와 같은 취향 값이라 localStorage에만 남긴다.
 *
 * 칸 수는 접혀 있는 동안 세지 않는다. 맵 전체를 훑는 계산이고 가장 큰 맵은
 * 레이어당 26만 칸이라, 안 보이는 값을 편집할 때마다 다시 셀 이유가 없다.
 */
export function UsagePanel() {
  const [open, setOpen] = useState(() => loadUsagePanelOpen(true));
  const doc = useEditorStore((s) => s.doc);
  const docRev = useEditorStore((s) => s.docRev);
  const flashBrush = useEditorStore((s) => s.flashBrush);
  const flashingId = useEditorStore((s) => s.flash?.brushId ?? null);
  const brushes = useBrushStore((s) => s.brushes);

  const toggle = () =>
    setOpen((prev) => {
      saveUsagePanelOpen(!prev);
      return !prev;
    });

  // 격자는 제자리에서 바뀌어 doc 참조만으로는 갱신을 알 수 없으므로 docRev로 다시 센다
  // (rev가 아니다 — rev는 마우스를 움직이기만 해도 올라간다).
  const usage = useMemo(() => (open ? countBrushUsage(doc) : []), [doc, docRev, open]);
  const total = usage.reduce((sum, entry) => sum + entry.count, 0);
  const index = brushIndex(brushes);

  return (
    <div className="absolute bottom-2 left-2 z-10 w-56 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border border-edge bg-panel-2/95 text-xs shadow-lg">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-ink-dim transition-colors hover:text-ink"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="font-semibold">브러쉬 사용 현황</span>
        {open && (
          <span className="ml-auto font-mono text-[11px] text-ink-dim/80">
            {usage.length}종 · {total}칸
          </span>
        )}
      </button>

      {open &&
        (usage.length === 0 ? (
          <p className="border-t border-edge/70 px-2 py-2 text-ink-dim/70">아직 칠해진 칸이 없습니다.</p>
        ) : (
          <ul className="max-h-56 overflow-y-auto border-t border-edge/70 p-1">
            {usage.map(({ brushId, count }) => {
              // 팔레트에서 지운 브러쉬로 칠한 칸도 맵에는 남아 있다. 이름 대신 id를 보여 준다.
              const brush = findBrushById(index, brushId);
              return (
                <li key={brushId}>
                  <button
                    type="button"
                    onClick={() => flashBrush(brushId)}
                    title="클릭하면 이 브러쉬가 칠해진 칸이 잠깐 번쩍입니다"
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                      flashingId === brushId ? 'bg-accent/20 text-ink' : 'text-ink-dim hover:bg-white/5 hover:text-ink'
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-white/15"
                      style={{ background: brush ? brushColor(brush) : UNKNOWN_BRUSH_COLOR }}
                    />
                    <span className="min-w-0 flex-1 truncate">{brush?.name ?? `알 수 없음(#${brushId})`}</span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-dim/80">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
