import { formatAngle, formatLinear } from './diesel-format';

/** What DIESEL may read from the running application. */
export interface DieselHost {
  getvar(name: string): string | undefined;
  getenv?(name: string): string | undefined;
  /** Current linear/angular units (LUNITS, LUPREC, AUNITS, AUPREC). */
  units(): { lunits: number; luprec: number; aunits: number; auprec: number };
  /** Start of the outermost evaluation, for $(edtime,0,...). */
  now?(): Date;
}

/** AutoCAD limits a function to ten parameters including its name. */
const maxParameters = 10;
const maxOutput = 4096;

class DieselSyntaxError extends Error {}
class DieselOverflow extends Error {}

type Evaluate = (source: string) => string;
type Builtin = (
  args: readonly string[],
  evaluate: Evaluate,
  host: DieselHost,
) => string | undefined;

function number(text: string): number {
  const value = Number.parseFloat(text.trim());
  return Number.isFinite(value) ? value : 0;
}
function integer(text: string): number {
  return Math.trunc(number(text));
}
/** Integers print without decimals; reals to fifteen significant digits. */
function numeric(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(15)));
}
const all = (args: readonly string[], evaluate: Evaluate) => args.map((arg) => evaluate(arg));

function arithmetic(reduce: (a: number, b: number) => number | undefined): Builtin {
  return (args, evaluate) => {
    if (args.length < 1) return undefined;
    const values = all(args, evaluate).map(number);
    let result = values[0]!;
    for (const value of values.slice(1)) {
      const next = reduce(result, value);
      if (next === undefined) return undefined;
      result = next;
    }
    return numeric(result);
  };
}
function compare(test: (a: number, b: number) => boolean): Builtin {
  return (args, evaluate) => {
    if (args.length !== 2) return undefined;
    const [a = '', b = ''] = all(args, evaluate);
    return test(number(a), number(b)) ? '1' : '0';
  };
}
function bitwise(reduce: (a: number, b: number) => number): Builtin {
  return (args, evaluate) =>
    args.length < 1 ? undefined : String(all(args, evaluate).map(integer).reduce(reduce));
}

/** AutoCAD's Julian day of 1970-01-01, counted from local midnight (see DATE). */
const julianEpoch = 2440588;
/** A Date whose UTC fields hold the local wall-clock time. */
function wallClock(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
    ),
  );
}
function edtime(time: number, picture: string, now: Date): string {
  const date = time === 0 ? wallClock(now) : new Date(Math.round((time - julianEpoch) * 86400000));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const twelve = /AM\/PM|am\/pm|A\/P|a\/p/.test(picture);
  const hours = date.getUTCHours();
  const hour = twelve ? hours % 12 || 12 : hours;
  const two = (value: number) => String(value).padStart(2, '0');
  const phrases: [RegExp, () => string][] = [
    [/^"([^"]*)"/, () => ''],
    [/^DDDD/, () => dayNames[date.getUTCDay()]!],
    [/^DDD/, () => days[date.getUTCDay()]!],
    [/^DD/, () => two(date.getUTCDate())],
    [/^D/, () => String(date.getUTCDate())],
    [/^MONTH/, () => monthNames[date.getUTCMonth()]!],
    [/^MON/, () => months[date.getUTCMonth()]!],
    [/^MO/, () => two(date.getUTCMonth() + 1)],
    [/^MSEC/, () => String(date.getUTCMilliseconds()).padStart(3, '0')],
    [/^MM/, () => two(date.getUTCMinutes())],
    [/^M/, () => String(date.getUTCMonth() + 1)],
    [/^YYYY/, () => String(date.getUTCFullYear())],
    [/^YY/, () => two(date.getUTCFullYear() % 100)],
    [/^HH/, () => two(hour)],
    [/^H/, () => String(hour)],
    [/^SS/, () => two(date.getUTCSeconds())],
    [/^AM\/PM/, () => (hours < 12 ? 'AM' : 'PM')],
    [/^am\/pm/, () => (hours < 12 ? 'am' : 'pm')],
    [/^A\/P/, () => (hours < 12 ? 'A' : 'P')],
    [/^a\/p/, () => (hours < 12 ? 'a' : 'p')],
  ];
  let output = '';
  let rest = picture;
  outer: while (rest) {
    for (const [pattern, replace] of phrases) {
      const match = pattern.exec(rest);
      if (!match) continue;
      // A quoted run (e.g. a comma) is copied literally.
      output += match[1] !== undefined && pattern.source.startsWith('^"') ? match[1] : replace();
      rest = rest.slice(match[0].length);
      continue outer;
    }
    output += rest[0];
    rest = rest.slice(1);
  }
  return output;
}

