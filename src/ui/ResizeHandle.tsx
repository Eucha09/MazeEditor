interface ResizeHandleProps {
  label: string;
  /** 포인터가 한 프레임 동안 움직인 만큼(px). 방향 계산은 부르는 쪽이 한다. */
  onDrag: (deltaX: number) => void;
}

/**
 * 패널 사이의 세로 구분선. 드래그하면 onDrag로 가로 이동량을 알려 준다.
 *
 * 절대 폭 대신 델타를 넘기는 이유는, 너비를 어떻게 해석할지(왼쪽 패널이냐
 * 오른쪽 패널이냐)는 이 컴포넌트가 알 필요가 없기 때문이다 — 부르는 쪽이
 * 자기 상태에 맞게 더하거나 빼면 된다.
 */
export function ResizeHandle({ label, onDrag }: ResizeHandleProps) {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // 캔버스 위를 지나가도 브러쉬가 칠해지지 않도록, 그리고 드래그 중 커서가
    // 엉뚱한 요소 위에서 바뀌지 않도록 몸 전체에 강제로 커서를 씌운다.
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    onDrag(e.movementX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="group relative w-1.5 shrink-0 cursor-col-resize touch-none"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-edge transition-colors group-hover:bg-accent/70 group-active:bg-accent" />
    </div>
  );
}
