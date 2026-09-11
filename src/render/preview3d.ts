import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Brush, PreviewModel } from '@/core/brush';
import { brushIndex, findBrushById } from '@/core/brush';
import type { BrushId, MapDoc } from '@/core/types';
import { FLOOR_SPAN, WALL_HEIGHT, forEachPreviewCell, mapLayout3D } from '@/core/layout3d';
import {
  buildDoor,
  buildProp,
  createPreviewMaterials,
  disposeModel,
  disposePreviewMaterials,
  prepareShadows,
  propHeightOf,
  propLightOf,
} from './previewModels';

/**
 * 미로 생성 미리보기의 3D 뷰.
 *
 * 게임에서 실제로 어떻게 보일지 감을 잡기 위한 것이라 모델은 최대한 단순하다 —
 * 맵 크기에 맞춘 바닥 판 하나에, 칸마다 상자 하나를 세우는 게 기본이다. 칸
 * 크기가 종류마다 다르다는 점(core/layout3d.ts)을 정확히 반영한다.
 *
 * 칸을 칠한 브러쉬의 3D 미리보기 모델 타입에 따라 벽 높이가 달라지거나
 * (특수지역 벽·외곽 벽), 상자 대신 다른 모양이 선다(특수지역 문, 지역
 * 장식물). 어느 칸에 무엇을 세울지는 core의 forEachPreviewCell이 정하고,
 * 여기서는 그 결과를 three.js 객체로 옮기기만 한다.
 *
 * 평범한 벽은 수만 개가 될 수 있으므로 모델별로 InstancedMesh 하나에 몰아
 * 그리고, 문과 장식물은 개수가 적으므로 칸마다 객체를 따로 만든다.
 *
 * 광원: 해(방향광)가 벽과 장식물의 그림자를 드리우고, 세계수·보스·시작 지점은
 * 제각기 점광원을 켠다. 점광원은 조명 계산 비용이 칸마다 늘어나므로 개수에
 * 상한을 둔다(MAX_PROP_LIGHTS). 톤 매핑은 걸지 않는다(아래 renderer 설정 참고).
 *
 * 조작: 왼쪽 드래그는 지면을 따라 이동, 오른쪽 드래그는 회전, 휠은 확대다.
 *
 * three.js는 React 밖에서 직접 돌린다. CanvasView와 같은 이유로, 그리기는
 * 렌더 사이클이 아니라 자체 애니메이션 루프가 담당한다.
 */

/** 바닥 판 두께. 위 면이 y=0에 오도록 아래로 내려 놓는다. */
const GROUND_THICKNESS = 1.5;
/** 바닥 판을 맵보다 살짝 넓게 빼서 테두리 벽이 허공에 걸치지 않게 한다. */
const GROUND_MARGIN = 3;

const SKY_COLOR = 0x8aa6b8;
const GRASS_COLOR = 0x4f7a42;
const SOIL_COLOR = 0x4a3a2b;
const SOIL_DARK_COLOR = 0x342719;
const WALL_COLOR = 0x434850;
/** 특수지역 벽·외곽 벽은 높이만으로도 구분되지만, 색도 살짝 달리해 더 또렷하게 만든다. */
const SPECIAL_WALL_COLOR = 0x5a5064;
const OUTER_WALL_COLOR = 0x33363d;

/** 해가 비치는 방향(해 쪽을 향하는 단위 벡터). */
const SUN_DIRECTION = new THREE.Vector3(0.6, 1, 0.35).normalize();
/**
 * 장식물이 켜는 점광원 개수 상한. 점광원은 그림자를 드리우지 않더라도 화면의
 * 모든 조각마다 계산되므로, 장식물을 많이 칠한 맵에서도 부드럽게 돌도록 자른다.
 * 넘치는 장식물은 모양과 자체 발광만 남는다.
 */
const MAX_PROP_LIGHTS = 12;

/** 카메라 초기 위치의 고도각. 맵 전체가 보이면서 벽 높이도 느껴지는 각도. */
const PITCH = THREE.MathUtils.degToRad(42);
const FOV = 55;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface Preview3DScene {
  /**
   * 맵과 (미리보기) 지형 타입 격자로 장면을 다시 만든다.
   * brushes는 칸마다 어떤 3D 모델을 세울지 정하는 데 쓴다 — 맵에는 브러쉬 id만
   * 적혀 있으므로 모델 타입은 브러쉬 정의에서 찾아야 한다.
   */
  setMap(doc: MapDoc, terrainType: Uint8Array, brushes: Brush[]): void;
  resize(width: number, height: number): void;
  /** 맵 전체가 보이도록 카메라를 되돌린다. */
  resetCamera(): void;
  dispose(): void;
}