const builtins: Readonly<Record<string, Builtin>> = {
  '+': arithmetic((a, b) => a + b),
  '-': arithmetic((a, b) => a - b),
  '*': arithmetic((a, b) => a * b),
  '/': arithmetic((a, b) => (b === 0 ? undefined : a / b)),
  '=': compare((a, b) => a === b),
  '!=': compare((a, b) => a !== b),
  '<': compare((a, b) => a < b),
  '>': compare((a, b) => a > b),
  '<=': compare((a, b) => a <= b),
  '>=': compare((a, b) => a >= b),
  and: bitwise((a, b) => a & b),
  or: bitwise((a, b) => a | b),
  xor: bitwise((a, b) => a ^ b),
  eq: (args, evaluate) => {
    if (args.length !== 2) return undefined;
    const [a = '', b = ''] = all(args, evaluate);
    return a.trim() === b.trim() ? '1' : '0';
  },
  if: (args, evaluate) => {
    if (args.length < 2 || args.length > 3) return undefined;
    return number(evaluate(args[0]!)) !== 0 ? evaluate(args[1]!) : evaluate(args[2] ?? '');
  },
  nth: (args, evaluate) => {
    if (args.length < 2) return undefined;
    const which = integer(evaluate(args[0]!));
    const chosen = args[which + 1];
    return which < 0 || chosen === undefined ? undefined : evaluate(chosen);
  },
  index: (args, evaluate) => {
    if (args.length !== 2) return undefined;
    const [which = '', text = ''] = all(args, evaluate);
    return text.split(',')[integer(which)] ?? '';
  },
  strlen: (args, evaluate) => (args.length === 1 ? String(evaluate(args[0]!).length) : undefined),
  substr: (args, evaluate) => {
    if (args.length < 2 || args.length > 3) return undefined;
    const [text = '', start = '', length] = all(args, evaluate);
    const from = Math.max(0, integer(start) - 1);
    return length === undefined
      ? text.slice(from)
      : text.slice(from, from + Math.max(0, integer(length)));
  },
  upper: (args, evaluate) => (args.length === 1 ? evaluate(args[0]!).toUpperCase() : undefined),
  fix: (args, evaluate) => (args.length === 1 ? String(integer(evaluate(args[0]!))) : undefined),
  rtos: (args, evaluate, host) => {
    if (args.length < 1 || args.length > 3) return undefined;
    const [value = '', mode, precision] = all(args, evaluate);
    const units = host.units();
    return formatLinear(
      number(value),
      mode === undefined ? units.lunits : integer(mode),
      precision === undefined ? units.luprec : integer(precision),
    );
  },
  angtos: (args, evaluate, host) => {
    if (args.length < 1 || args.length > 3) return undefined;
    const [value = '', mode, precision] = all(args, evaluate);
    const units = host.units();
    return formatAngle(
      number(value),
      mode === undefined ? units.aunits : integer(mode),
      precision === undefined ? units.auprec : integer(precision),
    );
  },
  getvar: (args, evaluate, host) =>
    args.length === 1 ? (host.getvar(evaluate(args[0]!).trim()) ?? '') : undefined,
  getenv: (args, evaluate, host) =>
    args.length === 1 ? (host.getenv?.(evaluate(args[0]!).trim()) ?? '') : undefined,
  eval: (args, evaluate) => (args.length === 1 ? evaluate(evaluate(args[0]!)) : undefined),
  edtime: (args, evaluate, host) => {
    if (args.length !== 2) return undefined;
    const [time = '', picture = ''] = args.map((arg, index) =>
      index === 1 ? arg.trim() : evaluate(arg),
    );
    return edtime(number(time), picture, host.now?.() ?? new Date());
  },
};

/** Splits "name,arg,..." at top-level commas, keeping quotes and nested $( ) intact. */
function splitArguments(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let index = 0; index < body.length; index++) {
    const character = body[index]!;
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === '(') depth++;
    else if (!quoted && character === ')') depth--;
    if (!quoted && depth === 0 && character === ',') {
      parts.push(current);
      current = '';
    } else current += character;
  }
  parts.push(current);
  return parts;
}

/** Finds the ")" closing the "$(" at `start`, honoring quotes; -1 when unbalanced. */
function closing(source: string, start: number): number {
  let depth = 0;
  let quoted = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (character === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (character === '(') depth++;
    else if (character === ')' && --depth === 0) return index;
  }
  return -1;
}

/**
 * Evaluates DIESEL text: literal characters pass through, $(function,args...) calls
 * are replaced by their results and errors are embedded as AutoCAD does:
 * "$?" syntax, "$(func,??)" bad arguments, "$(func)??" unknown function, "$(++)" overflow.
 */
export function evaluateDiesel(source: string, host: DieselHost): string {
  const started = host.now?.() ?? new Date();
  const fixedHost: DieselHost = { ...host, now: () => started };
  const evaluate = (text: string): string => {
    let output = '';
    let index = 0;
    while (index < text.length) {
      if (output.length > maxOutput) throw new DieselOverflow();
      const character = text[index]!;
      if (character === '"') {
        // A quoted run is literal; two adjacent quote marks stand for one.
        let end = index + 1;
        for (;;) {
          if (end >= text.length) throw new DieselSyntaxError();
          if (text[end] === '"' && text[end + 1] === '"') {
            output += '"';
            end += 2;
          } else if (text[end] === '"') break;
          else output += text[end++];
        }
        index = end + 1;
        continue;
      }
      if (character !== '$' || text[index + 1] !== '(') {
        output += character;
        index++;
        continue;
      }
      const end = closing(text, index + 1);
      if (end < 0) throw new DieselSyntaxError();
      const [rawName = '', ...args] = splitArguments(text.slice(index + 2, end));
      const name = rawName.trim().toLowerCase();
      const builtin = builtins[name];
      if (!builtin) output += `$(${rawName.trim()})??`;
      else {
        const result =
          args.length + 1 > maxParameters ? undefined : builtin(args, evaluate, fixedHost);
        output += result ?? `$(${rawName.trim()},??)`;
      }
      index = end + 1;
    }
    if (output.length > maxOutput) throw new DieselOverflow();
    return output;
  };
  try {
    return evaluate(source);
  } catch (error) {
    if (error instanceof DieselOverflow) return '$(++)';
    if (error instanceof DieselSyntaxError) return '$?';
    throw error;
  }
}
