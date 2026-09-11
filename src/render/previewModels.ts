import * as THREE from 'three';
import type { PreviewModel } from '@/core/brush';
import type { CellBox3D } from '@/core/layout3d';

/**
 * 3D 미리보기에 세우는 모델들.
 *
 * 브러쉬의 3D 미리보기 모델 타입(core/brush.ts)마다 어떤 모양을 세울지 여기서
 * 정한다. 게임 에셋을 흉내 내려는 게 아니라 "이 칸이 무슨 자리인지" 한눈에
 * 알아보게 하는 게 목적이라, 전부 상자·구·원뿔 같은 기본 도형만 조합한다.
 *
 * 재질은 장면 전체가 공유하고(모델마다 새로 만들면 같은 색 재질이 수십 개
 * 생긴다) 지오메트리는 모델마다 새로 만든다 — 지울 때는 disposeModel이
 * 지오메트리만 정리하고 재질은 장면이 끝날 때 한 번만 정리한다.
 *
 * 스스로 빛나는 부품(빛 열매, 시작 지점 고리, 정령·늑대·골렘의 눈, 골렘의 핵)에는
 * userData.glow를 달아 둔다. prepareShadows가 이 부품들을 그림자 계산에서 빼 준다 —
 * 빛을 내는 물체가 제 빛을 가리는 그림자를 드리우면 어색하다.
 */

const HERO_HEIGHT = 7;
const WORLD_TREE_HEIGHT = 36;
const TREE_SPIRIT_HEIGHT = 20.5;
const WOLF_HEIGHT = 4.1;
const GOLEM_HEIGHT = 8.2;
const PLANT_HEIGHT = 6.2;

/** 지역 장식물이 차지하는 대략적인 높이. 카메라와 그림자 범위를 맞추는 데 쓴다. */
export function propHeightOf(model: PreviewModel): number {
  switch (model) {
    case 'start-area':
      return HERO_HEIGHT;
    case 'safe-area':
      return WORLD_TREE_HEIGHT;
    case 'boss-area':
      return TREE_SPIRIT_HEIGHT;
    case 'monster':
      return WOLF_HEIGHT;
    case 'golem':
      return GOLEM_HEIGHT;
    case 'plant':
      return PLANT_HEIGHT;
    default:
      return 0;
  }
}

/** 장식물이 주변을 비추는 점광원. 장식물 발밑 기준 높이 y에 둔다. */
export interface PropLight {
  color: number;
  intensity: number;
  distance: number;
  y: number;
}

/**
 * 장식물마다 켜는 광원. 세계수는 빛 열매로 둘레를 밝히고, 나무 정령은 눈에서
 * 도는 호박빛을, 시작 지점은 푸른 빛을 낸다. 늑대·골렘·식충은 광원을 켜지
 * 않는다 — 한 맵에 여럿 놓이기 쉬운 잡몹이라 조명 예산(MAX_PROP_LIGHTS)을
 * 금방 다 먹는다. 대신 눈과 핵의 자체 발광만으로 티가 나게 했다.
 *
 * 장면에 톤 매핑이 없으므로, 세기는 발밑이 하얗게 날아가지 않을 만큼만 준다.
 */
export function propLightOf(model: PreviewModel): PropLight | null {
  switch (model) {
    case 'start-area':
      return { color: 0xa9d6ff, intensity: 60, distance: 20, y: 2.5 };
    case 'safe-area':
      return { color: 0xffe6a0, intensity: 1100, distance: 70, y: 15 };
    case 'boss-area':
      return { color: 0xffa83a, intensity: 320, distance: 34, y: 9 };
    default:
      return null;
  }
}