/**
 * 숲 바닥 느낌을 내는 아주 작은 절차적 텍스처.
 * 단색 판은 크기 감각이 없어서 미로가 얼마나 넓은지 알기 어렵다. 얼룩만 뿌린
 * 64px 타일을 floor 칸 하나 크기로 반복해 최소한의 결을 준다.
 */
function makeGrassTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#4f7a42';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 220; i++) {
      const shade = Math.random() < 0.5 ? '#456d3a' : '#5b8a4b';
      ctx.fillStyle = shade;
      ctx.globalAlpha = 0.35 + Math.random() * 0.4;
      const r = 1 + Math.random() * 2.5;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPreview3D(canvas: HTMLCanvasElement): Preview3DScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  // 이 버전의 three는 PCFSoftShadowMap을 없앴다. PCF에 shadow.radius로 가장자리를 푼다.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // 톤 매핑은 쓰지 않는다. ACES도 Neutral도 어두운 톤을 깎아 내리는데(Neutral도
  // 0.08 아래는 제곱으로 누른다), 이 장면은 대부분이 어두운 잔디와 벽이라 전체가
  // 탁하고 짙어졌다. 밝은 곳이 하얗게 날아가는 건 점광원 세기를 낮게 잡아서 막는다.
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 10000);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  // 지면 아래로 내려가면 바닥 판 뒷면만 보이므로 수평 조금 위에서 멈춘다.
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  // 팬은 화면이 아니라 지면을 따라 움직이는 편이 맵을 훑어보기 좋다.
  controls.screenSpacePanning = false;
  // 왼쪽 드래그는 이동, 오른쪽 드래그는 회전. 오른쪽 버튼이 없는 트랙패드에서는
  // OrbitControls 규칙대로 Shift(또는 Ctrl·Cmd)+왼쪽 드래그가 회전이 된다.
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  // 해가 드는 곳의 밝기는 그림자를 넣기 전과 같게 맞추고(하늘빛 + 해 ≈ 3.2),
  // 하늘빛만 받는 그림자 속은 그 절반 아래로 떨어져 명암이 또렷해지게 나눈다.
  const hemisphere = new THREE.HemisphereLight(0xbcd6e8, 0x3a5230, 1.3);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
  sun.castShadow = true;
  sun.shadow.radius = 2.5;
  scene.add(sun);
  scene.add(sun.target);

  const grass = makeGrassTexture();
  const groundMaterials = [
    new THREE.MeshLambertMaterial({ color: SOIL_COLOR }),
    new THREE.MeshLambertMaterial({ color: SOIL_COLOR }),
    new THREE.MeshLambertMaterial({ map: grass, color: GRASS_COLOR }),
    new THREE.MeshLambertMaterial({ color: SOIL_DARK_COLOR }),
    new THREE.MeshLambertMaterial({ color: SOIL_COLOR }),
    new THREE.MeshLambertMaterial({ color: SOIL_COLOR }),
  ];
  const wallMaterials: Record<'default' | 'special' | 'outer', THREE.Material> = {
    default: new THREE.MeshLambertMaterial({ color: WALL_COLOR }),
    special: new THREE.MeshLambertMaterial({ color: SPECIAL_WALL_COLOR }),
    outer: new THREE.MeshLambertMaterial({ color: OUTER_WALL_COLOR }),
  };
  const modelMaterials = createPreviewMaterials();
  // 상자 하나를 인스턴스마다 다르게 늘여 쓴다.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  function wallMaterialOf(model: PreviewModel): THREE.Material {
    if (model === 'special-wall') return wallMaterials.special;
    if (model === 'outer-wall') return wallMaterials.outer;
    return wallMaterials.default;
  }

  let ground: THREE.Mesh | null = null;
  /** 이번 맵을 그리려고 장면에 넣은 것들. 다음 맵을 그릴 때 통째로 정리한다. */
  const mapObjects: THREE.Object3D[] = [];
  /** 카메라를 되돌릴 때 쓸 현재 맵의 크기와 가장 높은 물체의 높이. */
  let extent = { x: 1, z: 1 };
  let topHeight = WALL_HEIGHT;
  let disposed = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();

  function clearMap(): void {
    if (ground) {
      scene.remove(ground);
      ground.geometry.dispose();
      ground = null;
    }
    for (const object of mapObjects) {
      scene.remove(object);
      if (object instanceof THREE.InstancedMesh) object.dispose();
      else if (object instanceof THREE.Light) object.dispose();
      else disposeModel(object);
    }
    mapObjects.length = 0;
  }

  /**
   * 해의 그림자가 맵 전체를 덮도록 그림자 카메라를 맞춘다.
   *
   * 방향광의 그림자는 해 쪽에서 내려다본 직교 카메라로 그린다. 맵을 감싸는 구
   * (가장 높은 모델까지 포함)를 통째로 담으면 해가 어느 쪽에 있든 잘리지 않는다.
   * 큰 맵은 같은 해상도로 덮으면 그림자가 뭉개지므로 그림자 텍스처를 키우되,
   * 기기가 허용하는 최대 크기를 넘지 않게 한다.
   */
  function fitSun(): void {
    const radius = Math.hypot(extent.x, extent.z) / 2 + GROUND_MARGIN + topHeight;
    sun.target.position.set(0, 0, 0);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(radius * 2);

    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -radius;
    shadowCamera.right = radius;
    shadowCamera.top = radius;
    shadowCamera.bottom = -radius;
    shadowCamera.near = 0.5;
    shadowCamera.far = radius * 4;
    shadowCamera.updateProjectionMatrix();

    const size = Math.min(radius > 400 ? 4096 : 2048, renderer.capabilities.maxTextureSize);
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      // 크기가 바뀐 그림자 텍스처는 다음 그리기 때 새로 만들어진다.
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    // 그림자 텍스처 한 칸이 월드에서 차지하는 크기에 맞춰 여드름(acne)을 막는다.
    const texel = (radius * 2) / size;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = texel * 1.5;
  }

  /**
   * 맵 전체가 화면에 꽉 차도록 카메라를 놓는다.
   *
   * 카메라는 원점을 바라보며 시선 방향 위에만 놓이므로, 어떤 점이 화면에서
   * 좌우·상하로 얼마나 떨어져 보이는지는 거리와 무관하고 깊이만 거리만큼 밀린다.
   * 그래서 맵을 감싸는 상자의 여덟 꼭짓점마다 "화면 안에 들어오려면 최소 얼마나
   * 물러나야 하는지"를 바로 구해 그 최댓값을 쓰면 된다. 바운딩 구로 어림잡던
   * 방식과 달리 기울어 본 맵에도 딱 맞는다.
   */
  function resetCamera(): void {
    const halfV = THREE.MathUtils.degToRad(FOV) / 2;
    const tanV = Math.tan(halfV);
    const tanH = tanV * camera.aspect;

    const eye = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH)).normalize();
    const forward = eye.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const hx = extent.x / 2 + GROUND_MARGIN;
    const hz = extent.z / 2 + GROUND_MARGIN;
    const corner = new THREE.Vector3();
    let distance = 0;
    for (const sx of [-hx, hx]) {
      // 외곽 벽이나 세계수처럼 기본 벽보다 높은 모델이 있으면 그 높이까지 담는다.
      for (const sy of [-GROUND_THICKNESS, topHeight]) {
        for (const sz of [-hz, hz]) {
          corner.set(sx, sy, sz);
          const need = Math.max(
            Math.abs(corner.dot(right)) / tanH,
            Math.abs(corner.dot(up)) / tanV,
          ) - corner.dot(forward);
          distance = Math.max(distance, need);
        }
      }
    }
    distance *= 1.04;

    camera.position.copy(eye).multiplyScalar(distance);
    camera.near = Math.max(0.5, distance / 500);
    camera.far = distance * 4 + Math.hypot(extent.x, extent.z);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = WALL_HEIGHT;
    controls.maxDistance = distance * 3;
    controls.update();
  }

  function setMap(doc: MapDoc, terrainType: Uint8Array, brushes: Brush[]): void {
    if (disposed) return;
    const layout = mapLayout3D(doc);
    const sameExtent = extent.x === layout.totalX && extent.z === layout.totalZ;
    clearMap();

    ground = new THREE.Mesh(
      new THREE.BoxGeometry(layout.totalX + GROUND_MARGIN * 2, GROUND_THICKNESS, layout.totalZ + GROUND_MARGIN * 2),
      groundMaterials,
    );
    ground.position.y = -GROUND_THICKNESS / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 텍스처는 floor 칸 하나가 타일 하나가 되도록 반복시킨다.
    grass.repeat.set(
      (layout.totalX + GROUND_MARGIN * 2) / FLOOR_SPAN,
      (layout.totalZ + GROUND_MARGIN * 2) / FLOOR_SPAN,
    );
    grass.needsUpdate = true;

    const index = brushIndex(brushes);
    const modelOfBrush = (id: BrushId): PreviewModel =>
      findBrushById(index, id)?.previewModel ?? 'default';

    // 1차: 모델별로 상자가 몇 개나 필요한지 센다. InstancedMesh는 만들 때
    // 개수를 확정해야 하므로 채우기 전에 한 번 훑어야 한다.
    const wallCounts = new Map<PreviewModel, number>();
    let tallest = WALL_HEIGHT;
    forEachPreviewCell(doc, terrainType, layout, modelOfBrush, {
      wall: (model, height) => {
        tallest = Math.max(tallest, height);
        // 문은 상자가 아니라 부품 묶음이라 인스턴싱 대상이 아니다.
        if (model === 'special-door') return;
        wallCounts.set(model, (wallCounts.get(model) ?? 0) + 1);
      },
      prop: (model) => {
        tallest = Math.max(tallest, propHeightOf(model));
      },
    });

    const wallMeshes = new Map<PreviewModel, { mesh: THREE.InstancedMesh; next: number }>();
    for (const [model, count] of wallCounts) {
      const mesh = new THREE.InstancedMesh(unitBox, wallMaterialOf(model), count);
      // 벽은 맵 전체에 흩어져 있어 인스턴스 단위 절두체 컬링이 도움이 되지 않는다.
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wallMeshes.set(model, { mesh, next: 0 });
    }

    // 2차: 실제로 채운다.
    let propLights = 0;
    forEachPreviewCell(doc, terrainType, layout, modelOfBrush, {
      wall: (model, height, cx, cz, sx, sz) => {
        if (model === 'special-door') {
          // 문은 특수지역 벽과 같은 재질을 그대로 쓴다 — 색이 똑같이 맞는다.
          const door = buildDoor(wallMaterials.special, { cx, cz, sx, sz }, height);
          prepareShadows(door);
          scene.add(door);
          mapObjects.push(door);
          return;
        }
        const slot = wallMeshes.get(model);
        if (!slot) return;
        position.set(cx, height / 2, cz);
        scaleVec.set(sx, height, sz);
        matrix.compose(position, quaternion, scaleVec);
        slot.mesh.setMatrixAt(slot.next++, matrix);
      },
      prop: (model, cx, cz) => {
        const prop = buildProp(model, modelMaterials);
        if (!prop) return;
        prop.position.set(cx, 0, cz);
        prepareShadows(prop);
        scene.add(prop);
        mapObjects.push(prop);

        const glow = propLightOf(model);
        if (!glow || propLights >= MAX_PROP_LIGHTS) return;
        const light = new THREE.PointLight(glow.color, glow.intensity, glow.distance, 2);
        light.position.set(cx, glow.y, cz);
        scene.add(light);
        mapObjects.push(light);
        propLights++;
      },
    });

    for (const { mesh } of wallMeshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      mapObjects.push(mesh);
    }

    extent = { x: layout.totalX, z: layout.totalZ };
    topHeight = tallest;
    fitSun();
    // 같은 맵을 다시 생성한 것뿐이라면 보던 각도를 유지한다.
    if (!sameExtent) resetCamera();
  }

  function resize(width: number, height: number): void {
    if (disposed || width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setMap,
    resize,
    resetCamera,
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      controls.dispose();
      clearMap();
      sun.dispose();
      hemisphere.dispose();
      unitBox.dispose();
      Object.values(wallMaterials).forEach((m) => m.dispose());
      disposePreviewMaterials(modelMaterials);
      groundMaterials.forEach((m) => m.dispose());
      grass.dispose();
      renderer.dispose();
    },
  };
}
