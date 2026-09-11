import { z } from 'zod';
import { OBJECT_ID_MAX, OBJECT_ID_MIN } from '../types';

export const FORMAT = 'maze-editor';
export const FORMAT_VERSION = 3;

/** 행 우선 2차원 배열. 사람이 읽기 쉽고 게임 쪽 로더도 그대로 쓸 수 있다. */
const rowsSchema = z.array(z.array(z.number().int().min(0)));

/**
 * 오브젝트 ID 격자. 음수도 받되, 맵 격자(Int32Array)에 담기는 범위를 넘으면
 * 거부한다 — 여기서 몰래 잘라 내면 게임 데이터가 조용히 바뀐다.
 *
 * 음수를 받게 되면서 FORMAT_VERSION은 올리지 않았다. 예전 파일은 전부 그대로
 * 통과하는 확장이고, 음수가 든 새 파일을 예전 에디터가 열면 그쪽 스키마에 걸려
 * 이유와 함께 거부되므로 조용히 깨지는 일도 없다. 버전을 올리면 음수가 하나도
 * 없는 파일까지 예전 에디터가 못 열게 될 뿐이다.
 */
const objectRowsSchema = z.array(z.array(z.number().int().min(OBJECT_ID_MIN).max(OBJECT_ID_MAX)));

/**
 * 맵 파일에는 지형 타입·오브젝트 ID·브러쉬 id가 들어간다.
 * 브러쉬 설정(이름·색·규칙 등)은 맵과 무관하게 따로 보관하므로 여기 포함하지
 * 않는다 (io/brushes.ts). 브러쉬 id만 남기는 이유는, 맵을 다시 열었을 때 각 칸이
 * 어떤 브러쉬로 칠해졌는지 알 수 있게 하기 위해서다 (게임은 이 값을 쓰지 않는다).
 */
export const mapFileSchema = z
  .object({
    format: z.literal(FORMAT),
    version: z.number().int().min(1).max(FORMAT_VERSION),
    name: z.string(),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    terrain: z.object({
      /** 0 = None, 1 = Empty, 2 = Wall */
      type: rowsSchema,
      object: objectRowsSchema,
      brush: rowsSchema,
    }),
    entity: z.object({
      object: objectRowsSchema,
      brush: rowsSchema,
    }),
  })
  .superRefine((doc, ctx) => {
    const grids: Array<[string, number[][]]> = [
      ['terrain.type', doc.terrain.type],
      ['terrain.object', doc.terrain.object],
      ['terrain.brush', doc.terrain.brush],
      ['entity.object', doc.entity.object],
      ['entity.brush', doc.entity.brush],
    ];

    for (const [label, rows] of grids) {
      if (rows.length !== doc.height) {
        ctx.addIssue({
          code: 'custom',
          path: [label],
          message: `${label}의 행 수(${rows.length})가 height(${doc.height})와 다릅니다.`,
        });
        continue;
      }
      const bad = rows.findIndex((row) => row.length !== doc.width);
      if (bad >= 0) {
        ctx.addIssue({
          code: 'custom',
          path: [label],
          message: `${label}의 ${bad}번 행 길이(${rows[bad].length})가 width(${doc.width})와 다릅니다.`,
        });
      }
    }

    const badType = doc.terrain.type.findIndex((row) => row.some((v) => v > 2));
    if (badType >= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['terrain.type'],
        message: `지형 타입은 0(None), 1(Empty), 2(Wall)만 쓸 수 있습니다. ${badType}번 행을 확인하세요.`,
      });
    }
  });

export type MapFile = z.infer<typeof mapFileSchema>;
