import type { GridId, MapDoc } from './types';
import { getGrid } from './tilemap';

/**
 * 델타 기반 Undo/Redo.
 *
 * 맵 전체를 스냅샷으로 뜨지 않고, 드래그 한 번(스트로크) 동안 실제로 값이 바뀐
 * 셀만 기록한다. 큰 맵에서도 메모리와 속도가 셀 개수가 아니라 "칠한 만큼"에
 * 비례하므로 200x200 같은 맵에서도 즉각적으로 동작한다.
 */
export interface CellChange {
  grid: GridId;
  index: number;
  before: number;
  after: number;
}

export interface Stroke {
  label: string;
  changes: CellChange[];
}

/**
 * 히스토리 항목.
 *
 * 크기 조정처럼 격자 자체가 달라지는 편집은 셀 델타로 표현할 수 없다.
 * 다행히 resizeDoc은 원본을 건드리지 않고 새 문서를 만들기 때문에,
 * 이전/이후 문서의 참조만 들고 있으면 복사 없이 되돌릴 수 있다.
 */
export type HistoryEntry =
  | ({ kind: 'cells' } & Stroke)
  | { kind: 'doc'; label: string; before: MapDoc; after: MapDoc };

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(private readonly limit = 200) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** 값이 실제로 바뀐 스트로크만 쌓는다. 기록했으면 true. */
  commit(stroke: Stroke): boolean {
    if (stroke.changes.length === 0) return false;
    this.push({ kind: 'cells', ...stroke });
    return true;
  }

  /** 문서를 통째로 교체하는 편집(크기 조정)을 기록한다. */
  commitDoc(label: string, before: MapDoc, after: MapDoc): void {
    this.push({ kind: 'doc', label, before, after });
  }

  /**
   * 한 단계 되돌린다.
   * 되돌린 뒤 사용해야 할 문서를 반환한다. 셀 편집이면 인자로 받은 문서를 제자리에서
   * 고쳐 그대로 돌려주고, 문서 교체 편집이면 이전 문서를 돌려준다.
   * 되돌릴 것이 없으면 null.
   */
  undo(doc: MapDoc): MapDoc | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);

    if (entry.kind === 'doc') return entry.before;

    // 같은 셀을 여러 번 덮어쓴 경우가 있으므로 역순으로 되돌린다.
    for (let i = entry.changes.length - 1; i >= 0; i--) {
      const c = entry.changes[i];
      getGrid(doc, c.grid)[c.index] = c.before;
    }
    return doc;
  }

  /** undo와 대칭. 다시 실행한 뒤 사용해야 할 문서를 반환한다. */
  redo(doc: MapDoc): MapDoc | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);

    if (entry.kind === 'doc') return entry.after;

    for (const c of entry.changes) {
      getGrid(doc, c.grid)[c.index] = c.after;
    }
    return doc;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
