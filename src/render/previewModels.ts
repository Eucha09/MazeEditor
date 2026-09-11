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
 * 스스로 빛나는 부품(빛 열매, 시작 지점 고리, 정령·늑대·골렘의 눈, 골렘의 핵,
 * 석상의 보석)에는
 * userData.glow를 달아 둔다. prepareShadows가 이 부품들을 그림자 계산에서 빼 준다 —
 * 빛을 내는 물체가 제 빛을 가리는 그림자를 드리우면 어색하다.
 */

const HERO_HEIGHT = 7;
const WORLD_TREE_HEIGHT = 36;
const TREE_SPIRIT_HEIGHT = 17.5;
const WOLF_HEIGHT = 4.1;
const GOLEM_HEIGHT = 8.2;
const PLANT_HEIGHT = 6.2;
const STATUE_HEIGHT = 16;

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
    case 'statue':
      return STATUE_HEIGHT;
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
 * 도는 호박빛을, 시작 지점은 푸른 빛을 낸다. 늑대·골렘·식충·석상은 광원을 켜지
 * 않는다 — 한 맵에 여럿 놓이기 쉬운 잡몹·장식이라 조명 예산(MAX_PROP_LIGHTS)을
 * 금방 다 먹는다. 대신 눈과 핵, 보석의 자체 발광만으로 티가 나게 했다.
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
  spiritMossDark: THREE.Material;
  spiritEye: THREE.Material;
  spiritMaw: THREE.Material;
  spiritTooth: THREE.Material;
  spiritClaw: THREE.Material;
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
  statueStone: THREE.Material;
  statueStoneDark: THREE.Material;
  statueGold: THREE.Material;
  statueGem: THREE.Material;
  statuePlate: THREE.Material;
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
    spiritMossDark: solid(0x386030),
    spiritEye: glow(0xffb648, 0xff9a20),
    spiritMaw: solid(0x1d150e),
    spiritTooth: solid(0xe9dcc6),
    // 손발 끝만 밝은 속살 색으로 두면 어두운 껍질 몸에서 갈퀴가 도드라진다.
    spiritClaw: solid(0xc0a087),
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
    // 돌이지만 회색으로만 두면 벽과 구분이 안 된다. 보라 기가 도는 돌로 칠한다.
    statueStone: solid(0x675f7a),
    statueStoneDark: solid(0x4a4459),
    statueGold: solid(0xbf9d52),
    statueGem: glow(0xb98cf5, 0x7a3fd0),
    statuePlate: solid(0xe4e2ec),
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
 * 포켓 도어다. open이면 문짝이 주머니 속으로 물러나 통로가 트인 모습으로,
 * 아니면 가운데서 맞물려 닫힌 모습으로 세운다.
 *
 * 문짝이 숨는 양옆 벽은 앞뒤 두 겹으로 짓고 그 사이를 비워 둔다. 문짝은 그
 * 틈에 끼워져 있어서, 열리면 일부가 벽 속으로 사라진 게 보인다.
 * 색은 특수지역 벽과 같은 재질을 그대로 받아 쓴다 — 벽의 일부로 읽혀야 하고,
 * 문짝은 색이 아니라 벽면보다 한 겹 들어간 깊이로 구분된다.
 *
 * 칸이 놓인 방향(가로로 긴 벽인지 세로로 긴 벽인지)은 마지막에 그룹을 통째로
 * 돌려서 맞춘다 — 부품 좌표를 두 벌 만들 필요가 없다.
 */
