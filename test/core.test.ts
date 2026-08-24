import { describe, expect, it } from 'vitest';
import {
  applyMove, applyMoves, fromFaceletString, idx, invertMoves, isSolved, randomScramble,
  simplify, solvedState, statesEqual, toFaceletString, AXES,
} from '../src/core/cube';
import { formatRussian, formatSingmaster, parse } from '../src/core/notation';
import { PATTERNS } from '../src/core/patterns';
import { BruteForceSearch } from '../src/core/search';

const S = solvedState();

describe('модель куба', () => {
  it('четыре четвертьоборота любой оси = тождество', () => {
    for (const axis of AXES) {
      let s = S;
      for (let i = 0; i < 4; i++) s = applyMove(s, { axis, turns: 1 });
      expect(statesEqual(s, S), axis).toBe(true);
    }
  });

  it('ход и обратный ход гасят друг друга', () => {
    for (const axis of AXES) {
      const s = applyMoves(S, [{ axis, turns: 1 }, { axis, turns: 3 }]);
      expect(statesEqual(s, S), axis).toBe(true);
    }
  });

  it('порядок (R U) равен 105, а (R U\') — 63', () => {
    const order = (moves: string) => {
      const m = parse(moves);
      let s = S, n = 0;
      do { s = applyMoves(s, m); n++; } while (!statesEqual(s, S) && n < 1000);
      return n;
    };
    expect(order('R U')).toBe(105);
    expect(order("R U'")).toBe(63);
    expect(order("R U R' U'")).toBe(6);
  });

  it('направление: после U верхний ряд F переезжает на L, после R правый столбец F — на U', () => {
    const u = applyMove(S, { axis: 'U', turns: 1 });
    expect(u[idx('L', 0, 0)]).toBe(2); // цвет F = 2
    expect(u[idx('R', 0, 0)]).toBe(5); // на R пришёл B = 5
    const r = applyMove(S, { axis: 'R', turns: 1 });
    expect(r[idx('U', 0, 2)]).toBe(2);
    expect(r[idx('B', 2, 0)]).toBe(0); // U (0) ушёл на B
  });

  it('фейслет-строка совпадает с cubejs для R U', () => {
    const s = applyMoves(S, parse('R U'));
    expect(toFaceletString(s)).toBe('UUUUUUFFFUBBRRRRRRRRRFFDFFDDDBDDBDDBFFDLLLLLLLLLUBBUBB');
    expect(statesEqual(fromFaceletString(toFaceletString(s)), s)).toBe(true);
  });

  it('повороты куба x y z не меняют «собранность»', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(isSolved(applyMove(S, { axis, turns: 1 }))).toBe(true);
    }
    // x = R M' L' — центры должны переехать: U → F
    const x = applyMove(S, { axis: 'x', turns: 1 });
    expect(x[idx('U', 1, 1)]).toBe(2);
  });

  it('simplify склеивает и гасит ходы', () => {
    expect(formatSingmaster(simplify(parse("R R R'")))).toBe('R');
    expect(formatSingmaster(simplify(parse('R R R R U')))).toBe('U');
    expect(formatSingmaster(simplify(parse("U U")))).toBe('U2');
  });
});

describe('нотация', () => {
  it('три формата сайта дают одно и то же', () => {
    const a = parse('ппллввннффтт');
    const b = parse('R2 L2 U2 D2 F2 B2');
    const c = parse('R2 L2 U2 D2 F2 B2'.replace(/2/g, '2'));
    expect(statesEqual(applyMoves(S, a), applyMoves(S, b))).toBe(true);
    expect(statesEqual(applyMoves(S, b), applyMoves(S, c))).toBe(true);
  });

  it('цифра 3 и штрих — обратный ход, прописная русская — тоже', () => {
    expect(formatSingmaster(parse('L3 F1'))).toBe("L' F");
    expect(formatSingmaster(parse("D F2 U'"))).toBe("D F2 U'");
    expect(formatSingmaster(parse('лП'))).toBe("L R'");
    expect(formatRussian(parse("L R' U2"))).toBe('лПвв');
  });

  it('мусор — ошибка с позицией', () => {
    expect(() => parse('R Q')).toThrow(/Q/);
  });
});

describe('узоры', () => {
  it('все 27 узоров разбираются и не оставляют куб собранным', () => {
    for (const p of PATTERNS) {
      const m = parse(p.moves);
      expect(m.length, p.name).toBeGreaterThan(0);
      const s = applyMoves(S, m);
      expect(isSolved(s), p.name).toBe(false);
      // обратная строка возвращает в исходное
      expect(statesEqual(applyMoves(s, invertMoves(m)), S), p.name).toBe(true);
    }
  });

  it('«Шахматы второго порядка» — настоящие шахматы: рёбра в цвет противоположной грани', () => {
    const s = applyMoves(S, parse(PATTERNS[0].moves));
    const opp = [3, 4, 5, 0, 1, 2];
    for (let f = 0; f < 6; f++) {
      expect(s[f * 9 + 1]).toBe(opp[f]);
      expect(s[f * 9 + 0]).toBe(f);
    }
  });
});

describe('перебор', () => {
  it('находит решение для перемешки из 4 ходов (HTM, с отсечениями)', () => {
    const scr = parse("R U' F2 L");
    const search = new BruteForceSearch(applyMoves(S, scr), { metric: 'HTM', maxDepth: 6, uniqueLimit: 0, pruning: true });
    let st = search.step(5000);
    while (!st.done) st = search.step(5000);
    expect(st.solution).not.toBeNull();
    expect(st.solution!.length).toBe(4);
    expect(isSolved(applyMoves(applyMoves(S, scr), st.solution!))).toBe(true);
  });

  it('QTM без отсечений тоже находит, но узлов больше', () => {
    const scr = parse("R U'");
    const a = new BruteForceSearch(applyMoves(S, scr), { metric: 'QTM', maxDepth: 4, uniqueLimit: 100000, pruning: false });
    const b = new BruteForceSearch(applyMoves(S, scr), { metric: 'QTM', maxDepth: 4, uniqueLimit: 100000, pruning: true });
    let sa = a.step(5000); while (!sa.done) sa = a.step(5000);
    let sb = b.step(5000); while (!sb.done) sb = b.step(5000);
    expect(sa.solution!.length).toBe(2);
    expect(sb.solution!.length).toBe(2);
    expect(sa.nodes).toBeGreaterThan(sb.nodes);
    expect(sa.repeats).toBeGreaterThan(0);
    // без отсечений на 1 уровне 12 узлов и все уникальны; далее — повторы
    expect(sa.unique).toBeGreaterThan(12);
  });

  it('случайная перемешка не повторяет грань подряд', () => {
    const m = randomScramble(50);
    for (let i = 1; i < m.length; i++) expect(m[i].axis).not.toBe(m[i - 1].axis);
  });
});