export interface PreviewMaterials {
  heroSkin: THREE.Material;
  heroTunic: THREE.Material;
  heroHair: THREE.Material;
  heroArmor: THREE.Material;
  heroBoot: THREE.Material;
  heroBlade: THREE.Material;
  heroHilt: THREE.Material;
  eyeDark: THREE.Material;
  spawnGlow: THREE.Material;
  treeBark: THREE.Material;
  treeLeaf: THREE.Material;
  treeLeafDark: THREE.Material;
  treeLeafLight: THREE.Material;
  treeGlow: THREE.Material;
  spiritBark: THREE.Material;
  spiritBarkDark: THREE.Material;
  spiritMoss: THREE.Material;
  spiritEye: THREE.Material;
  wolfFur: THREE.Material;
  wolfFurDark: THREE.Material;
  wolfFang: THREE.Material;
  wolfEye: THREE.Material;
  golemStone: THREE.Material;
  golemStoneDark: THREE.Material;
  golemCore: THREE.Material;
  golemMoss: THREE.Material;
  plantStem: THREE.Material;
  plantLeaf: THREE.Material;
  plantSkin: THREE.Material;
  plantMouth: THREE.Material;
  plantTooth: THREE.Material;
}

export function createPreviewMaterials(): PreviewMaterials {
  const solid = (color: number) => new THREE.MeshLambertMaterial({ color });
  const glow = (color: number, emissive: number) => new THREE.MeshLambertMaterial({ color, emissive });
  // 바위는 면이 각져 보여야 돌덩이 같다.
  const faceted = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  return {
    heroSkin: solid(0xf2cfae),
    heroTunic: solid(0x3a63c4),
    // 단발 껍질은 얼굴 쪽이 트여 있어 안쪽 면이 보일 수 있다. 양면으로 그린다.
    heroHair: new THREE.MeshLambertMaterial({ color: 0xf1eee8, side: THREE.DoubleSide }),
    heroArmor: solid(0xc8d0db),
    heroBoot: solid(0x4a3524),
    // 흰 머리와 섞이지 않도록 푸른 기가 도는 쇠 색으로 칠한다.
    heroBlade: solid(0xcfdbea),
    heroHilt: solid(0x8b5a2b),
    eyeDark: solid(0x1c2029),
    spawnGlow: glow(0xa8dcff, 0x5cb2ff),
    treeBark: solid(0x5a4029),
    treeLeaf: solid(0x4a8a42),
    treeLeafDark: solid(0x3a6f35),
    treeLeafLight: solid(0x68a24c),
    treeGlow: glow(0xfff1a8, 0xffd966),
    spiritBark: solid(0x4b3823),
    spiritBarkDark: solid(0x33261a),
    spiritMoss: solid(0x4d7b3c),
    spiritEye: glow(0xffb648, 0xff9a20),
    // 검은 늑대지만 완전히 새까맣게 두면 어두운 잔디 위에서 실루엣이 뭉개진다.
    wolfFur: solid(0x2b2e36),
    wolfFurDark: solid(0x1a1c22),
    wolfFang: solid(0xe8e4d8),
    wolfEye: glow(0xffd24a, 0xffab00),
    golemStone: faceted(0x6b6f78),
    golemStoneDark: faceted(0x4a4e56),
    golemCore: glow(0x7fe4ff, 0x2ab8ff),
    golemMoss: solid(0x4d7b3c),
    plantStem: solid(0x3f7a35),
    plantLeaf: solid(0x4f9440),
    plantSkin: solid(0xa63350),
    plantMouth: solid(0xd4657a),
    plantTooth: solid(0xf2e8d5),
  };
}

export function disposePreviewMaterials(materials: PreviewMaterials): void {
  for (const material of Object.values(materials)) material.dispose();
}

/** 모델 하나를 지운다. 재질은 공유하므로 지오메트리만 정리한다. */
export function disposeModel(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

/** 그림자를 드리우고 받게 한다. 스스로 빛나는 부품은 뺀다. */
export function prepareShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const glowing = child.userData.glow === true;
    mesh.castShadow = !glowing;
    mesh.receiveShadow = !glowing;
  });
}

function part(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);

