import { forwardRef } from 'react';
import { MAX_MAP_SIZE, MIN_MAP_SIZE, normalizeMapSize } from '@/core/tilemap';

interface SizeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * 맵 크기 입력 칸. 홀수만 받는다.
 *
 * min=3 / step=2 이므로 스피너와 위아래 화살표로는 홀수만 나온다. 직접 짝수를
 * 타이핑하는 경우까지 막지는 않고, 보정될 값을 바로 아래에 보여 준 뒤 제출 시점에
 * normalizeMapSize가 확정한다. 입력 도중에 값을 강제로 바꾸면 숫자를 지우고
 * 다시 치는 것조차 어려워지기 때문이다.
 */
export const SizeField = forwardRef<HTMLInputElement, SizeFieldProps>(function SizeField(
  { label, value, onChange },
  ref,
) {
  const parsed = Number(value);
  const normalized = normalizeMapSize(parsed);
  const adjusted = value.trim() !== '' && Number.isFinite(parsed) && parsed !== normalized;

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-dim">{label}</span>
      <input
        ref={ref}
        type="number"
        min={MIN_MAP_SIZE}
        max={MAX_MAP_SIZE}
        step={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
      />
      <span className={`mt-1 block text-[11px] ${adjusted ? 'text-amber-400/90' : 'text-transparent'}`}>
        {adjusted ? `→ ${normalized} (홀수로 보정)` : '.'}
      </span>
    </label>
  );
});
