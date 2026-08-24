/**
 * Трёхмерный куб на three.js.
 *
 * Принцип: кубики стоят на фиксированных местах, цвета 54 стикеров берутся из
 * логического состояния (Uint8Array). Ход анимируется временной группой-осью:
 * нужные кубики на время поворота переезжают в группу, группа крутится,
 * после чего кубики возвращаются, а стикеры перекрашиваются из нового
 * состояния. Никакого накопления поворотов — ничего не разъезжается.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FACES, type Axis, type Move, type State } from '../core/cube';

/** Цвета стикеров: U белый, R красный, F зелёный, D жёлтый, L оранжевый, B синий. */
export const STICKER_COLORS = ['#f4f1e8', '#d8322b', '#1fa94a', '#f5c400', '#f58a1f', '#1e63d6'];

interface StickerInfo { mesh: THREE.Mesh; pos: THREE.Vector3; normal: THREE.Vector3; facelet: number }

/** Положение кубика и нормаль для стикера по индексу фейслета (см. нумерацию в cube.ts). */
function faceletGeometry(i: number): { pos: THREE.Vector3; normal: THREE.Vector3 } {
  const f = Math.floor(i / 9), r = Math.floor((i % 9) / 3), c = i % 3;
  switch (FACES[f]) {
    case 'U': return { pos: new THREE.Vector3(c - 1, 1, r - 1), normal: new THREE.Vector3(0, 1, 0) };
    case 'D': return { pos: new THREE.Vector3(c - 1, -1, 1 - r), normal: new THREE.Vector3(0, -1, 0) };
    case 'F': return { pos: new THREE.Vector3(c - 1, 1 - r, 1), normal: new THREE.Vector3(0, 0, 1) };
    case 'B': return { pos: new THREE.Vector3(1 - c, 1 - r, -1), normal: new THREE.Vector3(0, 0, -1) };
    case 'R': return { pos: new THREE.Vector3(1, 1 - r, 1 - c), normal: new THREE.Vector3(1, 0, 0) };
    case 'L': return { pos: new THREE.Vector3(-1, 1 - r, c - 1), normal: new THREE.Vector3(-1, 0, 0) };
  }
  throw new Error('bad facelet');
}

/** Ось вращения, слой(и) и знак для каждого хода. Знак: по часовой снаружи = −90° вокруг нормали. */
const MOVE_GEOM: Record<Axis, { axis: 'x' | 'y' | 'z'; layers: number[]; sign: number }> = {
  U: { axis: 'y', layers: [1], sign: -1 },
  D: { axis: 'y', layers: [-1], sign: 1 },
  R: { axis: 'x', layers: [1], sign: -1 },
  L: { axis: 'x', layers: [-1], sign: 1 },
  F: { axis: 'z', layers: [1], sign: -1 },
  B: { axis: 'z', layers: [-1], sign: 1 },
  M: { axis: 'x', layers: [0], sign: 1 },
  E: { axis: 'y', layers: [0], sign: 1 },
  S: { axis: 'z', layers: [0], sign: -1 },
  x: { axis: 'x', layers: [-1, 0, 1], sign: -1 },
  y: { axis: 'y', layers: [-1, 0, 1], sign: -1 },
  z: { axis: 'z', layers: [-1, 0, 1], sign: -1 },
};

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface CubeViewOptions {
  /** Вызывается, когда пользователь «прокрутил» слой мышью/пальцем. */
  onDragMove?: (move: Move) => void;
}

