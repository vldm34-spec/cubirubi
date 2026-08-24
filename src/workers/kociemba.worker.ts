/**
 * Worker решателя Кочембы (двухфазный алгоритм, пакет cubejs).
 * Инициализация таблиц занимает 1–3 с, поэтому делается один раз в фоне.
 */
import Cube from 'cubejs';

export type KociembaIn = { type: 'init' } | { type: 'solve'; facelets: string; id: number };
export type KociembaOut =
  | { type: 'ready' }
  | { type: 'solution'; id: number; alg: string; ms: number }
  | { type: 'error'; id: number; message: string };

let ready = false;
const post = (m: KociembaOut) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<KociembaIn>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    if (!ready) { Cube.initSolver(); ready = true; }
    post({ type: 'ready' });
  } else if (msg.type === 'solve') {
    try {
      if (!ready) { Cube.initSolver(); ready = true; }
      const t0 = performance.now();
      const alg = Cube.fromString(msg.facelets).solve(22);
      post({ type: 'solution', id: msg.id, alg, ms: performance.now() - t0 });
    } catch (err) {
      post({ type: 'error', id: msg.id, message: String((err as Error).message ?? err) });
    }
  }
};