export function buildDoor(material: THREE.Material, box: CellBox3D, height: number, open: boolean): THREE.Group {
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
  // 문짝 하나가 주머니 쪽으로 밀려 들어간 거리. 닫히면 0이라 두 짝이 가운데서
  // 맞물리고, 열리면 주머니 속으로 거의 다 들어간다 — 끝을 조금 남겨 주머니
  // 입구에 문짝이 걸쳐 보이게 해야 벽이 아니라 열린 문으로 읽힌다.
  const slide = open ? panelWidth * 0.88 : 0;

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
 * 나무 정령: 보스 자리에 버티고 선 거대한 나무 정령.
 *
 * 곧게 자란 나무가 아니라 앞으로 웅크린 짐승 쪽이다 — 짧고 굵은 다리 위에
 * 떡 벌어진 몸통이 앉고, 팔은 땅에 닿을 만큼 길게 늘어져 양옆으로 벌어진다.
 * 목이 따로 없이 몸통 윗부분이 그대로 얼굴이라, 호박빛 눈 아래로 얼굴 폭만
 * 한 입이 이빨을 드러낸 채 벌어져 있다. 머리에서는 사슴뿔처럼 갈라진 마른
 * 가지가 뻗고 그 끝마다 잎이 달렸으며, 얼굴 둘레와 허리는 이끼 갈기가
 * 감싼다. 손발 끝만 속살 색으로 밝게 두어 어두운 나무껍질 몸에서 갈퀴가
 * 드러나 보이게 했다.
 */
export function buildTreeSpirit(materials: PreviewMaterials): THREE.Group {
  const group = new THREE.Group();
  const hipY = 3.4;
  const headY = 9.4;
  // 얼굴 부품을 붙이는 깊이. 머리 구의 앞면 언저리다.
  const faceZ = 2.35;

  /** 잎 한 장. 뿔 끝과 발목에 붙인다. */
  const leaf = (x: number, y: number, z: number, spin: number, radius = 0.8) => {
    const mesh = part(new THREE.SphereGeometry(radius, 10, 8), materials.treeLeaf, x, y, z);
    mesh.scale.set(0.5, 0.16, 1);
    mesh.rotation.set(-0.45, spin, 0);
    return mesh;
  };

  // 짧고 굵은 다리, 갈퀴 발톱이 난 발, 발목을 감싼 잎
  for (const side of [-1, 1]) {
    const thigh = part(new THREE.CylinderGeometry(1.3, 1.55, hipY + 0.6, 12), materials.spiritBark, side * 1.9, (hipY + 0.6) / 2, 0);
    thigh.rotation.z = side * 0.1;
    group.add(thigh);

    group.add(part(new THREE.BoxGeometry(2.1, 0.9, 2.8), materials.spiritBark, side * 2.1, 0.45, 0.45));
    for (let i = 0; i < 3; i++) {
      const toe = part(new THREE.ConeGeometry(0.32, 1.2, 6), materials.spiritClaw, side * 2.1 + (i - 1) * 0.66, 0.4, 2);
      toe.rotation.x = Math.PI / 2;
      group.add(toe);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + side * 0.4;
      group.add(leaf(side * 2.1 + Math.cos(a) * 1.15, 1.2, Math.sin(a) * 1.15, -a, 0.9));
    }
  }

  // 아래는 좁고 어깨 쪽이 벌어진 몸통
  group.add(part(new THREE.CylinderGeometry(2.4, 1.9, 1.9, 14), materials.spiritBark, 0, hipY + 0.5, 0));
  const torso = part(new THREE.SphereGeometry(3, 18, 14), materials.spiritBark, 0, hipY + 2.6, -0.1);
  torso.scale.set(1.15, 1.05, 0.95);
  group.add(torso);
  for (const [x, y, z] of [
    [-2.2, 7.4, 1.35],
    [2.4, 6.3, 1.65],
    [0.4, 5.2, -2.1],
  ]) {
    const moss = part(new THREE.SphereGeometry(1.2, 12, 8), materials.spiritMoss, x, y, z);
    moss.scale.set(1, 0.7, 0.35);
    group.add(moss);
  }

  // 허리에 두른 이끼 치마
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    group.add(
      limb(
        new THREE.Vector3(Math.cos(a) * 2.2, hipY + 1.7, Math.sin(a) * 2.2),
        new THREE.Vector3(Math.cos(a) * 0.45, -1, Math.sin(a) * 0.45),
        2.2 + (i % 3) * 0.5,
        0.72,
        0.12,
        i % 2 === 0 ? materials.spiritMoss : materials.spiritMossDark,
      ),
    );
  }

  // 머리. 목 없이 몸통 위에 바로 얹혀 얼굴만 앞으로 나온다.
  const head = part(new THREE.SphereGeometry(2.6, 18, 14), materials.spiritBark, 0, headY, 0.2);
  head.scale.set(1.15, 1, 1);
  group.add(head);

  // 얼굴을 빙 둘러싼 이끼 갈기. 턱 아래쪽은 더 길게 늘어뜨려 목을 덮는다.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const down = Math.max(0, -Math.sin(a));
    group.add(
      limb(
        new THREE.Vector3(Math.cos(a) * 2.55, headY + Math.sin(a) * 2.25, 0.55),
        new THREE.Vector3(Math.cos(a), Math.sin(a) - down * 0.5, 0.5),
        1.5 + (i % 3) * 0.45 + down * 1.1,
        0.68,
        0.1,
        i % 2 === 0 ? materials.spiritMoss : materials.spiritMossDark,
      ),
    );
  }
  // 갈기 안쪽을 채우는 이끼 덩이
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI;
    const clump = part(
      new THREE.SphereGeometry(1.15, 12, 8),
      i % 2 === 0 ? materials.spiritMoss : materials.spiritMossDark,
      Math.cos(a) * 2.5,
      headY + Math.sin(a) * 2.1,
      0.7,
    );
    clump.scale.set(1, 0.85, 0.7);
    group.add(clump);
  }

  // 움푹 팬 눈두덩에 박힌 호박빛 눈과 그 위의 두꺼운 눈썹 능선
  for (const side of [-1, 1]) {
    const socket = part(new THREE.SphereGeometry(1.05, 12, 10), materials.spiritBarkDark, side * 1.2, headY + 0.6, faceZ - 0.6);
    socket.scale.set(1, 0.9, 0.5);
    group.add(socket);

    const eye = part(new THREE.SphereGeometry(0.62, 14, 12), materials.spiritEye, side * 1.2, headY + 0.6, faceZ - 0.2);
    eye.scale.set(1, 1, 0.7);
    eye.userData.glow = true;
    group.add(eye);

    const brow = part(new THREE.BoxGeometry(1.7, 0.45, 0.7), materials.spiritBarkDark, side * 1.2, headY + 1.4, faceZ - 0.95);
    brow.rotation.z = side * 0.26;
    group.add(brow);
  }

  // 얼굴 폭만 한 입. 머리가 둥근 만큼, 입은 그 곡면보다 조금 앞으로 내밀어야
  // 정면에서 보인다 — 얼굴 안에 박아 두면 통째로 묻혀 버린다.
  const mouthY = headY - 1.2;
  const mouthHalf = 2.1;
  const mouthZ = (x: number) => 1.55 + 1.2 * Math.sqrt(Math.max(0, 1 - (x / mouthHalf) ** 2));
  const maw = part(new THREE.SphereGeometry(2, 16, 12), materials.spiritMaw, 0, mouthY, 1.55);
  maw.scale.set(mouthHalf / 2, 0.46, 0.6);
  group.add(maw);
  for (const upper of [true, false]) {
    const count = upper ? 9 : 8;
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1)) * 2 - 1;
      const x = t * (mouthHalf - 0.25);
      // 입꼬리가 올라간 만큼 끝쪽 이빨도 같이 올라간다.
      const grin = t * t * 0.3;
      // 길이를 번갈아 달리해야 톱니처럼 들쭉날쭉해 보인다.
      const length = i % 2 === 0 ? 1.05 : 0.8;
      const tooth = part(
        new THREE.ConeGeometry(0.26, length, 4),
        materials.spiritTooth,
        x,
        mouthY + grin + (upper ? 0.42 : -0.42),
        mouthZ(x) - 0.1,
      );
      if (upper) tooth.rotation.x = Math.PI;
      group.add(tooth);
    }
  }

  // 사슴뿔처럼 갈라져 위로 뻗는 마른 가지. 갈래 끝마다 잎이 달렸다.
  for (const side of [-1, 1]) {
    const root = new THREE.Vector3(side * 1.5, headY + 1.5, -0.1);
    const beamDir = new THREE.Vector3(side * 0.75, 1, -0.25);
    group.add(limb(root, beamDir, 3.4, 0.55, 0.34, materials.spiritBarkDark));

    const fork = root.clone().addScaledVector(beamDir.clone().normalize(), 3.4);
    const tipDir = new THREE.Vector3(side * 0.3, 1, 0.15);
    group.add(limb(fork, tipDir, 3.2, 0.34, 0.1, materials.spiritBarkDark));
    const tip = fork.clone().addScaledVector(tipDir.clone().normalize(), 3.2);

    const branchDir = new THREE.Vector3(side, 0.5, -0.45);
    group.add(limb(fork, branchDir, 2.7, 0.3, 0.09, materials.spiritBarkDark));
    const branchTip = fork.clone().addScaledVector(branchDir.clone().normalize(), 2.7);

    // 눈 위에서 앞으로 굽은 짧은 뿔
    group.add(
      limb(
        new THREE.Vector3(side * 0.95, headY + 1.8, 0.7),
        new THREE.Vector3(side * 0.3, 0.8, 0.75),
        2.7,
        0.45,
        0.1,
        materials.spiritBarkDark,
      ),
    );

    for (const [index, at] of [tip, branchTip].entries()) {
      group.add(leaf(at.x + side * 0.3, at.y + 0.25, at.z + 0.35, side * 1.1 + index));
      group.add(leaf(at.x - side * 0.45, at.y - 0.35, at.z - 0.2, side * 2.3 + index, 0.65));
    }
  }

  // 땅에 닿을 만큼 긴 팔. 두 마디로 꺾이고 끝에는 갈퀴 손이 달렸다.
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 2.7, 8.4, 0);
    group.add(part(new THREE.SphereGeometry(1.55, 14, 10), materials.spiritBark, shoulder.x, shoulder.y, shoulder.z));

    // 팔을 옆으로 더 벌리면 손끝이 칸을 넘어 옆 벽을 뚫는다. 바깥보다 아래로 뻗게 둔다.
    const upperDir = new THREE.Vector3(side, -0.45, 0.35);
    group.add(limb(shoulder, upperDir, 4.4, 1.35, 0.95, materials.spiritBark));

    const elbow = shoulder.clone().addScaledVector(upperDir.clone().normalize(), 4.4);
    group.add(part(new THREE.SphereGeometry(1.05, 12, 10), materials.spiritBark, elbow.x, elbow.y, elbow.z));

    const foreDir = new THREE.Vector3(side * 0.12, -1, 0.5);
    group.add(limb(elbow, foreDir, 5, 0.95, 0.62, materials.spiritBark));

    const wrist = elbow.clone().addScaledVector(foreDir.clone().normalize(), 5);
    const palm = part(new THREE.SphereGeometry(1, 12, 10), materials.spiritClaw, wrist.x, wrist.y, wrist.z);
    palm.scale.set(0.75, 1, 0.7);
    group.add(palm);
    for (let i = 0; i < 3; i++) {
      const spread = (i - 1) * 0.45;
      group.add(
        limb(
          wrist,
          new THREE.Vector3(side * 0.2 + spread, -1.25, 0.45 + Math.abs(spread) * 0.25),
          2,
          0.36,
          0.07,
          materials.spiritClaw,
        ),
      );
    }
  }

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