/** base에서 direction 쪽으로 비스듬히 뻗는 원기둥 하나. 좁은 쪽(+Y)이 끝을 향한다. */
function limb(
  base: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  baseRadius: number,
  tipRadius: number,
  material: THREE.Material,
): THREE.Mesh {
  const dir = direction.clone().normalize();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(tipRadius, baseRadius, length, 10), material);
  mesh.quaternion.setFromUnitVectors(UP, dir);
  mesh.position.copy(base).addScaledVector(dir, length / 2);
  return mesh;
}

/**
 * 특수지역 문. 가운데서 좌우로 갈라져 양옆 벽 속 주머니로 밀려 들어가는
 * 포켓 도어를 조금 열린 채로 세운다.
 *
 * 문짝이 숨는 양옆 벽은 앞뒤 두 겹으로 짓고 그 사이를 비워 둔다. 문짝은 그
 * 틈에 끼워진 채 바깥쪽으로 조금 밀려 있어서, 일부가 벽 속으로 사라진 게 보인다.
 * 색은 특수지역 벽과 같은 재질을 그대로 받아 쓴다 — 벽의 일부로 읽혀야 하고,
 * 문짝은 색이 아니라 벽면보다 한 겹 들어간 깊이로 구분된다.
 *
 * 칸이 놓인 방향(가로로 긴 벽인지 세로로 긴 벽인지)은 마지막에 그룹을 통째로
 * 돌려서 맞춘다 — 부품 좌표를 두 벌 만들 필요가 없다.
 */
export function buildDoor(material: THREE.Material, box: CellBox3D, height: number): THREE.Group {
  const group = new THREE.Group();
  const along = Math.max(box.sx, box.sz);
  const thick = Math.min(box.sx, box.sz);

  const beamHeight = Math.min(1.8, height * 0.16);
  const doorHeight = height - beamHeight;
  // 양옆 벽 하나의 폭. 문짝(= 문 폭의 절반)이 통째로 들어갈 만큼 깊어야 한다.
  const jamb = along * 0.28;
  const opening = along - jamb * 2;
  const slot = thick * 0.32;
  const skin = (thick - slot) / 2;
  const panelWidth = opening / 2;
  // 문짝 하나가 주머니 쪽으로 밀려 들어간 거리. 가운데 틈이 이 값의 두 배가 된다.
  const slide = opening * 0.18;

  // 양옆 벽과 문 위를 한 번에 덮는 들보. 주머니의 윗면도 이것이 막는다.
  group.add(part(new THREE.BoxGeometry(along, beamHeight, thick), material, 0, height - beamHeight / 2, 0));

  for (const side of [-1, 1]) {
    const jambX = (side * (along - jamb)) / 2;
    for (const face of [-1, 1]) {
      group.add(
        part(new THREE.BoxGeometry(jamb, doorHeight, skin), material, jambX, doorHeight / 2, (face * (slot + skin)) / 2),
      );
    }
    // 바깥쪽 끝을 막아 주머니 속이 반대편으로 뚫려 보이지 않게 한다.
    const capWidth = Math.min(0.5, jamb * 0.12);
    group.add(
      part(new THREE.BoxGeometry(capWidth, doorHeight, slot), material, (side * (along - capWidth)) / 2, doorHeight / 2, 0),
    );

    const panelHeight = doorHeight - 0.08;
    group.add(
      part(
        new THREE.BoxGeometry(panelWidth, panelHeight, slot * 0.8),
        material,
        side * (panelWidth / 2 + slide),
        panelHeight / 2,
        0,
      ),
    );
  }

  if (box.sz > box.sx) group.rotation.y = Math.PI / 2;
  group.position.set(box.cx, 0, box.cz);
  return group;
}

/**
 * 용사: 검을 든 흰 단발머리 여성 용사. 발밑에 푸르게 빛나는 고리를 깔아 시작
 * 지점임을 드러낸다.
 *
 * 얼굴은 가는 눈매와 안쪽으로 내려온 눈썹, 굳게 다문 입으로 잡는다. 눈을 크고
 * 동그랗게 그리면 곧바로 귀여운 인상이 되므로 일부러 납작한 상자로 만든다.
 * 세워 둔 방향은 기본 카메라의 반대쪽 — 미로 안쪽을 바라본다.
 */
