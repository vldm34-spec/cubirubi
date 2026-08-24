/**
 * Worker прямого перебора. Держит BruteForceSearch и по команде «start»
 * гоняет его квантами по 60 мс, отдавая статистику наружу примерно 10 раз в секунду.
 * Главный поток при этом свободен: рисует куб, графики и дерево.
 */
import { BruteForceSearch, type SearchOptions, type SearchStats } from '../core/search';

export type SearchIn =
  | { type: 'start'; state: Uint8Array; opts: SearchOptions }
  | { type: 'stop' };
export type SearchOut = { type: 'stats'; stats: SearchStats };

let current: BruteForceSearch | null = null;
let running = false;

function loop(): void {
  if (!current || !running) return;
  const stats = current.step(60);
  (self as unknown as Worker).postMessage({ type: 'stats', stats } satisfies SearchOut);
  if (stats.done) { running = false; return; }
  setTimeout(loop, 0); // отдаём очередь событий, чтобы «stop» успел прийти
}

self.onmessage = (e: MessageEvent<SearchIn>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    current = new BruteForceSearch(msg.state, msg.opts);
    running = true;
    loop();
  } else if (msg.type === 'stop') {
    running = false;
  }
};