/**
 * 석상 한쪽 날개. 날개는 평평한 부조라서, 먼저 local XY 평면 안에서 다 그린 뒤
 * 그룹을 통째로 돌려 어깨에 붙인다 — 그래야 막을 눌러 납작하게 만드는 축(local Z)이
 * 부품마다 어긋나지 않는다.
 *
 * 좌우는 좌표의 x에 side를 곱해 만든다. scale.x를 -1로 뒤집으면 면이 안팎으로
 * 뒤집혀 음영이 반대로 계산된다.
 */
function buildStatueWing(side: number, materials: PreviewMaterials): THREE.Group {
  const wing = new THREE.Group();
  const at = (x: number, y: number) => new THREE.Vector3(side * x, y, 0);
  const bone = (from: THREE.Vector3, to: THREE.Vector3, baseRadius: number, tipRadius: number) => {
    const dir = to.clone().sub(from);
    return limb(from, dir, dir.length(), baseRadius, tipRadius, materials.statueStoneDark);
  };

  const shoulder = at(0, 0);
  const elbow = at(1.8, 2.6);
  const wrist = at(3.4, 4.4);
  wing.add(bone(shoulder, elbow, 0.34, 0.26));
  wing.add(bone(elbow, wrist, 0.26, 0.18));

  // 손목에서 부챗살처럼 뻗는 갈퀴. 마지막 점은 어깨라 뼈대 없이 막만 이어 붙는다.
  const tips = [at(5.4, 4), at(5.6, 1.6), at(4.4, -0.6), at(1.6, -1.2), shoulder];
  tips.forEach((tip, i) => {
    if (i < tips.length - 1) wing.add(bone(wrist, tip, 0.17, 0.05));

    const next = tips[i + 1];
    if (!next) return;
    // 갈퀴 두 개 사이를 메우는 막. 손목에 꼭짓점을 두고 바깥으로 펼친 쐐기다.
    const mid = tip.clone().add(next).multiplyScalar(0.5).sub(wrist);
    const web = part(
      new THREE.ConeGeometry(tip.distanceTo(next) / 2, mid.length(), 4),
      materials.statueStone,
      wrist.x + mid.x / 2,
      wrist.y + mid.y / 2,
      0,
    );
    web.rotation.z = Math.atan2(mid.y, mid.x) + Math.PI / 2;
    web.scale.set(1, 1, 0.14);
    wing.add(web);
  });

  const claw = part(new THREE.ConeGeometry(0.16, 0.9, 6), materials.statueStoneDark, wrist.x, wrist.y + 0.35, 0);
  claw.rotation.z = side * -0.5;
  wing.add(claw);

  wing.rotation.y = side * 0.4;
  return wing;
}