export function buildHero(materials: PreviewMaterials): THREE.Group {
  const group = new THREE.Group();
  const legHeight = 1.7;
  const skirtHeight = 1.2;
  const torsoBottom = 2.6;
  const torsoHeight = 1.6;
  const torsoTop = torsoBottom + torsoHeight;
  const headRadius = 1.5;
  const headY = torsoTop + headRadius * 0.8;

  for (const side of [-1, 1]) {
    group.add(part(new THREE.BoxGeometry(0.62, legHeight, 0.7), materials.heroBoot, side * 0.5, legHeight / 2, 0));
  }
  group.add(
    part(new THREE.CylinderGeometry(1.15, 1.55, skirtHeight, 20), materials.heroTunic, 0, legHeight + skirtHeight / 2 - 0.15, 0),
  );
  group.add(part(new THREE.BoxGeometry(2, torsoHeight, 1.25), materials.heroTunic, 0, torsoBottom + torsoHeight / 2, 0));
  group.add(part(new THREE.BoxGeometry(1.6, 0.95, 0.22), materials.heroArmor, 0, torsoBottom + torsoHeight * 0.62, 0.68));

  for (const side of [-1, 1]) {
    group.add(part(new THREE.BoxGeometry(0.5, 1.7, 0.5), materials.heroSkin, side * 1.27, torsoTop - 0.95, 0));
  }

  group.add(part(new THREE.SphereGeometry(headRadius, 24, 18), materials.heroSkin, 0, headY, 0));

  // 흰 단발: 얼굴 쪽만 비워 둔 껍질로 뒤통수와 옆머리를 턱 높이까지 덮고, 이마에
  // 앞머리를 따로 얹는다. three의 구는 phi = π/2 방향이 +z, 곧 얼굴 쪽이다.
  const faceHalf = 0.95;
  const bob = new THREE.SphereGeometry(
    headRadius * 1.08,
    28,
    18,
    Math.PI / 2 + faceHalf,
    Math.PI * 2 - faceHalf * 2,
    0,
    Math.PI * 0.7,
  );
  group.add(part(bob, materials.heroHair, 0, headY + 0.05, 0));
  const bangs = new THREE.SphereGeometry(headRadius * 1.09, 20, 8, Math.PI / 2 - faceHalf, faceHalf * 2, 0, Math.PI * 0.4);
  group.add(part(bangs, materials.heroHair, 0, headY + 0.05, 0));

  for (const side of [-1, 1]) {
    // 눈꼬리는 올리고 눈썹 안쪽 끝은 내려 매서운 인상을 만든다.
    const eye = part(new THREE.BoxGeometry(0.46, 0.14, 0.08), materials.eyeDark, side * 0.52, headY - 0.02, headRadius * 0.94);
    eye.rotation.z = side * 0.18;
    group.add(eye);
    const brow = part(new THREE.BoxGeometry(0.54, 0.12, 0.08), materials.eyeDark, side * 0.54, headY + 0.44, headRadius * 0.92);
    brow.rotation.z = side * 0.42;
    group.add(brow);
  }
  group.add(part(new THREE.BoxGeometry(0.4, 0.09, 0.08), materials.eyeDark, 0, headY - 0.66, headRadius * 0.9));

  // 오른손에 쥔 검. 곧게 세우면 칼날이 흰 머리 바로 앞에 겹쳐 묻히므로, 손을
  // 축으로 바깥쪽으로 비스듬히 기울여 칼날이 머리 윤곽 밖으로 나오게 한다.
  const sword = new THREE.Group();
  sword.position.set(1.27, torsoTop - 1.8, 0.3);
  sword.rotation.z = -0.35;
  sword.add(part(new THREE.BoxGeometry(0.26, 0.8, 0.26), materials.heroHilt, 0, 0.2, 0));
  sword.add(part(new THREE.BoxGeometry(1.1, 0.22, 0.28), materials.heroHilt, 0, 0.65, 0));
  sword.add(part(new THREE.BoxGeometry(0.42, 3.2, 0.12), materials.heroBlade, 0, 2.36, 0));
  group.add(sword);

  const ring = part(new THREE.RingGeometry(2, 2.45, 40), materials.spawnGlow, 0, 0.05, 0);
  ring.rotation.x = -Math.PI / 2;
  ring.userData.glow = true;
  group.add(ring);

  // 기본 카메라를 등지고 미로 안쪽을 바라보게 돌려 세운다.
  group.rotation.y = Math.PI;
  return group;
}

