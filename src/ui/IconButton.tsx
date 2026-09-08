import type { ComponentType } from 'react';

export type IconComponent = ComponentType<{ size?: number | string; strokeWidth?: number }>;

interface IconButtonProps {
  icon: IconComponent;
  label: string;
  hotkey?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function IconButton({ icon: Icon, label, hotkey, active, disabled, onClick }: IconButtonProps) {
  const base = 'grid h-9 w-9 place-items-center rounded-md transition-colors';
  const state = disabled
    ? 'text-ink-dim/35 cursor-default'
    : active
      ? 'bg-accent/20 text-accent'
      : 'text-ink-dim hover:bg-white/5 hover:text-ink';

  return (
    <button
      type="button"
      title={hotkey ? `${label}  (${hotkey})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${state}`}
    >
      <Icon size={18} strokeWidth={1.75} />
    </button>
  );
}
