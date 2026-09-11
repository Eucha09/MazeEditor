import type { GridArray, MapDoc } from '../types';
import { createLayer, getLayer } from '../tilemap';
import { FORMAT, FORMAT_VERSION, mapFileSchema, type MapFile } from './schema';

function gridToRows(grid: GridArray, width: number, height: number): number[][] {
  const rows: number[][] = new Array(height);
  for (let y = 0; y < height; y++) {
    const row: number[] = new Array(width);
    const base = y * width;
    for (let x = 0; x < width; x++) row[x] = grid[base + x];
    rows[y] = row;
  }
  return rows;
}

function rowsToGrid<T extends GridArray>(rows: number[][], grid: T, width: number): T {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    const base = y * width;
    for (let x = 0; x < width; x++) grid[base + x] = row[x];
  }
  return grid;
}

export function serializeDoc(doc: MapDoc): MapFile {
  const { width: w, height: h } = doc;
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    name: doc.name,
    width: w,
    height: h,
    terrain: {
      type: gridToRows(doc.terrainType, w, h),
      object: gridToRows(getLayer(doc, 'terrain').object, w, h),
      brush: gridToRows(getLayer(doc, 'terrain').brush, w, h),
    },
    entity: {
      object: gridToRows(getLayer(doc, 'entity').object, w, h),
      brush: gridToRows(getLayer(doc, 'entity').brush, w, h),
    },
  };
}

/** 행마다 한 줄씩 나오도록 정렬한 JSON. diff를 보기 좋게 만들어 준다. */
export function toJson(doc: MapDoc): string {
  const file = serializeDoc(doc);
  const text = JSON.stringify(file, null, 2);
  // 셀 배열은 2단 들여쓰기로 펼쳐지면 너무 길어지므로 한 행을 한 줄로 접는다.
  // 오브젝트 ID는 음수일 수 있으므로 앞의 '-'까지 숫자로 본다. 빠뜨리면 음수가 든
  // 행만 여러 줄로 풀려 나온다.
  return text.replace(/\[\s+((?:-?\d+,\s+)*-?\d+)\s+\]/g, (_m, body: string) => `[${body.replace(/\s+/g, ' ')}]`);
}

export function deserializeDoc(raw: unknown): MapDoc {
  // 버전 1은 타일셋과 타일 ID로 저장하던 옛 형식이라 지형 타입/오브젝트 ID로 옮길 수 없다.
  const version = (raw as { version?: unknown })?.version;
  if (typeof version === 'number' && version < 2) {
    throw new Error(
      '버전 1 맵 파일입니다. 지형 타입과 오브젝트 ID를 저장하는 형식으로 바뀌어 더 이상 열 수 없습니다.',
    );
  }
  // 버전 2는 브러쉬 id를 칸마다 기록하지 않던 형식이라 호버 시 브러쉬를 알 수 없다.
  if (typeof version === 'number' && version < 3) {
    throw new Error(
      '버전 2 맵 파일입니다. 칸마다 브러쉬 id를 저장하는 형식으로 바뀌어 더 이상 열 수 없습니다.',
    );
  }

  const parsed = mapFileSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`맵 파일 형식이 올바르지 않습니다.\n${detail}`);
  }

  const file = parsed.data;
  const cells = file.width * file.height;
  const terrain = createLayer('terrain', cells);
  const entity = createLayer('entity', cells);

  rowsToGrid(file.terrain.object, terrain.object, file.width);
  rowsToGrid(file.terrain.brush, terrain.brush, file.width);
  rowsToGrid(file.entity.object, entity.object, file.width);
  rowsToGrid(file.entity.brush, entity.brush, file.width);

  return {
    name: file.name,
    width: file.width,
    height: file.height,
    terrainType: rowsToGrid(file.terrain.type, new Uint8Array(cells), file.width),
    layers: [terrain, entity],
  };
}

export function parseJson(text: string): MapDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSON을 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.');
  }
  return deserializeDoc(raw);
}
