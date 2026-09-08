import { create } from 'zustand';
import type { CellPos, LayerKey, MapDoc, TileDef, TileId, ToolId } from '@/core/types';
import type { Anchor } from '@/core/tilemap';
import { cellIndex, createDoc, getLayer, inBounds, normalizeMapSize, resizeDoc, sameGrid } from '@/core/tilemap';
import { History, type Stroke } from '@/core/history';
import { tilesetIndex, TILE_WALL } from '@/core/tileset';
import { forEachBrushCell, forEachLineCell } from '@/core/tools/brush';
import { parseJson, toJson } from '@/core/io/serialize';
import type { Camera } from '@/render/camera';
import { fitToView, pan as panCamera, zoomAt } from '@/render/camera';
import { loadAutosave, scheduleAutosave } from '@/io/autosave';
import { openTextFile, saveTextAs, writeHandle, type FileHandleLike } from '@/io/fileDialog';

export const DEFAULT_MAP_WIDTH = 33;
export const DEFAULT_MAP_HEIGHT = 25;
export const BRUSH_SIZES = [1, 3, 5, 7] as const;

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

interface EditorState {
  doc: MapDoc;
  /**
   * doc의 타일 배열은 제자리에서 변경된다(참조가 바뀌지 않는다).
   * 렌더러는 이 카운터로 다시 그릴 시점을 판단한다.
   */
  rev: number;

  camera: Camera;
  /** 뷰포트 크기를 아는 쪽(CanvasView)에서 화면 맞춤을 수행하도록 요청하는 신호 */
  fitRequest: number;

  tool: ToolId;
  activeTileId: TileId;
  brushSize: number;
  showGrid: boolean;
  hover: CellPos | null;

  canUndo: boolean;
  canRedo: boolean;

  dirty: boolean;
  fileName: string | null;
  notice: string | null;

  setTool: (tool: ToolId) => void;
  setActiveTile: (id: TileId) => void;
  setBrushSize: (size: number) => void;
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

  newDoc: (width: number, height: number, name: string) => void;
  /** 내용을 유지한 채 맵 크기를 바꾼다. 크기는 홀수로 보정된다. */
  resize: (width: number, height: number, anchor: Anchor, borderWalls: boolean) => void;
  save: (forcePicker?: boolean) => Promise<void>;
  open: () => Promise<void>;
}

function initialDoc(): { doc: MapDoc; restored: boolean } {
  const saved = loadAutosave();
  if (saved) return { doc: saved, restored: true };
  return { doc: createDoc(DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, { name: 'level-01' }), restored: false };
}

/** 사용자가 마지막으로 저장한 파일 핸들. 지원 브라우저에서 Ctrl+S 덮어쓰기에 쓰인다. */
let fileHandle: FileHandleLike | null = null;

const boot = initialDoc();

