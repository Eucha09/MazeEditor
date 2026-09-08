import { z } from 'zod';

export const FORMAT = 'maze-editor';
export const FORMAT_VERSION = 1;

const layerKeySchema = z.enum(['terrain', 'entity']);

const tileDefSchema = z.object({
  id: z.number().int().min(0),
  key: z.string().min(1),
  name: z.string(),
  color: z.string(),
  solid: z.boolean(),
  unique: z.boolean(),
  layer: layerKeySchema,
});

const layerSchema = z.object({
  key: layerKeySchema,
  name: z.string(),
  visible: z.boolean(),
  defaultTile: z.number().int().min(0),
  /** 행 우선 2차원 배열. 사람이 읽기 쉽고 게임 쪽 로더도 그대로 쓸 수 있다. */
  rows: z.array(z.array(z.number().int().min(0))),
});

export const mapFileSchema = z
  .object({
    format: z.literal(FORMAT),
    version: z.number().int().min(1).max(FORMAT_VERSION),
    name: z.string(),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    tileset: z.array(tileDefSchema).min(1),
    layers: z.array(layerSchema).min(1),
  })
  .superRefine((doc, ctx) => {
    for (const layer of doc.layers) {
      if (layer.rows.length !== doc.height) {
        ctx.addIssue({
          code: 'custom',
          path: ['layers'],
          message: `레이어 '${layer.key}'의 행 수(${layer.rows.length})가 height(${doc.height})와 다릅니다.`,
        });
        continue;
      }
      const bad = layer.rows.findIndex((row) => row.length !== doc.width);
      if (bad >= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['layers'],
          message: `레이어 '${layer.key}'의 ${bad}번 행 길이(${layer.rows[bad].length})가 width(${doc.width})와 다릅니다.`,
        });
      }
    }
    for (const key of ['terrain', 'entity'] as const) {
      if (!doc.layers.some((l) => l.key === key)) {
        ctx.addIssue({ code: 'custom', path: ['layers'], message: `필수 레이어 '${key}'가 없습니다.` });
      }
    }
  });

export type MapFile = z.infer<typeof mapFileSchema>;
