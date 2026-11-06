// 3D 자동차 뷰어
//  - show: 쇼룸 (손가락/마우스로 360° 회전, 핀치·휠로 확대, 가만히 두면 천천히 자동 회전)
//  - drive: 도로 위 주행 (speedKmh에 맞춰 도로 차선·가로등이 흘러가고 바퀴가 굴러감)
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BodyColor } from '../data/hyundaiModels';
import type { Mood } from '../game/character';
import type { CosmeticId } from '../game/progress';
import type { CharStyle } from '../game/style';
import { buildCar, type CarRig } from '../three/carModel';
import { shapeOf } from '../three/shapes';

interface Props {
  mood: Mood;
  cosmetic: CosmeticId;
  color?: BodyColor;
  /** 차종 3D 모양 id (hyundaiModels shape) */
  shape?: string;
  /** 얼굴 꾸미기 */
  style?: CharStyle;
  mode?: 'show' | 'drive';
  /** 주행 속도 (km/h) — drive 모드 */
  speedKmh?: number;
  /** 급정거 순간 (차가 앞으로 쏠림) */
  braking?: boolean;
  talking?: boolean;
  height: number;
}

/** 화면 속도감: 실제 속도(m/s)에 곱하는 값 (100km/h ≈ 초당 도로 9.7m 흐름) */
const VISUAL = 0.35;
const ROAD_LEN = 80;

function roadTexture() {
  // 가로(u) = 도로 길이 방향, 세로(v) = 도로 폭
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#121315';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillRect(0, 124, 260, 8); // 가운데 점선 (반복되면서 점선)
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.fillRect(0, 10, 512, 6);
  g.fillRect(0, 240, 512, 6);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ROAD_LEN / 8, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}

export default function Car3D({ mood, cosmetic, color, shape, style, mode = 'show', speedKmh = 0, braking = false, talking = false, height }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const rig = useRef<CarRig | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const look = useRef({ mood, cosmetic, color, style });
  look.current = { mood, cosmetic, color, style };
  const live = useRef({ speed: speedKmh, braking, talking });
  live.current = { speed: speedKmh, braking, talking };
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(mode === 'drive' ? 40 : 30, 1, 0.1, 200);
    if (mode === 'drive') camera.position.set(-6.2, 2.7, 4.6);
    else camera.position.set(4.9, 1.9, 4.7);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.7, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 4.6;
    controls.maxDistance = 13;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = Math.PI / 2 - 0.04; // 바닥 아래로는 못 내려감
    controls.autoRotate = mode === 'show';
    controls.autoRotateSpeed = 1.6;
    controls.update();
    let resume = 0;
    const onStart = () => { controls.autoRotate = false; setHint(false); window.clearTimeout(resume); };
    const onEnd = () => { resume = window.setTimeout(() => { controls.autoRotate = mode === 'show'; }, 4000); };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);

    // 조명
    scene.add(new THREE.HemisphereLight('#ffffff', '#303036', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -4;
    key.shadow.camera.right = key.shadow.camera.top = 4;
    key.shadow.radius = 6;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#ffffff', 1.2);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    // 차
    sceneRef.current = scene;
    mountCar(scene, rig, shape, look.current);

    // 바닥 그림자 받는 면
    const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.55 }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);

    const extra: { dispose(): void }[] = [shadowFloor.geometry, shadowFloor.material as THREE.Material, envTex, pmrem];
    let roadTex: THREE.CanvasTexture | null = null;
    const posts: THREE.Object3D[] = [];

    if (mode === 'show') {
      // 쇼룸: 발밑 스포트라이트 원
      const glow = glowTexture();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.002;
      scene.add(disc);
      extra.push(glow, disc.geometry, disc.material as THREE.Material);
    } else {
      // 도로 (차는 +x 방향으로 달림 → 도로가 -x로 흐름)
      roadTex = roadTexture();
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, 5.2), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.001, 0.9);
      road.receiveShadow = true;
      scene.add(road);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, 40), new THREE.MeshStandardMaterial({ color: '#08080a', roughness: 1 }));
      side.rotation.x = -Math.PI / 2;
      side.position.y = -0.002;
      scene.add(side);
      extra.push(roadTex, road.geometry, road.material as THREE.Material, side.geometry, side.material as THREE.Material);
      // 가로등 기둥 (흘러가며 반복)
      const poleG = new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8);
      const lampG = new THREE.BoxGeometry(0.5, 0.06, 0.14);
      const poleM = new THREE.MeshStandardMaterial({ color: '#3a3b40', metalness: 0.6, roughness: 0.4 });
      const lampM = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 3 });
      extra.push(poleG, lampG, poleM, lampM);
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Group();
        const pole = new THREE.Mesh(poleG, poleM);
        pole.position.y = 1.3;
        const lamp = new THREE.Mesh(lampG, lampM);
        lamp.position.set(0, 2.6, 0.2);
        p.add(pole, lamp);
        p.position.set(-ROAD_LEN / 2 + i * (ROAD_LEN / 8), 0, -2.0);
        scene.add(p);
        posts.push(p);
      }
      scene.fog = new THREE.Fog('#000000', 14, 34);
    }

    // 크기 맞추기
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // 화면에 보일 때만 그리기
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    const clock = new THREE.Clock();
    let travelled = 0;
    let nextBlink = 2.5;
    let blinkUntil = 0;
    let lean = 0;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const { speed, braking: br, talking: tk } = live.current;

      // 바퀴 · 도로: 실제 속도(m/s) × 화면 배율
      const v = mode === 'drive' ? (speed / 3.6) * VISUAL : 0;
      travelled += v * dt;
      const car = rig.current;
      if (!car) return;
      car.wheels.forEach((w) => { w.rotation.z -= (v / car.wheelR) * dt; });
      if (roadTex) roadTex.offset.x = (travelled / 8) % 1;
      posts.forEach((p) => {
        p.position.x -= v * dt;
        if (p.position.x < -ROAD_LEN / 2) p.position.x += ROAD_LEN;
      });

      // 차체 움직임: 주행 진동 · 급정거 쏠림 · 말할 때 통통 · 대기 숨쉬기
      const targetLean = br ? 0.06 : 0;
      lean += (targetLean - lean) * Math.min(1, dt * 8);
      const bob = mode === 'drive' && speed > 1
        ? Math.sin(t * (6 + speed / 12)) * 0.006 * Math.min(1, speed / 60)
        : tk ? Math.abs(Math.sin(t * 12)) * 0.03 : Math.sin(t * 2) * 0.008;
      car.group.position.y = bob;
      car.group.rotation.z = -lean;

      // 깜빡임
      if (t > nextBlink) { car.setBlink(true); blinkUntil = t + 0.14; nextBlink = t + 2.5 + Math.random() * 3; }
      if (blinkUntil && t > blinkUntil) { car.setBlink(false); blinkUntil = 0; }

      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.clearTimeout(resume);
      controls.dispose();
      rig.current?.dispose();
      sceneRef.current = null;
      extra.forEach((d) => d.dispose());
      posts.forEach((p) => scene.remove(p));
      renderer.dispose();
      renderer.domElement.remove();
      rig.current = null;
    };
    // 장면은 모드가 바뀔 때만 새로 만든다 (나머지 값은 아래 효과에서 반영)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 차종이 바뀌면 차만 새로 만들어 끼움 (장면·카메라는 그대로)
  const firstShape = useRef(true);
  useEffect(() => {
    if (firstShape.current) { firstShape.current = false; return; }
    const scene = sceneRef.current;
    if (!scene) return;
    if (rig.current) { scene.remove(rig.current.group); rig.current.dispose(); }
    mountCar(scene, rig, shape, look.current);
  }, [shape]);
  useEffect(() => { if (style) rig.current?.setStyle(style); }, [style]);
  useEffect(() => { rig.current?.setMood(mood, cosmetic); }, [mood, cosmetic]);
  useEffect(() => { rig.current?.setColor(color); }, [color]);
  useEffect(() => { rig.current?.setCosmetic(cosmetic, import.meta.env.BASE_URL); }, [cosmetic]);

  if (failed) return <div className="car3d-fallback" style={{ height }}>이 기기에서는 3D를 표시할 수 없어요</div>;

  return (
    <div className={`car3d-view mode-${mode}`} style={{ height }} ref={host}>
      {mode === 'show' && hint && <span className="rotate-hint">드래그해서 360° 돌려보기</span>}
    </div>
  );
}