/**
 * 세계수: 굵은 줄기가 땅을 움켜쥔 뿌리 위로 솟고, 외곽 벽보다 높은 곳에 넓은
 * 수관을 펼친다. 수관 아래에 매단 빛 열매가 둘레를 은은하게 밝힌다. 칸 하나보다
 * 훨씬 커서 이웃 방 위까지 가지를 드리운다 — 멀리서도 쉬어 갈 자리를 알아보게
 * 하려는 것이다. 수관은 벽보다 한참 위에 떠 있어서 아래의 미로를 가리는 건
 * 위에서 내려다볼 때뿐이다.
 */
export function buildWorldTree(materials: PreviewMaterials): THREE.Group {
  const group = new THREE.Group();
  const trunkHeight = 18;
  group.add(part(new THREE.CylinderGeometry(2.3, 4.2, trunkHeight, 18), materials.treeBark, 0, trunkHeight / 2, 0));

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    group.add(
      limb(
        new THREE.Vector3(Math.cos(a) * 3.2, 2.4, Math.sin(a) * 3.2),
        new THREE.Vector3(Math.cos(a), -0.42, Math.sin(a)),
        9,
        1.7,
        0.3,
        materials.treeBark,
      ),
    );
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    group.add(
      limb(
        new THREE.Vector3(Math.cos(a) * 1.6, 13 + (i % 2) * 2.2, Math.sin(a) * 1.6),
        new THREE.Vector3(Math.cos(a), 0.75, Math.sin(a)),
        11,
        1.2,
        0.4,
        materials.treeBark,
      ),
    );
  }

  const leaves = [materials.treeLeaf, materials.treeLeafDark, materials.treeLeafLight];
  const clump = (radius: number, x: number, y: number, z: number, flatten: number, material: THREE.Material) => {
    const mesh = part(new THREE.SphereGeometry(radius, 18, 14), material, x, y, z);
    mesh.scale.set(1, flatten, 1);
    group.add(mesh);
  };
  // 넓고 납작한 돔을 가운데 두고, 둘레와 위쪽에 덩어리를 붙여 우산처럼 펼친다.
  clump(11, 0, 24, 0, 0.58, materials.treeLeaf);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    clump(6.5, Math.cos(a) * 11, 21 + (i % 3) * 0.8, Math.sin(a) * 11, 0.72, leaves[i % 3]);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.7;
    clump(5.5, Math.cos(a) * 5.5, 28, Math.sin(a) * 5.5, 0.8, leaves[(i + 1) % 3]);
  }
  clump(5.5, 0, 31, 0, 0.85, materials.treeLeafLight);

  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 7 + (i % 3) * 3;
    const orb = part(new THREE.SphereGeometry(0.6, 10, 8), materials.treeGlow, Math.cos(a) * r, 14.5 + (i % 4) * 0.6, Math.sin(a) * r);
    orb.userData.glow = true;
    group.add(orb);
  }

  return group;
}

/**
 * 나무 정령: 보스 자리에 서는 거대한 나무 정령.
 *
 * 뿌리로 된 다리 위에 굵은 몸통이 서고, 몸통 표면에 움푹 팬 눈두덩과 호박빛
 * 눈, 갈라진 입이 있다. 팔은 두 마디로 꺾인 굵은 가지이고 끝에는 잔가지 손가락이
 * 달렸다. 머리 위에는 수관이 얹혀 세계수와 같은 계열로 보이게 한다.
 */
