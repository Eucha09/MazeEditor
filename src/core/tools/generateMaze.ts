import type { Brush } from '../brush';
import { brushIndex, findBrushById } from '../brush';
import { cellKind } from '../lattice';
import { cellIndex, getLayer } from '../tilemap';
import type { MapDoc } from '../types';
import { TERRAIN_EMPTY, TERRAIN_NONE, TERRAIN_WALL } from '../types';

const DY = [-1, 1, 0, 0];
const DX = [0, 0, -1, 1];

/** Unity의 Random.Range(min, max) (정수, min 포함 max 미포함)와 동일하게 맞춘다. */
function randomRange(minInclusive: number, maxExclusive: number): number {
  return Math.floor(minInclusive + Math.random() * (maxExclusive - minInclusive));
}

/**
 * 다음에 시도할 방향의 우선순위를 정한다. 참고한 원본 코드를 그대로 옮긴 것으로,
 * 4방향 중 3개(인덱스 0~2)만 "이미 뚫린 칸으로 이어지는지" 검사해 앞으로 당기고,
 * 나머지는 무작위로 섞는다 — 방향 배열이 매 호출마다 이어서 쓰이므로 남은 한
 * 칸(인덱스 3)은 이번 호출에서는 우선순위 검사 없이 넘어가지만, 다음 호출들에서
 * 무작위 교환을 통해 결국 골고루 섞인다. 미로 생김새가 원본과 같아야 하므로
 * 이 비대칭을 "버그"로 보고 고치지 않는다.
 */
function randomDir(direction: number[], cx: number, cy: number, tile: Uint8Array, width: number, height: number): void {
  let idx = 0;
  for (let i = 0; i < 3; i++) {
    const ny = cy + DY[direction[i]];
    const nx = cx + DX[direction[i]];
    if (ny < 0 || height <= ny || nx < 0 || width <= nx) continue;

    if (tile[ny * width + nx] === TERRAIN_EMPTY) {
      const temp = direction[i];
      direction[i] = direction[idx];
      direction[idx] = temp;
      idx++;
    }
  }

  for (let i = idx; i < 3; i++) {
    const randIdx = randomRange(i, 4);
    const temp = direction[i];
    direction[i] = direction[randIdx];
    direction[randIdx] = temp;
  }
}

export interface MazeGenerationResult {
  /** 새로 만들어진 지형 타입 격자. doc.terrainType과 길이·의미가 같다. */
  terrainType: Uint8Array;
  /** 시드로 쓰인 칸의 수. 0이면 아무것도 생성되지 않는다. */
  seedCount: number;
}

/**
 * Recursive Backtracking (Parallel Seeds) 미로 생성.
 *
 * 엔티티 타입이 Seed인 칸들을 각자의 시작점으로 삼아 동시에 길을 뚫어 나간다.
 * 길을 뚫다가 다른 시드에서 뻗어 온 길과 마주치면(칸 사이 벽이 아직 뚫리지
 * 않았을 때) 10% 확률로 그 벽도 뚫어서 서로 다른 시드의 영역을 이어 준다.
 *
 * 문서를 직접 바꾸지 않고 새 지형 타입 배열만 돌려준다 — 미리보기 용도라
 * 맵 파일(doc)에는 아무 영향을 주지 않는다.
 */
export function generateMazePreview(doc: MapDoc, brushes: Brush[]): MazeGenerationResult {
  const { width, height } = doc;
  const index = brushIndex(brushes);
  const entityBrushIds = getLayer(doc, 'entity').brush;

  const tile = new Uint8Array(width * height);
  // 0 = 아직 안 뚫림, 1 = 벽(영구히 못 지나감), 2 이상 = (시드 인덱스 + 2)가 차지한 칸.
  const visited = new Int32Array(width * height);
  const stacks: number[][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = cellIndex(x, y, width);
      const entityBrush = entityBrushIds[i] ? findBrushById(index, entityBrushIds[i]) : undefined;

      if (entityBrush?.entityType === 'seed') {
        tile[i] = TERRAIN_EMPTY;
        stacks.push([i]);
        visited[i] = stacks.length + 1;
      } else if (doc.terrainType[i] === TERRAIN_WALL) {
        tile[i] = TERRAIN_WALL;
        visited[i] = 1;
      } else if (doc.terrainType[i] === TERRAIN_NONE) {
        // floor 칸은 항상 지나갈 수 있어야 하므로 Empty, 나머지(wall·pillar)는 Wall로 확정한다.
        tile[i] = cellKind(doc, x, y) === 'floor' ? TERRAIN_EMPTY : TERRAIN_WALL;
      } else {
        tile[i] = doc.terrainType[i];
      }
    }
  }

  const direction = [0, 1, 2, 3];
  let loop = true;
  while (loop) {
    loop = false;
    for (let s = 0; s < stacks.length; s++) {
      const stack = stacks[s];
      if (stack.length === 0) continue;
      loop = true;

      const curIndex = stack[stack.length - 1];
      const cx = curIndex % width;
      const cy = (curIndex - cx) / width;
      let linkIndex = -1;

      randomDir(direction, cx, cy, tile, width, height);
      let carved = false;
      for (const dir of direction) {
        const wy = cy + DY[dir];
        const wx = cx + DX[dir];
        const ny = cy + DY[dir] * 2;
        const nx = cx + DX[dir] * 2;
        if (ny < 0 || height <= ny || nx < 0 || width <= nx) continue;

        const wallIndex = wy * width + wx;
        const nextIndex = ny * width + nx;

        if (visited[wallIndex] === 0 && visited[nextIndex] === 0) {
          tile[wallIndex] = TERRAIN_EMPTY;
          visited[nextIndex] = s + 2;
          stack.push(nextIndex);
          carved = true;
          break;
        } else if (visited[wallIndex] === 0 && visited[nextIndex] > 1 && visited[nextIndex] !== s + 2) {
          linkIndex = wallIndex;
        }
      }

      if (!carved) {
        stack.pop();
        if (linkIndex !== -1 && Math.random() < 0.1) {
          tile[linkIndex] = TERRAIN_EMPTY;
        }
      }
    }
  }

  return { terrainType: tile, seedCount: stacks.length };
}