export const useEditorStore = create<EditorState>()((set, get) => {
  /** 진행 중인 스트로크에 변경을 기록하며 셀에 값을 쓴다. 값이 같으면 아무것도 하지 않는다. */
  function writeCell(doc: MapDoc, layerKey: LayerKey, x: number, y: number, tile: TileId): void {
    if (!inBounds(doc, x, y)) return;
    const layer = getLayer(doc, layerKey);
    const index = cellIndex(x, y, doc.width);
    const before = layer.data[index];
    if (before === tile) return;
    layer.data[index] = tile;
    activeStroke?.changes.push({ layer: layerKey, index, before, after: tile });
  }

  function writeCellAt(doc: MapDoc, layerKey: LayerKey, index: number, tile: TileId): void {
    const layer = getLayer(doc, layerKey);
    const before = layer.data[index];
    if (before === tile) return;
    layer.data[index] = tile;
    activeStroke?.changes.push({ layer: layerKey, index, before, after: tile });
  }

  function eraseCell(doc: MapDoc, x: number, y: number): void {
    if (!inBounds(doc, x, y)) return;
    // 위 레이어부터 지운다. 엔티티가 있으면 엔티티만, 없으면 지형을 기본값으로 되돌린다.
    const entity = getLayer(doc, 'entity');
    const index = cellIndex(x, y, doc.width);
    if (entity.data[index] !== entity.defaultTile) {
      writeCellAt(doc, 'entity', index, entity.defaultTile);
      return;
    }
    const terrain = getLayer(doc, 'terrain');
    writeCellAt(doc, 'terrain', index, terrain.defaultTile);
  }

  /** 맵에 하나만 존재해야 하는 타일. 기존 위치를 지우고 새 자리에 놓는다. */
  function placeUnique(doc: MapDoc, def: TileDef, x: number, y: number): void {
    if (!inBounds(doc, x, y)) return;
    const layer = getLayer(doc, def.layer);
    const prev = layer.data.indexOf(def.id);
    if (prev >= 0) writeCellAt(doc, def.layer, prev, layer.defaultTile);
    writeCell(doc, def.layer, x, y, def.id);
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
      ...patch,
    });
  }

  return {
    doc: boot.doc,
    rev: 0,
    camera: { ox: 0, oy: 0, scale: 24 },
    fitRequest: 1,

    tool: 'brush',
    activeTileId: TILE_WALL,
    brushSize: 1,
    showGrid: true,
    hover: null,

    canUndo: false,
    canRedo: false,

    dirty: false,
    fileName: null,
    notice: boot.restored ? '이전 작업을 자동 저장에서 복구했습니다.' : null,

    setTool: (tool) => set({ tool }),
    setActiveTile: (activeTileId) => set({ activeTileId, tool: 'brush' }),
    setBrushSize: (brushSize) => set({ brushSize }),
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
      strokeTool = tool ?? null;
      activeStroke = { label: tool ?? get().tool, changes: [] };
    },

    paintAt: (x, y) => {
      const { doc, activeTileId, brushSize } = get();
      const tool = strokeTool ?? get().tool;
      if (tool === 'eraser') {
        forEachBrushCell(x, y, brushSize, (cx, cy) => eraseCell(doc, cx, cy));
        return;
      }
      const def = tilesetIndex(doc.tileset).get(activeTileId);
      if (!def) return;
      if (def.unique) {
        // 시작/목표는 브러쉬 크기를 무시하고 한 칸만 놓는다.
        placeUnique(doc, def, x, y);
        return;
      }
      forEachBrushCell(x, y, brushSize, (cx, cy) => writeCell(doc, def.layer, cx, cy, def.id));
    },

    paintLine: (from, to) => {
      const paint = get().paintAt;
      forEachLineCell(from.x, from.y, to.x, to.y, (x, y) => paint(x, y));
    },

    endStroke: () => {
      const stroke = activeStroke;
      activeStroke = null;
      strokeTool = null;
      if (!stroke) return;
      if (!history.commit(stroke)) {
        // 실제로 바뀐 셀이 없으면 히스토리를 더럽히지 않는다.
        set({ canUndo: history.canUndo, canRedo: history.canRedo });
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

    newDoc: (width, height, name) => {
      const doc = createDoc(width, height, { name: name || '새 맵' });
      fileHandle = null;
      replaceDoc(doc, { dirty: false, fileName: null, notice: `새 맵 ${doc.width}×${doc.height}` });
      scheduleAutosave(doc);
    },

    resize: (width, height, anchor, borderWalls) => {
      const prev = get().doc;
      const w = normalizeMapSize(width);
      const h = normalizeMapSize(height);
      const next = resizeDoc(prev, w, h, { anchor, borderWalls });

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
        // 바깥에서 만들어진 파일은 짝수 크기일 수 있다. 멋대로 고치지 않고 알리기만 한다.
        const evenSize = doc.width % 2 === 0 || doc.height % 2 === 0;
        replaceDoc(doc, {
          dirty: false,
          fileName: result.fileName,
          notice: evenSize
            ? `열림 · ${result.fileName} · 크기가 짝수입니다. [크기]에서 홀수로 맞추길 권합니다.`
            : `열림 · ${result.fileName}`,
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
