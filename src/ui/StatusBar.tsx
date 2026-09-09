import { useEffect } from 'react';
import { TERRAIN_TYPE_NAME } from '@/core/types';
import { getBrushId, getObjectId, getTerrainType } from '@/core/tilemap';
import { brushIndex, findBrushById } from '@/core/brush';
import { useBrushStore } from '@/store/brushStore';
import { useEditorStore } from '@/store/editorStore';

const NOTICE_MS = 5000;

export function StatusBar() {
  const doc = useEditorStore((s) => s.doc);
  const hover = useEditorStore((s) => s.hover);
  const scale = useEditorStore((s) => s.camera.scale);
  const tool = useEditorStore((s) => s.tool);
  const rev = useEditorStore((s) => s.rev);
  const notice = useEditorStore((s) => s.notice);
  const setNotice = useEditorStore((s) => s.setNotice);
  const brushes = useBrushStore((s) => s.brushes);
  const activeBrushId = useBrushStore((s) => s.activeBrushId);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice, setNotice]);

  const inside = hover && hover.x >= 0 && hover.y >= 0 && hover.x < doc.width && hover.y < doc.height;
  const activeBrush = brushes.find((b) => b.id === activeBrushId);

  // rev는 셀 값이 제자리에서 바뀌어도 아래 조회가 갱신되도록 구독해 둔 것이다.
  void rev;
  const terrainType = inside ? getTerrainType(doc, hover.x, hover.y) : null;
  const terrainObject = inside ? getObjectId(doc, 'terrain', hover.x, hover.y) : 0;
  const entityObject = inside ? getObjectId(doc, 'entity', hover.x, hover.y) : 0;

  const index = brushIndex(brushes);
  const terrainBrushId = inside ? getBrushId(doc, 'terrain', hover.x, hover.y) : 0;
  const entityBrushId = inside ? getBrushId(doc, 'entity', hover.x, hover.y) : 0;
  // id는 있는데 정의를 못 찾으면(브러쉬를 지운 뒤) "알 수 없음"으로 표시한다.
  const brushLabel = (id: number): string | null => {
    if (id === 0) return null;
    return findBrushById(index, id)?.name ?? `알 수 없음(#${id})`;
  };
  const terrainBrushLabel = brushLabel(terrainBrushId);
  const entityBrushLabel = brushLabel(entityBrushId);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-edge bg-panel-2 px-3 text-xs text-ink-dim">
      <span className="w-24 font-mono">{inside ? `${hover.x}, ${hover.y}` : '— , —'}</span>
      <span className="font-mono">
        {doc.width} × {doc.height}
      </span>
      <span className="font-mono">{scale.toFixed(1)} px/셀</span>
      <span>
        {tool === 'eraser'
          ? '지우개'
          : tool === 'fill'
            ? `채우기 · ${activeBrush?.name ?? '없음'}`
            : `브러쉬 · ${activeBrush?.name ?? '없음'}`}
      </span>
      {terrainType !== null && (
        <span className="font-mono" title="이 칸의 지형 타입 · 브러쉬 · 오브젝트 ID">
          {TERRAIN_TYPE_NAME[terrainType].split(' ')[0]}
          {terrainBrushLabel && ` · ${terrainBrushLabel}`}
          {terrainObject !== 0 && ` · obj ${terrainObject}`}
          {entityBrushLabel && ` · ${entityBrushLabel}`}
          {entityObject !== 0 && ` · ent ${entityObject}`}
        </span>
      )}

      {notice && <span className="ml-auto truncate text-ink">{notice}</span>}
    </footer>
  );
}
