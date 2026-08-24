import { describe, expect, it } from 'vitest';
import Cube from 'cubejs';
import { applyMoves, isSolved, randomScramble, solvedState, toFaceletString } from '../src/core/cube';
import { parse } from '../src/core/notation';

describe('решатель Кочембы (cubejs) совместим с нашей моделью', () => {
  it('решение cubejs действительно собирает наш куб', () => {
    Cube.initSolver();
    for (let k = 0; k < 3; k++) {
      const scr = randomScramble(20);
      const state = applyMoves(solvedState(), scr);
      const alg = Cube.fromString(toFaceletString(state)).solve(22);
      const sol = parse(alg);
      expect(sol.length).toBeLessThanOrEqual(22);
      expect(isSolved(applyMoves(state, sol))).toBe(true);
    }
  }, 30000);
});
