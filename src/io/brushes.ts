import { z } from 'zod';
import type { Brush } from '@/core/brush';
import { defaultBrushes, newBrushId, normalizeDraft } from '@/core/brush';

/**
 * 브러쉬 보관.
 *
 * 브러쉬는 맵과 독립적이다. 같은 브러쉬 세트로 여러 맵을 그리고, 맵 파일에는
 * 결과값(지형 타입과 오브젝트 ID)만 남는다. 그래서 맵 파일이 아니라 브라우저
 * 저장소에 두고, 다른 PC나 게임 쪽으로 옮길 때는 JSON으로 내보낸다.
 */
const KEY = 'maze-editor:brushes:v1';
const FORMAT = 'maze-editor-brushes';
const FORMAT_VERSION = 3;

const cellKindSchema = z.enum(['floor', 'wall', 'pillar']);
const objectIdSchema = z.number().int().min(0);

const brushSchema = z.object({
  id: z.number().int().min(1),
  name: z.string(),
  group: z.string(),
  layer: z.enum(['terrain', 'entity']),
  terrainType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  entityType: z.enum(['seed', 'monster']).nullable(),
  allowedCellKinds: z.array(cellKindSchema),
  objectIds: z.object({ floor: objectIdSchema, wall: objectIdSchema, pillar: objectIdSchema }),
  unique: z.boolean(),
  size: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  blob: z.boolean(),
  fillable: z.boolean(),
  color: z.string().nullable(),
});

const brushFileSchema = z.object({
  format: z.literal(FORMAT),
  version: z.number().int().min(1).max(FORMAT_VERSION),
  brushes: z.array(brushSchema),
});

/** 파일에서 온 값도 편집 화면과 같은 규칙으로 맞춘다. */
function adopt(raw: z.infer<typeof brushSchema>): Brush {
  const { id, ...draft } = raw;
  return { id, ...normalizeDraft(draft) };
}

export function loadBrushes(): Brush[] {
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    // 시크릿 모드 등에서 접근이 막힐 수 있다. 기본 세트로 시작한다.
  }
  if (!text) return defaultBrushes();
  try {
    return parseBrushesJson(text);
  } catch {
    // 형식이 바뀌었거나 깨진 데이터. 조용히 버리고 기본 세트로 시작한다.
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 무시 */
    }
    return defaultBrushes();
  }
}

export function saveBrushes(brushes: Brush[]): void {
  try {
    localStorage.setItem(KEY, brushesToJson(brushes));
  } catch {
    // 용량 초과 등. 저장 실패로 편집을 막을 이유는 없다.
  }
}

export function brushesToJson(brushes: Brush[]): string {
  return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, brushes }, null, 2);
}

export function parseBrushesJson(text: string): Brush[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSON을 읽을 수 없습니다. 파일이 손상되었을 수 있습니다.');
  }

  const parsed = brushFileSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`브러쉬 파일 형식이 올바르지 않습니다.\n${detail}`);
  }

  const brushes = parsed.data.brushes.map(adopt);
  // 가져온 파일 안에 같은 id가 있으면 뒤엣것을 새 id로 밀어 준다. 파일 전체에서
  // 가장 큰 id 다음부터 매겨야 나중에 나오는 다른 브러쉬와도 겹치지 않는다.
  let nextId = newBrushId(brushes);
  const seen = new Set<number>();
  return brushes.map((brush) => {
    if (!seen.has(brush.id)) {
      seen.add(brush.id);
      return brush;
    }
    const reassigned = { ...brush, id: nextId++ };
    seen.add(reassigned.id);
    return reassigned;
  });
}