export class CubeView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly cubies: THREE.Mesh[] = [];
  private readonly stickers: StickerInfo[] = [];
  private readonly pivot = new THREE.Group();
  private readonly root = new THREE.Group();
  private state: State;
  private animating = false;
  private trail: THREE.Group | null = null;
  private trailEnabled = true;
  private raf = 0;
  private drag: { facelet: number; start: THREE.Vector2; point: THREE.Vector3; normal: THREE.Vector3 } | null = null;

  constructor(private readonly container: HTMLElement, initial: State, private readonly opts: CubeViewOptions = {}) {
    this.state = new Uint8Array(initial);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(5.3, 4.6, 7.0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 14;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.5);
    fill.position.set(-6, -3, -4);
    this.scene.add(fill);

    this.scene.add(this.root);
    this.root.add(this.pivot);
    this.build();
    this.recolor();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.bindPointer();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** Собрать 26 кубиков и 54 стикера. */
  private build(): void {
    const body = new RoundedBoxGeometry(0.97, 0.97, 0.97, 3, 0.09);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.55, metalness: 0.1 });
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (x === 0 && y === 0 && z === 0) continue;
      const m = new THREE.Mesh(body, bodyMat);
      m.position.set(x, y, z);
      m.userData.home = new THREE.Vector3(x, y, z);
      this.root.add(m);
      this.cubies.push(m);
    }
    const plane = new THREE.PlaneGeometry(0.84, 0.84);
    for (let i = 0; i < 54; i++) {
      const { pos, normal } = faceletGeometry(i);
      const mat = new THREE.MeshStandardMaterial({ color: STICKER_COLORS[0], roughness: 0.35, metalness: 0.0 });
      const mesh = new THREE.Mesh(plane, mat);
      const p = pos.clone().addScaledVector(normal, 0.5 + 0.006);
      mesh.position.copy(p);
      mesh.lookAt(p.clone().add(normal));
      mesh.userData.facelet = i;
      mesh.userData.home = p.clone();
      this.root.add(mesh);
      this.stickers.push({ mesh, pos: pos.clone(), normal: normal.clone(), facelet: i });
    }
  }

  private resize(): void {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /** Перекрасить стикеры по текущему состоянию. */
  private recolor(): void {
    for (const s of this.stickers) {
      (s.mesh.material as THREE.MeshStandardMaterial).color.set(STICKER_COLORS[this.state[s.facelet]]);
    }
  }

  /** Мгновенно показать состояние (без анимации). */
  setState(state: State): void {
    this.state = new Uint8Array(state);
    this.recolor();
  }

  get isAnimating(): boolean { return this.animating; }

  setTrail(on: boolean): void { this.trailEnabled = on; }

  /**
   * Анимировать ход. Возвращает промис, который резолвится после поворота;
   * логическое состояние после хода передаётся снаружи — рендер его не считает.
   */
  animateMove(move: Move, after: State, durationMs: number): Promise<void> {
    if (durationMs <= 0) { this.setState(after); return Promise.resolve(); }
    const g = MOVE_GEOM[move.axis];
    const angle = g.sign * (move.turns === 3 ? -1 : move.turns) * (Math.PI / 2);
    const members = [...this.cubies, ...this.stickers.map((s) => s.mesh)].filter((o) => {
      const home: THREE.Vector3 = o.userData.home;
      const coord = Math.round(home[g.axis]);
      return g.layers.includes(coord);
    });
    for (const o of members) this.pivot.attach(o);
    this.animating = true;
    this.controls.enableRotate = false;
    if (this.trailEnabled) this.makeTrail(members);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / durationMs);
        this.pivot.rotation.set(0, 0, 0);
        this.pivot.rotation[g.axis] = angle * easeInOut(t);
        if (this.trail) (this.trail.userData.mat as THREE.Material).opacity = 0.22 * (1 - t);
        if (t < 1) { requestAnimationFrame(tick); return; }
        for (const o of members) {
          this.root.attach(o);
          o.position.copy(o.userData.home);
          o.rotation.set(0, 0, 0);
          if ((o.userData.facelet ?? -1) >= 0) {
            const s = this.stickers[o.userData.facelet];
            o.lookAt(s.mesh.position.clone().add(s.normal));
          }
        }
        this.pivot.rotation.set(0, 0, 0);
        this.state = new Uint8Array(after);
        this.recolor();
        this.removeTrail();
        this.animating = false;
        this.controls.enableRotate = true;
        resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /** «Шлейф»: полупрозрачная копия слоя на исходном месте, тающая за время хода. */
  private makeTrail(members: THREE.Object3D[]): void {
    this.removeTrail();
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
    g.userData.mat = mat;
    for (const o of members) {
      if (!(o instanceof THREE.Mesh)) continue;
      const ghost = new THREE.Mesh(o.geometry, mat);
      ghost.position.copy(o.userData.home);
      ghost.quaternion.copy(o.quaternion);
      g.add(ghost);
    }
    this.root.add(g);
    this.trail = g;
  }

  private removeTrail(): void {
    if (!this.trail) return;
    this.root.remove(this.trail);
    (this.trail.userData.mat as THREE.Material).dispose();
    this.trail = null;
  }

  // ---- перетаскивание слоя -------------------------------------------------

  private bindPointer(): void {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    el.addEventListener('pointerdown', (e) => {
      if (this.animating) return;
      ray.setFromCamera(ndc(e), this.camera);
      const hit = ray.intersectObjects(this.stickers.map((s) => s.mesh), false)[0];
      if (!hit) return;
      const s = this.stickers[hit.object.userData.facelet];
      this.drag = { facelet: s.facelet, start: new THREE.Vector2(e.clientX, e.clientY), point: hit.point.clone(), normal: s.normal.clone() };
      this.controls.enableRotate = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const d = this.drag;
      if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < 14) return;
      // Проекция курсора на плоскость грани
      ray.setFromCamera(ndc(e), this.camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(d.normal, d.point);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return;
      const dir = p.sub(d.point);
      if (dir.length() < 0.05) return;
      dir.normalize();
      // Ось вращения = n × d, округлённая до главной оси; +90° вокруг неё двигает стикер вдоль d
      const a = new THREE.Vector3().crossVectors(d.normal, dir);
      const comps = [Math.abs(a.x), Math.abs(a.y), Math.abs(a.z)];
      const k = comps.indexOf(Math.max(...comps));
      const axisName = (['x', 'y', 'z'] as const)[k];
      const sgn = Math.sign(a.getComponent(k)); // +90° вокруг ±оси → угол вокруг +оси
      const cubie = this.stickers[d.facelet].pos;
      const layer = Math.round(cubie.getComponent(k));
      const move = this.moveFor(axisName, layer, sgn);
      this.drag = null;
      this.controls.enableRotate = true;
      if (move) this.opts.onDragMove?.(move);
    });
    const end = () => { this.drag = null; this.controls.enableRotate = !this.animating; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Перевести «поворот на +90°·sgn вокруг оси в слое» в ход нотации. */
  private moveFor(axis: 'x' | 'y' | 'z', layer: number, sgn: number): Move | null {
    // Для каждой оси: [грань при +1, грань при 0, грань при −1]; знак «по часовой» из MOVE_GEOM.
    const table: Record<'x' | 'y' | 'z', Axis[]> = { x: ['R', 'M', 'L'], y: ['U', 'E', 'D'], z: ['F', 'S', 'B'] };
    const face = table[axis][1 - layer];
    if (!face) return null;
    const clockwise = MOVE_GEOM[face].sign; // угол по часовой вокруг +оси
    return { axis: face, turns: Math.sign(sgn) === Math.sign(clockwise) ? 1 : 3 };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
