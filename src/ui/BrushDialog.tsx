import { useEffect, useId, useState } from 'react';
import type { Brush, BrushDraft, BrushSize, EntityType } from '@/core/brush';
import {
  BRUSH_SIZES,
  CELL_KINDS,
  CELL_KIND_NAME,
  ENTITY_TYPES,
  ENTITY_TYPE_NAME,
  autoColor,
  canBeFillable,
  zeroObjectIds,
} from '@/core/brush';
import type { CellKind, LayerKey, TerrainType } from '@/core/types';
import { TERRAIN_NONE, TERRAIN_TYPES, TERRAIN_TYPE_NAME } from '@/core/types';
import { useBrushStore } from '@/store/brushStore';
import { Modal } from './Modal';

interface BrushDialogProps {
  open: boolean;
  /** null이면 새 브러쉬를 만든다. */
  brush: Brush | null;
  onClose: () => void;
}

function emptyDraft(group: string): BrushDraft {
  return {
    name: '',
    group,
    layer: 'terrain',
    terrainType: TERRAIN_NONE,
    entityType: null,
    allowedCellKinds: ['wall', 'pillar'],
    objectIds: zeroObjectIds(),
    unique: false,
    size: 1,
    blob: false,
    fillable: false,
    color: null,
  };
}

export function BrushDialog({ open, brush, onClose }: BrushDialogProps) {
  const brushes = useBrushStore((s) => s.brushes);
  const addBrush = useBrushStore((s) => s.addBrush);
  const updateBrush = useBrushStore((s) => s.updateBrush);
  const deleteBrush = useBrushStore((s) => s.deleteBrush);

  const groupListId = useId();
  const [draft, setDraft] = useState<BrushDraft>(() => emptyDraft(''));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 열 때마다 대상 브러쉬의 값으로 초기화한다.
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (brush) {
      const { id: _id, ...rest } = brush;
      setDraft({ ...rest, allowedCellKinds: [...rest.allowedCellKinds], objectIds: { ...rest.objectIds } });
    } else {
      setDraft(emptyDraft(brushes[0]?.group ?? '숲 지형'));
    }
  }, [open, brush, brushes]);

  const patch = (part: Partial<BrushDraft>) => setDraft((d) => ({ ...d, ...part }));

  const entity = draft.layer === 'entity';
  const fillAvailable = canBeFillable(draft.allowedCellKinds, draft.blob, draft.unique);
  const preview = draft.color ?? autoColor(draft.name || '이름 없음', draft.layer, draft.terrainType);
  const groups = [...new Set(brushes.map((b) => b.group))];

  const setLayer = (layer: LayerKey) =>
    // entity는 지형 타입을 쓰지 않고 크기도 1로 고정된다. 반대로 엔티티 타입은
    // entity에서만 의미가 있으므로 terrain으로 바꾸면 비워 둔다.
    patch(
      layer === 'entity'
        ? { layer, size: 1, terrainType: TERRAIN_NONE }
        : { layer, entityType: null },
    );

  const toggleKind = (kind: CellKind) => {
    const has = draft.allowedCellKinds.includes(kind);
    const next = has
      ? draft.allowedCellKinds.filter((k) => k !== kind)
      : [...draft.allowedCellKinds, kind];
    patch({ allowedCellKinds: next, fillable: canBeFillable(next, draft.blob, draft.unique) && draft.fillable });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (brush) updateBrush(brush.id, draft);
    else addBrush(draft);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={brush ? '브러쉬 수정' : '브러쉬 추가'} className="w-[26rem]">
      <form onSubmit={submit} className="max-h-[70vh] overflow-y-auto pr-1">
        <Field label="이름">
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="예: 나무"
            className={INPUT}
          />
        </Field>

        <Field label="그룹">
          <input
            value={draft.group}
            onChange={(e) => patch({ group: e.target.value })}
            list={groupListId}
            placeholder="예: 숲 지형"
            className={INPUT}
          />
          <datalist id={groupListId}>
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>

        <Field label="레이어">
          <div className="flex gap-1">
            {(['terrain', 'entity'] as LayerKey[]).map((layer) => (
              <Choice
                key={layer}
                selected={draft.layer === layer}
                onClick={() => setLayer(layer)}
                label={layer}
              />
            ))}
          </div>
        </Field>

        <Field label="지형 타입" hint={entity ? 'entity 레이어는 지형 타입을 쓰지 않습니다.' : undefined}>
          <div className="flex flex-col gap-1">
            {TERRAIN_TYPES.map((type) => (
              <Choice
                key={type}
                selected={!entity && draft.terrainType === type}
                disabled={entity}
                onClick={() => patch({ terrainType: type as TerrainType })}
                label={TERRAIN_TYPE_NAME[type]}
              />
            ))}
          </div>
        </Field>

        <Field label="엔티티 타입" hint={!entity ? 'terrain 레이어는 엔티티 타입을 쓰지 않습니다.' : undefined}>
          <div className="flex flex-col gap-1">
            <Choice
              selected={entity && draft.entityType === null}
              disabled={!entity}
              onClick={() => patch({ entityType: null })}
              label="없음"
            />
            {ENTITY_TYPES.map((type) => (
              <Choice
                key={type}
                selected={entity && draft.entityType === type}
                disabled={!entity}
                onClick={() => patch({ entityType: type as EntityType })}
                label={ENTITY_TYPE_NAME[type]}
              />
            ))}
          </div>
        </Field>

        <Field label="놓을 수 있는 칸 종류 · 오브젝트 ID">
          <div className="flex flex-col gap-1">
            {CELL_KINDS.map((kind) => {
              const on = draft.allowedCellKinds.includes(kind);
              return (
                <div key={kind} className="flex items-center gap-2">
                  <label className="flex flex-1 items-center gap-2 text-sm">
                    <input type="checkbox" checked={on} onChange={() => toggleKind(kind)} />
                    <span className={on ? '' : 'text-ink-dim/60'}>{CELL_KIND_NAME[kind]}</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    disabled={!on}
                    value={draft.objectIds[kind]}
                    onChange={(e) =>
                      patch({ objectIds: { ...draft.objectIds, [kind]: Number(e.target.value) } })
                    }
                    title="이 칸에 기록할 오브젝트 ID"
                    className={`${INPUT} w-24 disabled:opacity-40`}
                  />
                </div>
              );
            })}
          </div>
        </Field>

        <Field label="브러쉬 크기" hint={entity ? 'entity 레이어는 1로 고정됩니다.' : undefined}>
          <div className="flex gap-1">
            {BRUSH_SIZES.map((size) => (
              <Choice
                key={size}
                selected={draft.size === size}
                disabled={entity && size !== 1}
                onClick={() => patch({ size: size as BrushSize })}
                label={String(size)}
              />
            ))}
          </div>
        </Field>

        <div className="mb-3 flex flex-col gap-1.5">
          <Toggle
            checked={draft.unique}
            // unique는 "칸 하나"를 전제하므로 채우기(영역 전체)와 함께 켤 수 없다.
            onChange={(v) => patch({ unique: v, fillable: v ? false : draft.fillable })}
            label="unique"
            hint="맵에 하나만 존재할 수 있습니다. 새로 놓으면 이전 것이 지워집니다."
          />
          <Toggle
            checked={draft.blob}
            // blob은 "가운데 칸에만 ID"를 전제하므로 채우기와 함께 켤 수 없다.
            onChange={(v) => patch({ blob: v, fillable: v ? false : draft.fillable })}
            label="하나의 덩어리로 인식"
            hint="드래그로 이어 그릴 수 없고 다른 덩어리와 맞닿을 수 없습니다. 오브젝트 ID는 가운데 칸에만 기록됩니다."
          />
          <Toggle
            checked={draft.fillable}
            disabled={!fillAvailable}
            onChange={(v) => patch({ fillable: v })}
            label="채우기 가능"
            hint={
              fillAvailable
                ? '채우기 도구로 같은 값을 가진 이어진 영역 전체를 한 번에 칠할 수 있습니다.'
                : 'floor·wall·pillar를 모두 놓을 수 있고, unique·덩어리가 아니어야 켤 수 있습니다.'
            }
          />
        </div>

        <Field label="색">
          <div className="flex items-center gap-2">
            <span
              className="h-7 w-7 shrink-0 rounded-md ring-1 ring-white/15"
              style={{ background: preview }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.color === null}
                onChange={(e) => patch({ color: e.target.checked ? null : toHex(preview) })}
              />
              자동
            </label>
            {draft.color !== null && (
              <input
                type="color"
                value={draft.color}
                onChange={(e) => patch({ color: e.target.value })}
                className="h-8 w-16 rounded border border-edge bg-panel"
              />
            )}
          </div>
        </Field>

        <div className="mt-4 flex items-center gap-2">
          {brush && (
            <button
              type="button"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                deleteBrush(brush.id);
                onClose();
              }}
              className="rounded-md px-2.5 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
            >
              {confirmDelete ? '정말 삭제할까요?' : '삭제'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md px-3 py-1.5 text-sm text-ink-dim transition-colors hover:bg-white/5 hover:text-ink"
          >
            취소
          </button>
          <button type="submit" className="rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent">
            {brush ? '저장' : '추가'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const INPUT =
  'rounded-md border border-edge bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs text-ink-dim">{label}</span>
      <div className="flex flex-col [&>input]:w-full">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-ink-dim/70">{hint}</p>}
    </div>
  );
}

function Choice({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={`flex-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
        disabled
          ? 'text-ink-dim/30'
          : selected
            ? 'bg-accent/20 text-accent'
            : 'text-ink-dim hover:bg-white/5 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`block ${disabled ? 'opacity-50' : ''}`}>
      <span className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </span>
      <span className="ml-6 block text-[11px] leading-relaxed text-ink-dim/70">{hint}</span>
    </label>
  );
}

/** <input type="color">는 #rrggbb만 받는다. hsl() 자동 색을 수동으로 바꿀 때 쓴다. */
function toHex(color: string): string {
  if (color.startsWith('#')) return color;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#888888';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
