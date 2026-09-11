import { create } from 'zustand';
import type { CellPos, GridId, MapDoc, ToolId } from '@/core/types';
import { TERRAIN_NONE } from '@/core/types';
import type { Anchor } from '@/core/tilemap';
import {
  brushGridOf,
  cellIndex,
  createDoc,
  getGrid,
  getLayer,
  inBounds,
  isValidMapSize,
  normalizeMapSize,
  objectGridOf,
  resizeDoc,
  sameGrid,
} from '@/core/tilemap';
import type { Brush } from '@/core/brush';
import { objectIdFor } from '@/core/brush';
import { cellKind } from '@/core/lattice';
import { History, type Stroke } from '@/core/history';
import { forEachBrushCell, forEachLineCell } from '@/core/tools/brush';
import { checkBlobPlacement, isCellAllowed, REJECTION_MESSAGE } from '@/core/tools/place';
import { floodFillRegion } from '@/core/tools/fill';
import { generateMazePreview } from '@/core/tools/generateMaze';
import { computeBrushResync } from '@/core/tools/resyncBrush';
import { parseJson, toJson } from '@/core/io/serialize';
import type { Camera } from '@/render/camera';
import { fitToView, pan as panCamera, zoomAt } from '@/render/camera';
import { loadAutosave, scheduleAutosave } from '@/io/autosave';
import { openTextFile, saveTextAs, writeHandle, type FileHandleLike } from '@/io/fileDialog';
import { useBrushStore } from './brushStore';

// 4n+3 규칙을 만족하는 값이어야 한다.
export const DEFAULT_MAP_WIDTH = 35;
export const DEFAULT_MAP_HEIGHT = 27;

/**
 * 히스토리와 진행 중인 스트로크는 React 상태 밖에 둔다.
 * 드래그 중 초당 수십 번 바뀌는 값이라 여기에 넣으면 불필요한 리렌더가 발생한다.
 */
const history = new History();
let activeStroke: Stroke | null = null;
/**
 * 이 스트로크 동안 적용할 도구.
 * 우클릭 드래그는 현재 선택된 도구와 무관하게 지우개로 동작해야 하므로,
 * 전역 tool 상태를 건드리지 않고(툴바가 깜빡이지 않도록) 스트로크 단위로만 덮어쓴다.
 */
let strokeTool: ToolId | null = null;
/** 이번 스트로크에서 규칙 때문에 건너뛴 이유. 아무것도 안 그려졌을 때 알리는 데 쓴다. */
let strokeBlockReason: string | null = null;

interface EditorState {
  doc: MapDoc;
  /**
   * doc의 격자는 제자리에서 변경된다(참조가 바뀌지 않는다).
   * 렌더러는 이 카운터로 다시 그릴 시점을 판단한다.
   */
  rev: number;

  camera: Camera;
  /** 뷰포트 크기를 아는 쪽(CanvasView)에서 화면 맞춤을 수행하도록 요청하는 신호 */
  fitRequest: number;

  tool: ToolId;
  showGrid: boolean;
  hover: CellPos | null;

  /**
   * 미로 생성 미리보기 결과 (지형 타입 격자). null이면 미리보기가 꺼진 상태다.
   * doc은 전혀 건드리지 않으므로 맵 파일에는 영향이 없다 — 렌더러가 doc.terrainType
   * 대신 이 값을 잠깐 보여줄 뿐이다.
   */
  mazePreview: Uint8Array | null;
  /**
   * 3D 미리보기 오버레이가 열려 있는지.
   * 보여 주는 내용이 mazePreview이므로 미리보기가 꺼지면 함께 닫힌다.
   */
  preview3d: boolean;

  canUndo: boolean;
  canRedo: boolean;

  dirty: boolean;
  fileName: string | null;
  notice: string | null;

  setTool: (tool: ToolId) => void;
  toggleGrid: () => void;
  setHover: (cell: CellPos | null) => void;
  setNotice: (text: string | null) => void;
  setDocName: (name: string) => void;

  setCamera: (camera: Camera) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAtPoint: (sx: number, sy: number, factor: number) => void;
  requestFit: () => void;

  /** tool을 넘기면 이 스트로크 동안만 해당 도구로 동작한다 (우클릭 지우개). */
  beginStroke: (tool?: ToolId) => void;
  paintAt: (x: number, y: number) => void;
  paintLine: (from: CellPos, to: CellPos) => void;
  endStroke: () => void;

