import { useEffect, useRef, useState } from 'react';
import { Crosshair, RefreshCw, X } from 'lucide-react';
import type { MapDoc } from '@/core/types';
import { useBrushStore } from '@/store/brushStore';
import { useEditorStore } from '@/store/editorStore';
import { createPreview3D, type Preview3DScene } from './preview3d';

/**
 * 미로 생성 미리보기를 3D로 보여 주는 전체 화면 오버레이.
 *
 * 미리보기가 켜져 있을 때만 열리며, 보여 주는 것은 editorStore.mazePreview의
 * 지형 타입 격자다 — 2D 미리보기와 마찬가지로 문서를 건드리지 않는다.
 * three.js 장면은 React 상태가 아니라 ref에 담아 두고 스토어를 직접 구독한다.
 */
export function Preview3DView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Preview3DScene | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useEditorStore((s) => s.closePreview3d);
  const generateMaze = useEditorStore((s) => s.generateMaze);
  const size = useEditorStore((s) => `${s.doc.width} × ${s.doc.height}`);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let scene: Preview3DScene;
    try {
      scene = createPreview3D(canvas);
    } catch (err) {
      setError(`3D 미리보기를 시작할 수 없습니다: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    sceneRef.current = scene;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      scene.resize(w, h);
    };

    // 크기를 먼저 잡아야 카메라가 화면 비율에 맞게 맵 전체를 담는다.
    applySize();

    // 브러쉬 정의는 칸마다 어떤 3D 모델을 세울지 정하는 데 쓴다. 3D 미리보기가
    // 떠 있는 동안에는 팔레트를 만질 수 없으므로 그릴 때 한 번 읽으면 충분하다.
    const apply = (doc: MapDoc, preview: Uint8Array | null) => {
      if (preview) scene.setMap(doc, preview, useBrushStore.getState().brushes);
    };
    const state = useEditorStore.getState();
    apply(state.doc, state.mazePreview);

    // 미리보기 안에서 [다시 생성]을 누르면 새 격자로 장면을 다시 만든다.
    let lastPreview = state.mazePreview;
    const unsubscribe = useEditorStore.subscribe((s) => {
      if (s.mazePreview === lastPreview) return;
      lastPreview = s.mazePreview;
      apply(s.doc, s.mazePreview);
    });

    const ro = new ResizeObserver(applySize);
    ro.observe(container);

    return () => {
      unsubscribe();
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // 모달과 같은 규칙: Esc로 닫는다. 열려 있는 동안 전역 단축키는 App에서 꺼 둔다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-panel" role="dialog" aria-modal="true" aria-label="3D 미리보기">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-edge bg-panel-2 px-3">
        <span className="text-sm font-semibold tracking-tight">3D 미리보기</span>
        <span className="font-mono text-xs text-ink-dim">{size}</span>
        <span className="hidden text-xs text-ink-dim sm:inline">
          왼쪽 드래그: 이동 · 오른쪽 드래그(또는 Shift+왼쪽 드래그): 회전 · 휠: 확대
        </span>
        <div className="ml-auto flex items-center gap-1">
          <BarButton icon={RefreshCw} label="다시 생성" onClick={generateMaze} />
          <BarButton icon={Crosshair} label="시점 초기화" onClick={() => sceneRef.current?.resetCamera()} />
          <BarButton icon={X} label="닫기" hint="Esc" onClick={close} />
        </div>
      </header>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="block touch-none select-none" />
        {error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-dim">{error}</div>
        )}
      </div>
    </div>
  );
}

interface BarButtonProps {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  hint?: string;
  onClick: () => void;
}

function BarButton({ icon: Icon, label, hint, onClick }: BarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `${label}  (${hint})` : label}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-dim transition-colors hover:bg-white/5 hover:text-ink"
    >
      <Icon size={15} strokeWidth={1.75} />
      {label}
    </button>
  );
}
