import type { Layer, MapDoc } from '../types';
import { FORMAT, FORMAT_VERSION, mapFileSchema, type MapFile } from './schema';

function layerToRows(layer: Layer, width: number, height: number): number[][] {
  const rows: number[][] = new Array(height);
  for (let y = 0; y < height; y++) {
    const row: number[] = new Array(width);
    const base = y * width;
    for (let x = 0; x < width; x++) row[x] = layer.data[base + x];
    rows[y] = row;
  }
  return rows;
}

export function serializeDoc(doc: MapDoc): MapFile {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    tileset: doc.tileset.map((t) => ({ ...t })),
    layers: doc.layers.map((l) => ({
      key: l.key,
      name: l.name,
      visible: l.visible,
      defaultTile: l.defaultTile,
      rows: layerToRows(l, doc.width, doc.height),
    })),
  };
}

/** 행마다 한 줄씩 나오도록 정렬한 JSON. diff를 보기 좋게 만들어 준다. */
export function toJson(doc: MapDoc): string {
  const file = serializeDoc(doc);
  const text = JSON.stringify(file, null, 2);
  // 셀 배열은 2단 들여쓰기로 펼쳐지면 너무 길어지므로 한 행을 한 줄로 접는다.
  return text.replace(/\[\s+((?:\d+,\s+)*\d+)\s+\]/g, (_m, body: string) => `[${body.replace(/\s+/g, ' ')}]`);
}

export function deserializeDoc(raw: unknown): MapDoc {
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

  return {
    name: file.name,
    width: file.width,
    height: file.height,
    tileset: file.tileset,
    layers: file.layers.map((l) => {
      const data = new Uint16Array(cells);
      for (let y = 0; y < file.height; y++) {
        const row = l.rows[y];
        const base = y * file.width;
        for (let x = 0; x < file.width; x++) data[base + x] = row[x];
      }
      return { key: l.key, name: l.name, visible: l.visible, defaultTile: l.defaultTile, data };
    }),
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
