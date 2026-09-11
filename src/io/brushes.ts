import { z } from 'zod';
import type { Brush } from '@/core/brush';
import { PREVIEW_MODELS, defaultBrushes, newBrushId, normalizeDraft } from '@/core/brush';

/**
 * 브러쉬 보관.
 *
 * 브러쉬는 맵과 독립적이다. 같은 브러쉬 세트로 여러 맵을 그리고, 맵 파일에는
 * 결과값(지형 타입과 오브젝트 ID)만 남는다. 그래서 맵 파일이 아니라 브라우저
 * 저장소에 두고, 다른 PC나 게임 쪽으로 옮길 때는 JSON으로 내보낸다.
 */
const KEY = 'maze-editor:brushes:v1';
const FORMAT = 'maze-editor-brushes';
const FORMAT_VERSION = 4;

const cellKindSchema = z.enum(['floor', 'wall', 'pillar']);
/**
 * 오브젝트 ID는 음수도 쓴다. 정수 여부와 범위는 여기서 막지 않는다 — 값 하나 때문에
 * 브러쉬 파일 전체를 거부하지 않고, normalizeDraft(sanitizeObjectId)가 맵에
 * 들어가는 정수로 맞춰 주게 하기 위해서다.
 */
const objectIdSchema = z.number();

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
  /**
   * v4에서 추가.
   *
   * 맵 파일과 달리 여기서는 구버전을 잘라내지 않고 기본값을 채운다. 순수하게
   * 덧붙인 항목이라 "없음"의 뜻이 분명하고(= 기본 모델), 브러쉬 파일을 못 읽으면
   * loadBrushes가 사용자의 브러쉬 세트를 통째로 버리고 기본 세트로 되돌아가기
   * 때문이다. 잃을 게 큰 데 비해 얻는 게 없다.
   *
   * 모르는 값도 같은 이유로 튕기지 않고 기본 모델로 받는다 — 3D 미리보기에만
   * 쓰이는 값 하나 때문에 브러쉬 세트 전체를 잃을 이유가 없고, 나중 버전에서
   * 모델이 늘어나도 예전 에디터가 그 파일을 열 수 있다.
   *
   * 그래서 모델 종류를 늘릴 때(예: monster)는 FORMAT_VERSION을 올리지 않는다.
   * 올리면 위 version 상한 검사에 걸려 예전 에디터가 파일을 통째로 거부하게 되어,
   * 여기서 .catch로 지키려던 호환성이 오히려 깨진다.
   */
  previewModel: z.enum(PREVIEW_MODELS).catch('default'),
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
