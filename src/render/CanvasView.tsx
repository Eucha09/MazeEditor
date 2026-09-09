import { useCallback, useEffect, useRef } from 'react';
import type { CellPos } from '@/core/types';
import { computeFit, useEditorStore } from '@/store/editorStore';
import { useBrushStore } from '@/store/brushStore';
import { screenToCell } from './camera';
import { renderMap } from './renderer';

type DragMode = 'idle' | 'paint' | 'pan';

/**
 * 격자 캔버스.
 *
 * 캔버스는 React의 렌더 사이클을 타지 않는다. 스토어를 직접 구독해 "다시 그려야 함"
 * 플래그만 세우고, requestAnimationFrame 루프에서 프레임당 최대 한 번 그린다.
 * 드래그 중 포인터 이벤트가 초당 수백 번 들어와도 그리기 비용은 60fps로 고정된다.
 */
export function CanvasView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 배너는 자주 바뀌지 않으므로 캔버스처럼 직접 그리지 않고 평범한 React 구독으로 둔다.
  const previewing = useEditorStore((s) => s.mazePreview !== null);
  const generateMaze = useEditorStore((s) => s.generateMaze);
  const exitMazePreview = useEditorStore((s) => s.exitMazePreview);

  const needsDraw = useRef(true);
  const size = useRef({ w: 0, h: 0 });
  const mode = useRef<DragMode>('idle');
  const lastCell = useRef<CellPos | null>(null);
  const lastPan = useRef({ x: 0, y: 0 });
  const spaceHeld = useRef(false);
  const pendingFit = useRef(true);

  const fitRequest = useEditorStore((s) => s.fitRequest);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h } = size.current;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const s = useEditorStore.getState();
    const { brushes, activeBrushId } = useBrushStore.getState();
    const brush = brushes.find((b) => b.id === activeBrushId);
    renderMap(ctx, w, h, {
      doc: s.doc,
      camera: s.camera,
      showGrid: s.showGrid,
      // 미리보기 중에는 칠할 수 없으므로 브러쉬 커서를 보여 주지 않는다.
      hover: s.mazePreview ? null : s.hover,
      tool: s.tool,
      brushes,
      // 채우기는 실제로 바뀔 영역이 클릭 전까지 알 수 없으므로(맵 전체일 수도 있다)
      // 미리보기를 계산하지 않고 클릭할 한 칸만 보여 준다.
      cursorSize: s.tool === 'fill' ? 1 : (brush?.size ?? 1),
      activeAllowedKinds:
        s.tool === 'brush'
          ? (brush?.allowedCellKinds ?? null)
          : // 채우기를 지원하지 않는 브러쉬라면 빈 배열을 줘서 클릭하기 전에도 막힌 칸처럼 보이게 한다.
            s.tool === 'fill' && brush && !brush.fillable
            ? []
            : null,
      mazePreview: s.mazePreview,
    });
  }, []);

  const tryFit = useCallback(() => {
    if (!pendingFit.current) return;
    const { w, h } = size.current;
    if (w === 0 || h === 0) return;
    pendingFit.current = false;
    const s = useEditorStore.getState();
    s.setCamera(computeFit(s.doc, w, h));
  }, []);

  // 컨테이너 크기 추적 + 고해상도 디스플레이 대응
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      if (w === size.current.w && h === size.current.h) return;
      size.current = { w, h };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      needsDraw.current = true;
      tryFit();
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [tryFit]);

  // 스토어가 바뀌면 다음 프레임에 다시 그린다. 브러쉬 색·크기도 화면에 반영된다.
  useEffect(() => {
    const markDirty = () => {
      needsDraw.current = true;
    };
    const unsubs = [useEditorStore.subscribe(markDirty), useBrushStore.subscribe(markDirty)];
    return () => unsubs.forEach((off) => off());
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (needsDraw.current) {
        needsDraw.current = false;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  useEffect(() => {
    pendingFit.current = true;
    tryFit();
  }, [fitRequest, tryFit]);

  // 스페이스를 누르고 있는 동안은 팬 모드
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      spaceHeld.current = true;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceHeld.current = false;
      if (canvasRef.current && mode.current === 'idle') canvasRef.current.style.cursor = '';
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // React의 onWheel은 passive로 붙어 preventDefault가 통하지 않는다. 직접 등록한다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      // deltaMode 0(픽셀) / 1(줄) 차이를 흡수해 트랙패드와 휠 감도를 맞춘다.
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      useEditorStore
        .getState()
        .zoomAtPoint(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-delta * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const cellAt = (e: React.PointerEvent<HTMLCanvasElement>): CellPos => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { camera } = useEditorStore.getState();
    return screenToCell(camera, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const store = useEditorStore.getState();
    e.currentTarget.setPointerCapture(e.pointerId);

    if (e.button === 1 || spaceHeld.current) {
      mode.current = 'pan';
      lastPan.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0 && e.button !== 2) return;
    // 미리보기 중에는 실제 문서를 칠할 수 없다. 미리보기를 끄고 다시 그려야 한다.
    if (store.mazePreview !== null) return;

    mode.current = 'paint';
    const cell = cellAt(e);
    lastCell.current = cell;
    store.beginStroke(e.button === 2 ? 'eraser' : undefined);
    store.paintAt(cell.x, cell.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const store = useEditorStore.getState();

    if (mode.current === 'pan') {
      store.panBy(e.clientX - lastPan.current.x, e.clientY - lastPan.current.y);
      lastPan.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const cell = cellAt(e);
    store.setHover(cell);

    if (mode.current !== 'paint') return;
    const prev = lastCell.current;
    // 빠르게 드래그하면 셀을 건너뛰므로 이전 셀과 직선으로 이어 칠한다.
    if (prev && (prev.x !== cell.x || prev.y !== cell.y)) {
      store.paintLine(prev, cell);
    }
    lastCell.current = cell;
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (mode.current === 'paint') useEditorStore.getState().endStroke();
    mode.current = 'idle';
    lastCell.current = null;
    e.currentTarget.style.cursor = spaceHeld.current ? 'grab' : '';
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`block touch-none select-none ${previewing ? 'cursor-default' : 'cursor-crosshair'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => useEditorStore.getState().setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      />
      {previewing && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-teal-400/40 bg-panel-2/95 px-3 py-1.5 text-xs shadow-lg">
            <span className="text-teal-300">미로 생성 미리보기 · 저장되지 않습니다</span>
            <button
              type="button"
              onClick={generateMaze}
              className="rounded-full bg-white/10 px-2 py-0.5 text-ink-dim transition-colors hover:bg-white/20 hover:text-ink"
            >
              다시 생성
            </button>
            <button
              type="button"
              onClick={exitMazePreview}
              className="rounded-full bg-white/10 px-2 py-0.5 text-ink-dim transition-colors hover:bg-white/20 hover:text-ink"
            >
              종료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