  undo: () => void;
  redo: () => void;

  /**
   * 브러쉬 설정을 고친 뒤, 이 브러쉬로 이미 칠해진 칸들을 새 설정에 맞게
   * 다시 계산해 맵에 반영한다. 일반 편집과 마찬가지로 되돌릴 수 있다.
   */
  resyncBrush: (brush: Brush) => void;

  /** 현재 맵의 Seed 엔티티들로 미로를 생성해 미리보기를 켠다. 문서는 바뀌지 않는다. */
  generateMaze: () => void;
  exitMazePreview: () => void;
  /** 미리보기를 3D로 보는 오버레이를 연다. 미리보기가 꺼져 있으면 열지 않는다. */
  openPreview3d: () => void;
  closePreview3d: () => void;

  newDoc: (width: number, height: number, name: string) => void;
  /** 내용을 유지한 채 맵 크기를 바꾼다. 크기는 4n+3으로 보정된다. */
  resize: (width: number, height: number, anchor: Anchor) => void;
  save: (forcePicker?: boolean) => Promise<void>;
  open: () => Promise<void>;
}

/** 바깥에서 들어온 문서가 현재 크기 규칙에 맞는지 확인하고, 어긋나면 알릴 문구를 돌려준다. */
function sizeWarning(doc: MapDoc): string | null {
  if (isValidMapSize(doc.width) && isValidMapSize(doc.height)) return null;
  return `크기 ${doc.width}×${doc.height}가 규칙(4n+3)과 다릅니다. [크기]에서 맞추길 권합니다.`;
}

function initialDoc(): { doc: MapDoc; restored: boolean } {
  const saved = loadAutosave();
  if (saved) return { doc: saved, restored: true };
  return { doc: createDoc(DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, { name: 'level-01' }), restored: false };
}

/** 사용자가 마지막으로 저장한 파일 핸들. 지원 브라우저에서 Ctrl+S 덮어쓰기에 쓰인다. */
let fileHandle: FileHandleLike | null = null;

const boot = initialDoc();

function bootNotice(doc: MapDoc): string {
  const warn = sizeWarning(doc);
  return warn ? `이전 작업을 복구했습니다 · ${warn}` : '이전 작업을 자동 저장에서 복구했습니다.';
}

function currentBrush(): Brush | null {
  const { brushes, activeBrushId } = useBrushStore.getState();
  return brushes.find((b) => b.id === activeBrushId) ?? null;
}