export function buildTreeSpirit(materials: PreviewMaterials): THREE.Group {
  const group = new THREE.Group();
  const legHeight = 4.5;
  const bodyHeight = 8;
  const bodyTop = legHeight + bodyHeight;
  // 머리를 몸통 위에 따로 얹는다. 수관을 몸통에 바로 씌우면 그루터기에 모자를
  // 씌운 꼴이 되어 정령의 머리가 어디인지 알 수 없다.
  const headY = bodyTop + 1.9;

  for (const side of [-1, 1]) {
    group.add(part(new THREE.CylinderGeometry(1.4, 2.2, legHeight, 12), materials.spiritBark, side * 2, legHeight / 2, 0));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      group.add(
        limb(
          new THREE.Vector3(side * 2 + Math.cos(a) * 1.2, 1.2, Math.sin(a) * 1.2),
          new THREE.Vector3(Math.cos(a), -0.55, Math.sin(a)),
          2.8,
          0.62,
          0.16,
          materials.spiritBarkDark,
        ),
      );
    }
  }

  group.add(part(new THREE.CylinderGeometry(2.2, 3.2, bodyHeight, 16), materials.spiritBark, 0, legHeight + bodyHeight / 2, 0));
  // 몸통에 낀 이끼
  for (const [x, y, z] of [
    [-1.7, 7, 1.9],
    [2, 9.4, 1.3],
    [0.3, 6, -2.2],
  ]) {
    const moss = part(new THREE.SphereGeometry(1.1, 12, 8), materials.spiritMoss, x, y, z);
    moss.scale.set(1, 0.7, 0.35);
    group.add(moss);
  }

  // 어깨 옹이
  for (const side of [-1, 1]) {
    group.add(part(new THREE.SphereGeometry(1.5, 14, 10), materials.spiritBark, side * 2.5, bodyTop - 0.6, 0));
  }

  // 머리와 얼굴
  group.add(part(new THREE.CylinderGeometry(1.75, 2.05, 3, 14), materials.spiritBark, 0, headY, 0));
  const faceZ = 1.75;
  for (const side of [-1, 1]) {
    const socket = part(new THREE.SphereGeometry(0.72, 12, 10), materials.spiritBarkDark, side * 0.8, headY + 0.35, faceZ - 0.45);
    socket.scale.set(1, 0.85, 0.5);
    group.add(socket);

    const eye = part(new THREE.SphereGeometry(0.36, 12, 10), materials.spiritEye, side * 0.8, headY + 0.35, faceZ - 0.15);
    eye.userData.glow = true;
    group.add(eye);

    const brow = part(new THREE.BoxGeometry(1.3, 0.4, 0.6), materials.spiritBarkDark, side * 0.82, headY + 1.15, faceZ - 0.35);
    brow.rotation.z = side * 0.32;
    group.add(brow);
  }
  group.add(part(new THREE.BoxGeometry(1.7, 0.55, 0.5), materials.spiritBarkDark, 0, headY - 0.85, faceZ - 0.35));

  // 두 마디로 꺾인 굵은 가지 팔과 잔가지 손가락
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 2.5, bodyTop - 0.6, 0);
    const upperDir = new THREE.Vector3(side, -0.15, 0.2);
    group.add(limb(shoulder, upperDir, 4.4, 1.15, 0.8, materials.spiritBark));

    const elbow = shoulder.clone().addScaledVector(upperDir.clone().normalize(), 4.4);
    const foreDir = new THREE.Vector3(side * 0.25, -1, 0.35);
    group.add(limb(elbow, foreDir, 4, 0.8, 0.5, materials.spiritBark));

    const hand = elbow.clone().addScaledVector(foreDir.clone().normalize(), 4);
    for (let i = 0; i < 3; i++) {
      const spread = (i - 1) * 0.5;
      group.add(
        limb(hand, new THREE.Vector3(side * 0.35 + spread, -0.85, 0.4 + spread * 0.4), 1.8, 0.24, 0.07, materials.spiritBarkDark),
      );
    }
  }

  // 머리 뒤·위로 얹은 수관. 얼굴을 가리지 않도록 뒤쪽으로 물려 둔다.
  const crown: Array<[radius: number, x: number, y: number, z: number]> = [
    [3.2, 0, headY + 2.6, -0.8],
    [2.4, -2.6, headY + 1.7, -1.4],
    [2.4, 2.6, headY + 1.9, -1.2],
    [2.1, 0.5, headY + 4.2, -0.4],
  ];
  crown.forEach(([radius, x, y, z], i) => {
    const leaf = part(new THREE.SphereGeometry(radius, 16, 12), i % 2 === 0 ? materials.treeLeaf : materials.spiritMoss, x, y, z);
    leaf.scale.set(1, 0.85, 1);
    group.add(leaf);
  });

  return group;
}

