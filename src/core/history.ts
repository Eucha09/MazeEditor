import type { LayerKey, MapDoc, TileId } from './types';
import { getLayer } from './tilemap';

/**
 * 델타 기반 Undo/Redo.
 *
 * 맵 전체를 스냅샷으로 뜨지 않고, 드래그 한 번(스트로크) 동안 실제로 값이 바뀐
 * 셀만 기록한다. 큰 맵에서도 메모리와 속도가 셀 개수가 아니라 "칠한 만큼"에
 * 비례하므로 200x200 같은 맵에서도 즉각적으로 동작한다.
 */
export interface CellChange {
  layer: LayerKey;
  index: number;
  before: TileId;
  after: TileId;
}

export interface Stroke {
  label: string;
  changes: CellChange[];
}

export class History {
  private undoStack: Stroke[] = [];
  private redoStack: Stroke[] = [];

  constructor(private readonly limit = 200) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 값이 실제로 바뀐 스트로크만 쌓는다. 기록했으면 true. */
  commit(stroke: Stroke): boolean {
    if (stroke.changes.length === 0) return false;
    this.undoStack.push(stroke);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    return true;
  }

  undo(doc: MapDoc): boolean {
    const stroke = this.undoStack.pop();
    if (!stroke) return false;
    // 같은 셀을 여러 번 덮어쓴 경우가 있으므로 역순으로 되돌린다.
    for (let i = stroke.changes.length - 1; i >= 0; i--) {
      const c = stroke.changes[i];
      getLayer(doc, c.layer).data[c.index] = c.before;
    }
    this.redoStack.push(stroke);
    return true;
  }

  redo(doc: MapDoc): boolean {
    const stroke = this.redoStack.pop();
    if (!stroke) return false;
    for (const c of stroke.changes) {
      getLayer(doc, c.layer).data[c.index] = c.after;
    }
    this.undoStack.push(stroke);
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