export const useEditorStore = create<EditorState>()((set, get) => {
  /** 진행 중인 스트로크에 변경을 기록하며 격자 한 칸에 값을 쓴다. 값이 같으면 아무것도 하지 않는다. */
  function writeGridAt(doc: MapDoc, grid: GridId, index: number, value: number): void {
    const data = getGrid(doc, grid);
    const before = data[index];
    if (before === value) return;
    data[index] = value;
    activeStroke?.changes.push({ grid, index, before, after: value });
  }

  /**
   * 브러쉬 한 칸을 찍는다. terrain 브러쉬는 지형 타입도 함께 기록하고, 어떤
   * 브러쉬가 찍었는지도 함께 남긴다 (호버 정보, unique 브러쉬 재배치에 쓰인다).
   */
  function writeBrushCell(
    doc: MapDoc,
    brush: Brush,
    x: number,
    y: number,
    objectId: number,
    brushId: number,
  ): void {
    if (!inBounds(doc, x, y)) return;
    const index = cellIndex(x, y, doc.width);
    if (brush.layer === 'terrain') writeGridAt(doc, 'terrainType', index, brush.terrainType);
    writeGridAt(doc, objectGridOf(brush.layer), index, objectId);
    writeGridAt(doc, brushGridOf(brush.layer), index, brushId);
  }

  function eraseCell(doc: MapDoc, x: number, y: number): void {
    if (!inBounds(doc, x, y)) return;
    const index = cellIndex(x, y, doc.width);
    // 위 레이어부터 지운다. 엔티티가 있으면 엔티티만, 없으면 지형을 None으로 되돌린다.
    // 오브젝트 ID가 아니라 브러쉬 id로 "칠해져 있는지"를 판단한다 — 오브젝트 ID를
    // 0으로 두는 브러쉬(장식용 등)도 정확히 감지해야 하기 때문이다.
    if (getLayer(doc, 'entity').brush[index] !== 0) {
      writeGridAt(doc, 'entityObject', index, 0);
      writeGridAt(doc, 'entityBrush', index, 0);
      return;
    }
    writeGridAt(doc, 'terrainType', index, TERRAIN_NONE);
    writeGridAt(doc, 'terrainObject', index, 0);
    writeGridAt(doc, 'terrainBrush', index, 0);
  }

  /**
   * 맵에 하나만 존재해야 하는 브러쉬. 기존에 놓인 것을 지운다.
   * 지형 타입은 무엇이었는지 알 수 없으므로 건드리지 않고 오브젝트와 브러쉬 id만
   * 거둬들인다. 브러쉬 id로 정확히 찾으므로, 이 브러쉬의 오브젝트 ID를 나중에
   * 바꿔도 예전에 놓인 칸을 놓치지 않는다.
   */
  function clearPreviousUnique(doc: MapDoc, brush: Brush): void {
    const brushGrid = brushGridOf(brush.layer);
    const brushIds = getGrid(doc, brushGrid);
    const objectGrid = objectGridOf(brush.layer);
    for (let i = 0; i < brushIds.length; i++) {
      if (brushIds[i] !== brush.id) continue;
      writeGridAt(doc, objectGrid, i, 0);
      writeGridAt(doc, brushGrid, i, 0);
    }
  }

  function placeBrush(doc: MapDoc, brush: Brush, cx: number, cy: number): void {
    if (brush.blob) {
      const rejection = checkBlobPlacement(doc, useBrushStore.getState().brushes, brush, cx, cy);
      if (rejection) {
        strokeBlockReason = REJECTION_MESSAGE[rejection];
        return;
      }
      if (brush.unique) clearPreviousUnique(doc, brush);
      // 덩어리는 가운데 한 칸에만 오브젝트 ID·브러쉬 id를 남기고 나머지는 0으로 둔다.
      forEachBrushCell(cx, cy, brush.size, (x, y) => {
        const isCenter = x === cx && y === cy;
        const id = isCenter ? objectIdFor(brush, cellKind(doc, x, y)) : 0;
        writeBrushCell(doc, brush, x, y, id, isCenter ? brush.id : 0);
      });
      return;
    }

    // 칸 종류 제한은 클릭한 칸(중심)에 대해서만 따진다. 브러쉬 크기가 3 이상이면
    // 정사각형 범위가 floor·wall·pillar를 전부 걸치기 마련이라, 칸마다 따로
    // 검사하면 세 종류를 모두 허용한 브러쉬가 아닌 이상 범위 일부가 잘려 나간다.
    if (inBounds(doc, cx, cy) && !isCellAllowed(doc, brush, cx, cy)) {
      strokeBlockReason = REJECTION_MESSAGE['cell-kind'];
      return;
    }

    if (brush.unique) clearPreviousUnique(doc, brush);
    forEachBrushCell(cx, cy, brush.size, (x, y) => {
      if (!inBounds(doc, x, y)) return;
      writeBrushCell(doc, brush, x, y, objectIdFor(brush, cellKind(doc, x, y)), brush.id);
    });
  }

  /**
   * 클릭한 칸과 (지형 타입, 오브젝트 ID)가 정확히 같은, 이어진 영역 전체를
   * 이 브러쉬로 다시 칠한다. 영역이 이미 그 값과 같으면 자연히 아무것도 바뀌지 않는다.
   */
  function fillRegion(doc: MapDoc, brush: Brush, x: number, y: number): void {
    if (!brush.fillable) {
      strokeBlockReason = REJECTION_MESSAGE['not-fillable'];
      return;
    }
    const cells = floodFillRegion(doc, brush.layer, x, y);
    for (const cell of cells) {
      writeBrushCell(doc, brush, cell.x, cell.y, objectIdFor(brush, cellKind(doc, cell.x, cell.y)), brush.id);
    }
  }

  /**
   * 편집 직후의 뒷정리.
   * nextDoc이 현재 문서와 다른 객체이면(크기 조정 등) 문서를 교체하고 화면도 다시 맞춘다.
   */
  function afterMutation(nextDoc?: MapDoc): void {
    const doc = nextDoc ?? get().doc;
    const patch: Partial<EditorState> = {
      rev: get().rev + 1,
      dirty: true,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      // 문서가 바뀌면 미리보기는 더 이상 지금 상태를 반영하지 않으므로 꺼 둔다.
      mazePreview: null,
      preview3d: false,
    };
    if (doc !== get().doc) {
      patch.doc = doc;
      patch.hover = null;
      patch.fitRequest = get().fitRequest + 1;
    }
    set(patch);
    scheduleAutosave(doc);
  }

  function replaceDoc(doc: MapDoc, patch: Partial<EditorState>): void {
    history.clear();
    activeStroke = null;
    strokeTool = null;
    set({
      doc,
      rev: get().rev + 1,
      canUndo: false,
      canRedo: false,
      hover: null,
      fitRequest: get().fitRequest + 1,
      mazePreview: null,
      preview3d: false,
      ...patch,
    });
  }

  return {
    doc: boot.doc,
    rev: 0,
    camera: { ox: 0, oy: 0, scale: 24 },
    fitRequest: 1,

    tool: 'brush',
    showGrid: true,
    hover: null,
    mazePreview: null,
    preview3d: false,

    canUndo: false,
    canRedo: false,

    dirty: false,
    fileName: null,
    notice: boot.restored ? bootNotice(boot.doc) : null,

    setTool: (tool) => set({ tool }),
    toggleGrid: () => set({ showGrid: !get().showGrid }),
    setHover: (hover) => {
      const prev = get().hover;
      if (prev?.x === hover?.x && prev?.y === hover?.y) return;
      set({ hover, rev: get().rev + 1 });
    },
    setNotice: (notice) => set({ notice }),
    setDocName: (name) => {
      const doc = { ...get().doc, name };
      set({ doc, rev: get().rev + 1, dirty: true });
      scheduleAutosave(doc);
    },

    setCamera: (camera) => set({ camera, rev: get().rev + 1 }),
    panBy: (dx, dy) => set({ camera: panCamera(get().camera, dx, dy), rev: get().rev + 1 }),
    zoomAtPoint: (sx, sy, factor) =>
      set({ camera: zoomAt(get().camera, sx, sy, factor), rev: get().rev + 1 }),
    requestFit: () => set({ fitRequest: get().fitRequest + 1 }),

    beginStroke: (tool) => {
      // 미리보기 중에는 실제 문서를 편집할 수 없다 — 화면에 보이는 게 doc이 아니다.
      if (get().mazePreview !== null) return;
      strokeTool = tool ?? null;
      strokeBlockReason = null;
      activeStroke = { label: tool ?? get().tool, changes: [] };
    },

    paintAt: (x, y) => {
      const { doc, mazePreview } = get();
      // 미리보기 화면은 doc이 아니므로, beginStroke가 막힌 뒤에도 혹시 호출되면
      // 여기서도 한 번 더 막는다 — 기록 없이 doc이 조용히 바뀌는 일을 막기 위해서다.
      if (mazePreview !== null) return;
      const tool = strokeTool ?? get().tool;
      const brush = currentBrush();

      if (tool === 'eraser') {
        // 지우개도 선택된 브러쉬의 크기를 따른다. 칠한 만큼 지울 수 있어야 한다.
        forEachBrushCell(x, y, brush?.size ?? 1, (cx, cy) => eraseCell(doc, cx, cy));
        return;
      }
      if (!brush) return;
      if (tool === 'fill') {
        fillRegion(doc, brush, x, y);
        return;
      }
      placeBrush(doc, brush, x, y);
    },

    paintLine: (from, to) => {
      const tool = strokeTool ?? get().tool;
      // 덩어리 브러쉬와 채우기는 한 번 누를 때 한 번만 적용한다. 드래그로 이어지지 않는다.
      if (tool === 'brush' && currentBrush()?.blob) return;
      if (tool === 'fill') return;
      const paint = get().paintAt;
      forEachLineCell(from.x, from.y, to.x, to.y, (x, y) => paint(x, y));
    },

    endStroke: () => {
      const stroke = activeStroke;
      const blockReason = strokeBlockReason;
      activeStroke = null;
      strokeTool = null;
      strokeBlockReason = null;
      if (!stroke) return;
      if (!history.commit(stroke)) {
        // 실제로 바뀐 셀이 없으면 히스토리를 더럽히지 않는다.
        // 다만 규칙에 전부 막혀서 그런 것이라면 이유를 알려 준다.
        set({
          canUndo: history.canUndo,
          canRedo: history.canRedo,
          ...(blockReason ? { notice: blockReason } : {}),
        });
        return;
      }
      afterMutation();
    },

    undo: () => {
      const next = history.undo(get().doc);
      if (!next) return;
      afterMutation(next);
    },

    redo: () => {
      const next = history.redo(get().doc);
      if (!next) return;
      afterMutation(next);
    },

    resyncBrush: (brush) => {
      const { doc } = get();
      const changes = computeBrushResync(doc, brush);
      if (changes.length === 0) return;

      const stroke: Stroke = { label: 'brush-resync', changes: [] };
      for (const change of changes) {
        getGrid(doc, change.grid)[change.index] = change.after;
        stroke.changes.push(change);
      }
      if (!history.commit(stroke)) return;
      afterMutation();
    },

    generateMaze: () => {
      const { doc } = get();
      const { brushes } = useBrushStore.getState();
      const result = generateMazePreview(doc, brushes);
      if (result.seedCount === 0) {
        set({ notice: '엔티티 타입이 Seed인 브러쉬가 없어 미로를 생성할 수 없습니다.' });
        return;
      }
      set({ mazePreview: result.terrainType, notice: `미로 생성 미리보기 · Seed ${result.seedCount}개` });
    },

    exitMazePreview: () => set({ mazePreview: null, preview3d: false }),

    openPreview3d: () => {
      if (get().mazePreview === null) {
        set({ notice: '미로 생성 미리보기를 켠 뒤에 3D로 볼 수 있습니다.' });
        return;
      }
      set({ preview3d: true });
    },

    closePreview3d: () => set({ preview3d: false }),

    newDoc: (width, height, name) => {
      const doc = createDoc(width, height, { name: name || '새 맵' });
      fileHandle = null;
      replaceDoc(doc, { dirty: false, fileName: null, notice: `새 맵 ${doc.width}×${doc.height}` });
      scheduleAutosave(doc);
    },

    resize: (width, height, anchor) => {
      const prev = get().doc;
      const w = normalizeMapSize(width);
      const h = normalizeMapSize(height);
      const next = resizeDoc(prev, w, h, { anchor });

      // 결과가 이전과 완전히 같으면 되돌릴 것 없는 히스토리 항목을 남기지 않는다.
      if (sameGrid(prev, next)) {
        set({ notice: `크기 변화 없음 · ${w}×${h}` });
        return;
      }
      history.commitDoc('resize', prev, next);
      set({ notice: `크기 조정 · ${prev.width}×${prev.height} → ${w}×${h}` });
      afterMutation(next);
    },

    save: async (forcePicker = false) => {
      const { doc } = get();
      const text = toJson(doc);
      try {
        if (fileHandle && !forcePicker) {
          await writeHandle(fileHandle, text);
          set({ dirty: false, notice: `저장됨 · ${fileHandle.name}` });
          return;
        }
        const result = await saveTextAs(`${doc.name || 'map'}.json`, text);
        if (!result) return;
        fileHandle = result.handle;
        set({ dirty: false, fileName: result.fileName, notice: `저장됨 · ${result.fileName}` });
      } catch (err) {
        set({ notice: `저장 실패: ${err instanceof Error ? err.message : String(err)}` });
      }
    },

    open: async () => {
      const result = await openTextFile();
      if (!result) return;
      try {
        const doc = parseJson(result.text);
        fileHandle = result.handle;
        // 바깥에서 만들어진 파일은 크기 규칙에 안 맞을 수 있다. 멋대로 고치지 않고 알리기만 한다.
        const warn = sizeWarning(doc);
        replaceDoc(doc, {
          dirty: false,
          fileName: result.fileName,
          notice: warn ? `열림 · ${result.fileName} · ${warn}` : `열림 · ${result.fileName}`,
        });
        scheduleAutosave(doc);
      } catch (err) {
        set({ notice: err instanceof Error ? err.message : String(err) });
      }
    },
  };
});

/** 캔버스가 화면 맞춤을 수행할 때 사용한다. */
export function computeFit(doc: MapDoc, viewW: number, viewH: number): Camera {
  return fitToView(doc.width, doc.height, viewW, viewH);
}