/** 늑대: 검은 털에 노란 눈이 빛나는 네발 짐승. 기본 카메라 쪽을 바라본다. */
export function buildWolf(materials: PreviewMaterials): THREE.Group {
  const group = new THREE.Group();
  const bodyY = 2;

  group.add(part(new THREE.BoxGeometry(1.5, 1.35, 3.2), materials.wolfFur, 0, bodyY, 0));
  group.add(part(new THREE.BoxGeometry(1.65, 1.45, 1.2), materials.wolfFur, 0, bodyY + 0.05, 1.1));

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(part(new THREE.BoxGeometry(0.42, 1.35, 0.46), materials.wolfFurDark, sx * 0.52, 0.68, sz * 1.15));
    }
  }

  const neck = part(new THREE.BoxGeometry(0.95, 0.95, 1.1), materials.wolfFur, 0, bodyY + 0.5, 1.75);
  neck.rotation.x = -0.25;
  group.add(neck);

  const headY = bodyY + 0.95;
  group.add(part(new THREE.BoxGeometry(1.05, 0.95, 1.15), materials.wolfFur, 0, headY, 2.3));
  group.add(part(new THREE.BoxGeometry(0.6, 0.55, 0.8), materials.wolfFurDark, 0, headY - 0.22, 3.05));
  group.add(part(new THREE.SphereGeometry(0.16, 10, 8), materials.eyeDark, 0, headY - 0.08, 3.45));

  for (const side of [-1, 1]) {
    const ear = part(new THREE.ConeGeometry(0.28, 0.7, 10), materials.wolfFurDark, side * 0.34, headY + 0.72, 2.15);
    ear.rotation.z = side * 0.2;
    group.add(ear);

    const eye = part(new THREE.SphereGeometry(0.15, 10, 8), materials.wolfEye, side * 0.3, headY + 0.12, 2.83);
    eye.userData.glow = true;
    group.add(eye);

    const fang = part(new THREE.ConeGeometry(0.08, 0.3, 8), materials.wolfFang, side * 0.18, headY - 0.52, 3.3);
    fang.rotation.x = Math.PI;
    group.add(fang);
  }

  group.add(limb(new THREE.Vector3(0, bodyY + 0.2, -1.6), new THREE.Vector3(0, 0.45, -1), 2, 0.34, 0.12, materials.wolfFurDark));

  return group;
}

/** 골렘: 이끼 낀 돌덩이를 쌓아 만든 몸에 푸른 핵이 박혀 있다. */
export function buildGolem(materials: PreviewMaterials): THREE.Group {
  const group = new THREE.Group();
  const rock = (radius: number) => new THREE.IcosahedronGeometry(radius, 0);

  for (const side of [-1, 1]) {
    group.add(part(new THREE.BoxGeometry(1.5, 2.4, 1.5), materials.golemStoneDark, side * 1.25, 1.2, 0));
    group.add(part(rock(0.95), materials.golemStone, side * 1.25, 2.5, 0));
  }

  const torso = part(rock(2.6), materials.golemStone, 0, 4.7, 0);
  torso.scale.set(1.05, 0.95, 0.85);
  group.add(torso);

  const core = part(rock(0.62), materials.golemCore, 0, 4.7, 1.95);
  core.userData.glow = true;
  group.add(core);

  for (const side of [-1, 1]) {
    group.add(part(rock(1.25), materials.golemStoneDark, side * 2.55, 5.7, 0));

    const arm = part(new THREE.BoxGeometry(1.05, 2.5, 1.05), materials.golemStone, side * 2.75, 4, 0);
    arm.rotation.z = side * 0.12;
    group.add(arm);

    group.add(part(rock(1.15), materials.golemStone, side * 2.95, 2.2, 0));

    const moss = part(new THREE.SphereGeometry(0.85, 12, 8), materials.golemMoss, side * 2.5, 6.45, 0);
    moss.scale.set(1, 0.4, 0.9);
    group.add(moss);
  }

  group.add(part(rock(1.15), materials.golemStoneDark, 0, 6.85, 0));
  for (const side of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.17, 10, 8), materials.golemCore, side * 0.4, 6.9, 0.95);
    eye.userData.glow = true;
    group.add(eye);
  }

  return group;
}