function mountCar(scene: THREE.Scene, rig: { current: CarRig | null }, shape: string | undefined, l: { mood: Mood; cosmetic: CosmeticId; color?: BodyColor; style?: CharStyle }) {
  const car = buildCar(shape);
  // 작은 차는 조금 크게, 큰 차는 조금 작게 (화면에 비슷한 크기로)
  const k = Math.min(1.12, Math.max(0.86, 2.3 / shapeOf(shape).L));
  car.group.scale.setScalar(k);
  if (l.style) car.setStyle(l.style);
  car.setColor(l.color);
  car.setMood(l.mood, l.cosmetic);
  car.setCosmetic(l.cosmetic, import.meta.env.BASE_URL);
  scene.add(car.group);
  rig.current = car;
  // 실제 차 3D 모델이 있으면 불러와서 차체를 바꿈 (그동안은 코드로 만든 차)
  const sh = shapeOf(shape);
  if (sh.glb) {
    loadGlb(import.meta.env.BASE_URL + sh.glb)
      .then((root) => {
        if (rig.current !== car) return;
        car.useModel(root, sh.glbRotY);
        car.group.scale.multiplyScalar(0.86); // 실제 모델은 조금 더 통통해서 화면에 맞게
      })
      .catch(() => { /* 코드 차 그대로 */ });
  }
}

const glbCache = new Map<string, Promise<THREE.Object3D>>();
function loadGlb(url: string) {
  if (!glbCache.has(url)) {
    glbCache.set(url, (async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const g = await loader.loadAsync(url);
      return g.scene;
    })());
  }
  // 차를 바꿀 때마다 새로 쓰도록 복제 (재질도 따로)
  return glbCache.get(url)!.then((s) => {
    const c = s.clone(true);
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); });
    return c;
  });
}
