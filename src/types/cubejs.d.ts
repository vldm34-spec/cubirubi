// Минимальные типы для cubejs (ldez/cubejs) — реализация двухфазного алгоритма Кочембы.
declare module 'cubejs' {
  class Cube {
    constructor(state?: string);
    static initSolver(): void;
    static random(): Cube;
    static fromString(s: string): Cube;
    move(alg: string): Cube;
    solve(maxDepth?: number): string;
    asString(): string;
    isSolved(): boolean;
  }
  export = Cube;
}
