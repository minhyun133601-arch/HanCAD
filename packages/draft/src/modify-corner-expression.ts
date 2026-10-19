const functions: Readonly<Record<string, (...args: number[]) => number>> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  min: Math.min,
  max: Math.max,
  sin: (n) => Math.sin((n * Math.PI) / 180),
  cos: (n) => Math.cos((n * Math.PI) / 180),
  tan: (n) => Math.tan((n * Math.PI) / 180),
  asin: (n) => (Math.asin(n) * 180) / Math.PI,
  acos: (n) => (Math.acos(n) * 180) / Math.PI,
  atan: (n) => (Math.atan(n) * 180) / Math.PI,
};
/** Numeric expressions only: named constraint parameters belong to the Phase 18 solver. */
export function cornerExpression(source: string): number | undefined {
  const normalized = source.toLowerCase();
  const tokens = normalized.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[(),+\-*/^%]/g);
  if (!tokens || tokens.join('') !== normalized.replace(/\s/g, '')) return undefined;
  let index = 0;
  const primary = (): number => {
    const token = tokens[index++];
    if (token === '(') {
      const value = sum();
      if (tokens[index++] !== ')') throw new Error('Expression parentheses');
      return value;
    }
    if (token === 'pi') return Math.PI;
    if (token === 'e') return Math.E;
    if (token && Object.prototype.hasOwnProperty.call(functions, token)) {
      if (tokens[index++] !== '(') throw new Error('Expression function');
      const args = [sum()];
      while (tokens[index] === ',') {
        index++;
        args.push(sum());
      }
      if (tokens[index++] !== ')') throw new Error('Expression function arguments');
      return functions[token]!(...args);
    }
    const value = Number(token);
    if (!token || !Number.isFinite(value)) throw new Error('Expression number');
    return value;
  };
  const power = (): number => {
    const value = primary();
    return tokens[index] === '^' ? (index++, value ** unary()) : value;
  };
  const unary = (): number =>
    tokens[index] === '+'
      ? (index++, unary())
      : tokens[index] === '-'
        ? (index++, -unary())
        : power();
  const product = (): number => {
    let value = unary();
    while (tokens[index] === '*' || tokens[index] === '/' || tokens[index] === '%') {
      const op = tokens[index++],
        next = unary();
      value = op === '*' ? value * next : op === '/' ? value / next : value % next;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const op = tokens[index++],
        next = product();
      value = op === '+' ? value + next : value - next;
    }
    return value;
  };
  try {
    const value = sum();
    return index === tokens.length && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