/**
 * 식충: 바닥에 퍼진 잎에서 줄기가 솟고, 그 끝에 이빨이 난 입이 벌어져 있다.
 * 위아래 턱은 반구를 각각 돌려 벌린 것이고, 이빨은 턱과 함께 움직이도록 턱
 * 그룹의 자식으로 붙인다.
 */
export function buildPlant(materials: PreviewMaterials): THREE.Group {
  const group = new THREE.Group();

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const leaf = part(
      new THREE.SphereGeometry(1.25, 12, 8),
      i % 2 === 0 ? materials.plantLeaf : materials.treeLeafDark,
      Math.cos(a) * 1.5,
      0.3,
      Math.sin(a) * 1.5,
    );
    leaf.scale.set(1, 0.22, 1.5);
    leaf.rotation.y = -a;
    group.add(leaf);
  }

  const stemHeight = 3.6;
  const stem = part(new THREE.CylinderGeometry(0.42, 0.85, stemHeight, 12), materials.plantStem, 0, stemHeight / 2, -0.2);
  stem.rotation.x = 0.12;
  group.add(stem);

  const headY = stemHeight + 0.9;
  const throat = part(new THREE.SphereGeometry(0.95, 14, 10), materials.plantMouth, 0, headY, 0.25);
  throat.scale.set(1, 0.7, 1);
  group.add(throat);

  for (const flip of [1, -1]) {
    const jaw = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      materials.plantSkin,
    );
    dome.scale.set(1, 0.95, 1.15);
    // 아래턱은 반구를 뒤집어 그릇 모양으로 쓴다. 음수 배율은 면이 뒤집히므로 회전으로 처리한다.
    if (flip < 0) dome.rotation.x = Math.PI;
    jaw.add(dome);

    for (let i = 0; i < 7; i++) {
      const a = -0.95 + (i / 6) * 1.9;
      const tooth = part(new THREE.ConeGeometry(0.14, 0.42, 8), materials.plantTooth, Math.sin(a) * 1.2, 0, Math.cos(a) * 1.35);
      if (flip > 0) tooth.rotation.x = Math.PI;
      jaw.add(tooth);
    }

    jaw.position.set(0, headY, 0.25);
    jaw.rotation.x = flip > 0 ? -0.75 : 0.45;
    group.add(jaw);
  }

  for (const side of [-1, 1]) {
    const spot = part(new THREE.SphereGeometry(0.2, 10, 8), materials.plantTooth, side * 0.65, headY + 0.8, 0.55);
    spot.scale.set(1, 0.6, 0.5);
    group.add(spot);
  }

  return group;
}

/** 지역 장식물 모델 하나를 만든다. 장식물이 아닌 모델이면 null. */
export function buildProp(model: PreviewModel, materials: PreviewMaterials): THREE.Group | null {
  switch (model) {
    case 'start-area':
      return buildHero(materials);
    case 'safe-area':
      return buildWorldTree(materials);
    case 'boss-area':
      return buildTreeSpirit(materials);
    case 'monster':
      return buildWolf(materials);
    case 'golem':
      return buildGolem(materials);
    case 'plant':
      return buildPlant(materials);
    default:
      return null;
  }
}
