/**
 * «Сборка прямым перебором» — то, что на старом сайте делали `ndarvin()` и `per()`.
 *
 * Здесь это честный IDDFS (поиск в глубину с итеративным углублением):
 *  - рекурсия по дереву состояний, а не по разрядам счётчика;
 *  - куб доворачивается дельтой и откатывается (apply/undo), без пересборки;
 *  - отсечения: не крутим ту же грань подряд (в HTM) и не делаем обратный ход
 *    или третий одинаковый подряд (в QTM), противоположные грани — в фиксированном порядке;
 *  - вся работа режется на кванты по времени, чтобы вызывать из Worker
 *    и отдавать статистику наружу, не блокируя ничего.
 *
 * Метрика:
 *  - QTM (12 ходов) — то, что перебирал автор сайта; число Бога здесь 26;
 *  - HTM (18 ходов) — стандартная; число Бога 20.
 */

import { FACES, PERMS, isSolved, stateKey, type Move, type State } from './cube';

export type Metric = 'QTM' | 'HTM';

export interface SearchOptions {
  metric: Metric;
  maxDepth: number;
  /** Считать уникальные состояния (память!). 0 — не считать. */
  uniqueLimit: number;
  /** Отсечения включены? Выключить, чтобы воспроизвести «честный» перебор автора. */
  pruning: boolean;
}

export interface SearchStats {
  depth: number;          // текущий уровень углубления
  nodes: number;          // всего посещённых узлов (= сгенерированных кубиков)
  nodesAtDepth: number;   // узлов на текущем уровне
  unique: number;         // уникальных состояний (если считаем)
  repeats: number;        // повторов
  elapsedMs: number;
  path: Move[];           // текущая ветка — для отрисовки
  solution: Move[] | null;
  done: boolean;
}

interface MoveDef { axis: Move['axis']; turns: 1 | 2 | 3; face: number; perm: Uint8Array }

function moveSet(metric: Metric): MoveDef[] {
  const out: MoveDef[] = [];
  FACES.forEach((axis, face) => {
    const turnsList: (1 | 2 | 3)[] = metric === 'QTM' ? [1, 3] : [1, 2, 3];
    for (const turns of turnsList) out.push({ axis, turns, face, perm: PERMS[axis][turns]! });
  });
  return out;
}

const OPPOSITE = [3, 4, 5, 0, 1, 2]; // U↔D, R↔L, F↔B

/**
 * Итератор перебора. Каждый вызов `step(budgetMs)` работает не дольше бюджета
 * и возвращает статистику; так рекурсия остаётся резюмируемой между тиками.
 *
 * Реализация — явный стек вместо рекурсии: рекурсивный DFS нельзя прервать
 * по времени, состояние живёт в кадрах стека. Здесь оно в массивах.
 */
export class BruteForceSearch {
  private readonly moves: MoveDef[];
  private readonly state: State;
  private readonly tmp = new Uint8Array(54);
  private readonly path: number[] = [];      // индексы ходов на пути
  private readonly next: number[] = [];      // следующий индекс хода для перебора на каждом уровне
  private depth = 1;
  private nodes = 0;
  private nodesAtDepth = 0;
  private unique = 0;
  private repeats = 0;
  private seen: Set<string> | null;
  private startedAt = 0;
  private workedMs = 0;
  private solution: Move[] | null = null;
  private done = false;

  constructor(start: State, private readonly opts: SearchOptions) {
    this.moves = moveSet(opts.metric);
    this.state = new Uint8Array(start);
    this.seen = opts.uniqueLimit > 0 ? new Set() : null;
    if (isSolved(this.state)) { this.solution = []; this.done = true; }
    this.next.push(0);
  }

  private apply(m: MoveDef): void {
    const s = this.state, t = this.tmp, p = m.perm;
    for (let i = 0; i < 54; i++) t[i] = s[p[i]];
    s.set(t);
  }

  private undo(m: MoveDef): void {
    const s = this.state, t = this.tmp, p = m.perm;
    // обратная перестановка: t[p[i]] = s[i]
    for (let i = 0; i < 54; i++) t[p[i]] = s[i];
    s.set(t);
  }

  /** Можно ли делать ход `m` после текущего пути? */
  private allowed(m: MoveDef): boolean {
    if (!this.opts.pruning) return true;
    const n = this.path.length;
    if (n === 0) return true;
    const last = this.moves[this.path[n - 1]];
    if (this.opts.metric === 'HTM') {
      if (last.face === m.face) return false;                  // та же грань — уже покрыто одним ходом
    } else {
      if (last.face === m.face) {
        if (last.turns !== m.turns) return false;              // U U' — отмена
        if (n >= 2 && this.moves[this.path[n - 2]].face === m.face) return false; // U U U ≡ U'
      }
    }
    // противоположные грани коммутируют: разрешаем только порядок «меньшая грань раньше»
    if (OPPOSITE[last.face] === m.face && m.face < last.face) return false;
    return true;
  }

  private account(): void {
    this.nodes++; this.nodesAtDepth++;
    if (this.seen) {
      if (this.seen.size < this.opts.uniqueLimit) {
        const k = stateKey(this.state);
        if (this.seen.has(k)) this.repeats++; else { this.seen.add(k); this.unique++; }
      } else {
        // память кончилась — просто считаем узлы, статистика уникальных замораживается
      }
    }
  }

  /** Отработать не дольше `budgetMs` миллисекунд. */
  step(budgetMs: number): SearchStats {
    if (this.done) return this.stats();
    const t0 = performance.now();
    if (!this.startedAt) this.startedAt = t0;
    const deadline = t0 + budgetMs;
    let tick = 0;

    while (!this.done) {
      if ((++tick & 1023) === 0 && performance.now() > deadline) break;

      const level = this.path.length;
      if (level === this.depth) {
        // лист: проверяем и откатываемся
        if (isSolved(this.state)) {
          this.solution = this.path.map((i) => ({ axis: this.moves[i].axis, turns: this.moves[i].turns }));
          this.done = true;
          break;
        }
        this.pop();
        continue;
      }

      // пробуем следующий ход на этом уровне
      let i = this.next[level];
      while (i < this.moves.length && !this.allowed(this.moves[i])) i++;
      if (i >= this.moves.length) {
        if (level === 0) {
          // уровень исчерпан → углубляемся
          this.depth++;
          this.nodesAtDepth = 0;
          this.next[0] = 0;
          if (this.depth > this.opts.maxDepth) { this.done = true; break; }
          continue;
        }
        this.pop();
        continue;
      }
      this.next[level] = i + 1;
      const m = this.moves[i];
      this.apply(m);
      this.path.push(i);
      this.next.push(0);
      this.account();
    }
    this.workedMs += performance.now() - t0;
    return this.stats();
  }

  private pop(): void {
    const i = this.path.pop()!;
    this.next.pop();
    this.undo(this.moves[i]);
  }

  stats(): SearchStats {
    return {
      depth: this.depth,
      nodes: this.nodes,
      nodesAtDepth: this.nodesAtDepth,
      unique: this.unique,
      repeats: this.repeats,
      elapsedMs: this.workedMs,
      path: this.path.map((i) => ({ axis: this.moves[i].axis, turns: this.moves[i].turns })),
      solution: this.solution,
      done: this.done,
    };
  }
}
