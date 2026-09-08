/**
 * 에디터 셸 레이아웃.
 * 0단계에서는 골격만 세운다. 각 영역은 이후 단계에서 실제 컴포넌트로 교체된다.
 *   - 좌측 세로바  : Toolbar   (2단계)
 *   - 우측 패널    : Palette   (2단계)
 *   - 중앙        : CanvasView (1단계)
 *   - 하단        : StatusBar  (1단계)
 */
export default function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-edge bg-panel-2 px-3">
        <span className="text-sm font-semibold tracking-tight">Maze Editor</span>
        <span className="text-xs text-ink-dim">v0.1.0 · 스캐폴딩</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-12 shrink-0 border-r border-edge bg-panel-2" aria-label="도구" />

        <main className="grid min-w-0 flex-1 place-items-center">
          <div className="text-center">
            <p className="text-sm text-ink-dim">캔버스 영역</p>
            <p className="mt-1 text-xs text-ink-dim">1단계에서 격자 렌더링이 들어갑니다.</p>
          </div>
        </main>

        <aside className="w-56 shrink-0 border-l border-edge bg-panel-2" aria-label="타일 팔레트" />
      </div>

      <footer className="flex h-6 shrink-0 items-center border-t border-edge bg-panel-2 px-3 text-xs text-ink-dim">
        준비됨
      </footer>
    </div>
  );
}