/**
 * 석상: 받침대 위에 세운 뿔과 날개 달린 악마 형상의 돌 조각.
 *
 * 받침대는 밑단·몸체·윗단을 쌓고 단마다 금테를 두른 뒤 네 귀퉁이에 금빛 뿔을
 * 세운다. 몸체 네 면에는 같은 문장(금테를 두른 보라 보석과 그 아래 흰 마름모)을
 * 새긴다 — 미리보기는 어느 방향에서나 보게 되므로 앞면만 꾸미면 뒤로 돌아갔을 때
 * 민짜가 된다.
 *
 * 그 위에 옷자락이 받침대까지 퍼져 내린 형상이 선다. 얼굴은 이목구비 없이 파낸
 * 자리처럼 어둡게 비우고, 머리에서 안쪽으로 굽은 큰 뿔 한 쌍이 솟는다. 보라 보석
 * (가슴과 목둘레)만 스스로 빛난다.
 *
 * 광원은 켜지 않는다. 늑대·골렘처럼 한 맵에 여럿 세우기 쉬운 장식이라 조명
 * 예산(MAX_PROP_LIGHTS)을 금방 먹는다.
 */
export function buildStatue(materials: PreviewMaterials): THREE.Group {
  const group = new THREE.Group();

  // 받침대: [너비, 높이] 순서로 아래에서부터 쌓는다. 금테가 단 사이를 끊어 준다.
  let y = 0;
  for (const [width, height, material] of [
    [7, 0.6, materials.statueStone],
    [7.25, 0.2, materials.statueGold],
    [6.1, 3.5, materials.statueStone],
    [6.4, 0.2, materials.statueGold],
    [6.7, 0.8, materials.statueStone],
    [6.95, 0.18, materials.statueGold],
  ] as Array<[number, number, THREE.Material]>) {
    group.add(part(new THREE.BoxGeometry(width, height, width), material, 0, y + height / 2, 0));
    y += height;
  }
  const deckY = y;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const spike = part(new THREE.ConeGeometry(0.5, 1.4, 4), materials.statueGold, sx * 2.95, deckY + 0.7, sz * 2.95);
      spike.rotation.y = Math.PI / 4;
      group.add(spike);
    }
  }

  // 몸체 네 면의 문장. 면마다 같은 부품을 돌려 붙인다.
  for (let i = 0; i < 4; i++) {
    const face = new THREE.Group();
    face.rotation.y = (i / 4) * Math.PI * 2;
    face.add(part(new THREE.BoxGeometry(3, 1.9, 0.12), materials.statueStoneDark, 0, 2.8, 3.02));
    const frame = part(new THREE.OctahedronGeometry(1.02), materials.statueGold, 0, 2.95, 3.09);
    frame.scale.set(1, 1, 0.13);
    face.add(frame);
    const gem = part(new THREE.OctahedronGeometry(0.6), materials.statueGem, 0, 2.95, 3.14);
    gem.scale.set(1, 1, 0.24);
    gem.userData.glow = true;
    face.add(gem);
    const plate = part(new THREE.OctahedronGeometry(0.52), materials.statuePlate, 0, 1.4, 3.1);
    plate.scale.set(1, 1, 0.2);
    face.add(plate);
    group.add(face);
  }

  // 몸체 네 모서리를 감싼 금빛 기둥
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(part(new THREE.BoxGeometry(0.42, 3.5, 0.42), materials.statueGold, sx * 2.93, 2.55, sz * 2.93));
    }
  }

  // 받침대 위로 퍼져 내린 옷자락과 세로 주름
  const robeHeight = 4;
  const robeTop = deckY + robeHeight;
  group.add(part(new THREE.CylinderGeometry(1.35, 2.7, robeHeight, 8), materials.statueStone, 0, deckY + robeHeight / 2, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    group.add(
      limb(
        new THREE.Vector3(Math.cos(a) * 2.55, deckY + 0.15, Math.sin(a) * 2.55),
        new THREE.Vector3(Math.cos(a) * -0.34, 1, Math.sin(a) * -0.34),
        robeHeight - 0.2,
        0.4,
        0.13,
        materials.statueStoneDark,
      ),
    );
  }

  // 몸통과 어깨 갑옷
  const torsoHeight = 1.5;
  const torsoTop = robeTop + torsoHeight;
  group.add(
    part(new THREE.CylinderGeometry(1.05, 1.4, torsoHeight, 8), materials.statueStone, 0, robeTop + torsoHeight / 2, 0),
  );
  for (const side of [-1, 1]) {
    const pauldron = part(new THREE.BoxGeometry(1.5, 0.5, 1.35), materials.statueStone, side * 1.35, torsoTop - 0.15, 0);
    pauldron.rotation.z = side * -0.32;
    group.add(pauldron);
  }

  // 가슴 문장과 목둘레를 두른 작은 보석들
  group.add(part(new THREE.BoxGeometry(1.8, 1.3, 0.3), materials.statueStoneDark, 0, robeTop + 0.75, 1.02));
  const chestGem = part(new THREE.OctahedronGeometry(0.42), materials.statueGem, 0, robeTop + 0.8, 1.25);
  chestGem.scale.set(1, 1, 0.5);
  chestGem.userData.glow = true;
  group.add(chestGem);
  for (let i = 0; i < 5; i++) {
    const t = (i / 4) * 2 - 1;
    const bead = part(
      new THREE.SphereGeometry(0.15, 10, 8),
      materials.statueGem,
      t * 0.88,
      torsoTop - 0.15 - t * t * 0.2,
      0.92 - t * t * 0.22,
    );
    bead.userData.glow = true;
    group.add(bead);
  }

  // 목과 머리. 얼굴은 파낸 자리처럼 비워 둔다.
  group.add(part(new THREE.CylinderGeometry(0.42, 0.52, 0.6, 8), materials.statueStoneDark, 0, torsoTop + 0.3, 0));
  const headY = torsoTop + 1.5;
  const head = part(new THREE.SphereGeometry(0.95, 16, 12), materials.statueStone, 0, headY, 0);
  head.scale.set(0.9, 1.1, 0.95);
  group.add(head);
  const hollow = part(new THREE.SphereGeometry(0.78, 14, 12), materials.statueStoneDark, 0, headY - 0.05, 0.42);
  hollow.scale.set(0.85, 1, 0.6);
  group.add(hollow);

  // 바깥으로 솟았다가 끝에서 안으로 굽는 뿔 한 쌍
  for (const side of [-1, 1]) {
    let base = new THREE.Vector3(side * 0.6, headY + 0.4, -0.05);
    for (const [dx, dy, dz, length, r0, r1] of [
      [0.65, 1, -0.1, 1.3, 0.3, 0.24],
      [0.22, 1, 0.08, 1.2, 0.24, 0.16],
      [-0.45, 1, 0.15, 0.85, 0.16, 0.04],
    ]) {
      const dir = new THREE.Vector3(side * dx, dy, dz);
      group.add(limb(base, dir, length, r0, r1, materials.statueStoneDark));
      base = base.clone().addScaledVector(dir.normalize(), length);
    }
  }

  // 어깨 뒤로 펼친 날개 한 쌍
  for (const side of [-1, 1]) {
    const wing = buildStatueWing(side, materials);
    wing.position.set(side * 1.15, torsoTop - 0.4, -0.55);
    group.add(wing);
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
    case 'statue':
      return buildStatue(materials);
    default:
      return null;
  }
}
