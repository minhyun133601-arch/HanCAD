import { DrawingDatabase, EventBus } from '@hancad/db';
import type { SymbolTableName } from '@hancad/db';
import { getSystemVariableDefinition, systemVariableDefinitions } from './registry';
import type { SystemVariableDefinition, SysvarValue } from './registry';

export interface SystemVariableErrorDetails {
  reason?: 'not-number' | 'not-toggleable' | 'missing-symbol';
  reference?: string;
  min?: number;
  max?: number;
}

export interface SystemVariableErrorMessages {
  sysvarUnknown: (name: string) => string;
  sysvarReadonly: (name: string) => string;
  sysvarUnavailable: (name: string) => string;
  sysvarInvalid: (name: string, range: string) => string;
  sysvarNotNumber: (name: string) => string;
  sysvarNotToggleable: (name: string) => string;
  sysvarMissingSymbol: (name: string, reference: string) => string;
  sysvarRangeMinimum: (minimum: number) => string;
  sysvarRangeMaximum: (maximum: number) => string;
  sysvarRangeBetween: (minimum: number, maximum: number) => string;
}

export class SystemVariableError extends Error {
  constructor(
    readonly variable: string,
    readonly code: 'unknown' | 'readonly' | 'invalid' | 'unavailable',
    message: string,
    readonly details: SystemVariableErrorDetails = {},
  ) {
    super(message);
    this.name = 'SystemVariableError';
  }
}

/** Presentation stays at the command/UI boundary; validation has no locale. */
export function formatSystemVariableError(
  error: SystemVariableError,
  messages: SystemVariableErrorMessages,
): string {
  const { variable, code, details } = error;
  if (code === 'unknown') return messages.sysvarUnknown(variable);
  if (code === 'readonly') return messages.sysvarReadonly(variable);
  if (code === 'unavailable') return messages.sysvarUnavailable(variable);
  if (details.reason === 'not-number') return messages.sysvarNotNumber(variable);
  if (details.reason === 'not-toggleable') return messages.sysvarNotToggleable(variable);
  if (details.reason === 'missing-symbol')
    return messages.sysvarMissingSymbol(variable, details.reference ?? '');
  const range =
    details.min !== undefined && details.max !== undefined
      ? messages.sysvarRangeBetween(details.min, details.max)
      : details.min !== undefined
        ? messages.sysvarRangeMinimum(details.min)
        : details.max !== undefined
          ? messages.sysvarRangeMaximum(details.max)
          : '';
  return messages.sysvarInvalid(variable, range);
}

export class SystemVariableProfile {
  readonly values = new Map<string, SysvarValue>();
  readonly events = new EventBus<{ name: string; value: SysvarValue | undefined }>();
}

export interface SystemVariablesOptions {
  database?: DrawingDatabase;
  profile?: SystemVariableProfile;
  runtimeValues?: () => Readonly<Record<string, SysvarValue>>;
  /** Lazily resolved host value by canonical name; preferred for costly facts. */
  runtimeValue?: (name: string) => SysvarValue | undefined;
}

export class SystemVariables {
  readonly database: DrawingDatabase;
  readonly profile: SystemVariableProfile;
  readonly events = new EventBus<{ name: string; value: SysvarValue | undefined }>();
  private readonly sessionValues = new Map<string, SysvarValue>();
  private readonly unsubscribers: (() => void)[];
  private readonly runtimeLookup: (name: string) => SysvarValue | undefined;

  constructor(options: SystemVariablesOptions = {}) {
    this.database = options.database ?? new DrawingDatabase();
    this.profile = options.profile ?? new SystemVariableProfile();
    const { runtimeValues, runtimeValue } = options;
    this.runtimeLookup = (name) => runtimeValue?.(name) ?? runtimeValues?.()[name];
    this.unsubscribers = [
      this.database.events.subscribe((event) => {
        if (event.type === 'sysvar-changed') {
          const definition = getSystemVariableDefinition(event.name);
          if (definition)
            this.events.publish({
              name: event.name,
              value:
                event.value === undefined && definition.default === undefined
                  ? undefined
                  : this.get(event.name),
            });
        }
        if (event.type === 'history-changed')
          this.events.publish({ name: 'UNDOCTL', value: this.database.undoControl });
      }),
      this.profile.events.subscribe((event) => this.events.publish(structuredClone(event))),
    ];
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
  }

  get(name: string): SysvarValue {
    const definition = this.requireDefinition(name);
    if (definition.name === 'UNDOCTL') return this.database.undoControl;
    if (definition.name === 'HANDSEED') return this.database.handseed;
    const runtime = definition.readonly ? this.runtimeLookup(definition.name) : undefined;
    if (runtime !== undefined) {
      validateSystemVariable(definition, runtime);
      return structuredClone(runtime);
    }
    const stored =
      definition.scope === 'drawing'
        ? this.database.getVariable(definition.name)
        : definition.scope === 'profile'
          ? this.profile.values.get(definition.name)
          : this.sessionValues.get(definition.name);
    if (stored === undefined) {
      // Writable host-defined values (CLAYOUT) report the host state until set.
      const fallback = definition.readonly ? undefined : this.runtimeLookup(definition.name);
      if (fallback !== undefined) {
        validateSystemVariable(definition, fallback);
        return structuredClone(fallback);
      }
      if (definition.default === undefined)
        throw new SystemVariableError(
          definition.name,
          'unavailable',
          `${definition.name}의 초기값은 현재 환경에서 아직 확인할 수 없습니다.`,
        );
      return structuredClone(definition.default);
    }
    validateSystemVariable(definition, stored);
    return structuredClone(stored as SysvarValue);
  }

  getNumber(name: string): number {
    const value = this.get(name);
    if (typeof value !== 'number')
      throw new SystemVariableError(name, 'invalid', `${name}은(는) 숫자 변수가 아닙니다.`, {
        reason: 'not-number',
      });
    return value;
  }

  set(name: string, value: SysvarValue): void {
    const definition = this.requireDefinition(name);
    if (definition.readonly)
      throw new SystemVariableError(
        definition.name,
        'readonly',
        `${definition.name}은(는) 읽기 전용 시스템 변수입니다.`,
      );
    validateSystemVariable(definition, value);
    value = this.validateSymbolReference(definition.name, value);
    if (definition.scope === 'drawing') {
      this.database.transaction(`SETVAR ${definition.name}`, (transaction) =>
        transaction.setVariable(definition.name, value),
      );
    } else if (definition.scope === 'profile') {
      this.profile.values.set(definition.name, structuredClone(value));
      this.profile.events.publish({ name: definition.name, value: structuredClone(value) });
    } else {
      this.sessionValues.set(definition.name, structuredClone(value));
      this.events.publish({ name: definition.name, value: structuredClone(value) });
    }
  }

  /** Restore every variable scope when a composed synchronous command fails. */
  atomic<Result>(label: string, operation: () => Result): Result {
    const profile = new Map(structuredClone([...this.profile.values])),
      session = new Map(structuredClone([...this.sessionValues]));
    try {
      return this.database.atomic(label, operation);
    } catch (error) {
      const restore = (
        target: Map<string, SysvarValue>,
        before: Map<string, SysvarValue>,
        publish: (name: string, value: SysvarValue | undefined) => void,
      ) => {
        const changed = [...new Set([...target.keys(), ...before.keys()])].filter(
          (name) => JSON.stringify(target.get(name)) !== JSON.stringify(before.get(name)),
        );
        target.clear();
        for (const [name, value] of before) target.set(name, structuredClone(value));
        for (const name of changed)
          publish(name, before.get(name) ?? getSystemVariableDefinition(name)?.default);
      };
      restore(this.profile.values, profile, (name, value) =>
        this.profile.events.publish({ name, value }),
      );
      restore(this.sessionValues, session, (name, value) => this.events.publish({ name, value }));
      throw error;
    }
  }

  /** Host command/OS state bypasses SETVAR and the drawing journal, with the same validation. */
  setRuntimeSessionValue(name: string, value: SysvarValue): void {
    const definition = this.requireDefinition(name);
    if (!definition.readonly || definition.scope !== 'session' || definition.name === 'UNDOCTL')
      throw new SystemVariableError(
        definition.name,
        'readonly',
        `${definition.name}은(는) 런타임 세션 값으로 변경할 수 없습니다.`,
      );
    validateSystemVariable(definition, value);
    this.sessionValues.set(definition.name, structuredClone(value));
    this.events.publish({ name: definition.name, value: this.get(definition.name) });
  }

  toggle(name: string): SysvarValue {
    const definition = this.requireDefinition(name);
    const current = this.get(name);
    let value: SysvarValue;
    if (typeof current === 'boolean') value = !current;
    else if (typeof current === 'number' && definition.toggleBit !== undefined)
      value = current ^ definition.toggleBit;
    else if (typeof current === 'number' && definition.min === 0 && definition.max === 1)
      value = current === 0 ? 1 : 0;
    else if (definition.name === 'DYNMODE') value = current === 0 ? 3 : -(current as number);
    else
      throw new SystemVariableError(
        definition.name,
        'invalid',
        `${definition.name}은(는) 직접 전환할 수 없습니다.`,
        { reason: 'not-toggleable' },
      );
    this.set(definition.name, value);
    return value;
  }

  search(prefix: string): SystemVariableDefinition[] {
    return systemVariableDefinitions.filter((definition) =>
      definition.name.startsWith(prefix.toUpperCase()),
    );
  }

  private requireDefinition(name: string): SystemVariableDefinition {
    const definition = getSystemVariableDefinition(name);
    if (!definition)
      throw new SystemVariableError(
        name.toUpperCase(),
        'unknown',
        `알 수 없는 시스템 변수 "${name.toUpperCase()}".`,
      );
    return definition;
  }

  private validateSymbolReference(name: string, value: SysvarValue): SysvarValue {
    const references: Partial<Record<string, SymbolTableName>> = {
      CLAYER: 'LAYER',
      TEXTSTYLE: 'STYLE',
      DIMSTYLE: 'DIMSTYLE',
      CELTYPE: 'LTYPE',
    };
    if (name === 'CLAYOUT' && typeof value === 'string') return this.resolveLayout(value);
    const table = references[name];
    if (table === undefined || typeof value !== 'string') return value;
    const symbol = this.database
      .all()
      .find(
        (object) =>
          object.type === table &&
          object.owner === this.database.tables[table] &&
          object.name?.toUpperCase() === value.toUpperCase(),
      );
    if (!symbol?.name)
      throw new SystemVariableError(
        name,
        'invalid',
        `${name}의 값이 유효하지 않습니다. 이름 "${value}"이(가) 도면에 없습니다.`,
        { reason: 'missing-symbol', reference: value },
      );
    if (
      name === 'CLAYER' &&
      Number(symbol.fields.flags ?? symbol.groups.find((g) => g.code === 70)?.value ?? 0) & 1
    )
      throw new SystemVariableError(
        name,
        'invalid',
        '동결된 도면층은 현재 도면층으로 만들 수 없습니다.',
      );
    return symbol.name;
  }

  /** CLAYOUT is `name*handle`; a name, `*handle` or both select the layout. */
  private resolveLayout(value: string): string {
    const separator = value.lastIndexOf('*');
    const name = separator < 0 ? value : value.slice(0, separator);
    const handle = separator < 0 ? '' : value.slice(separator + 1).toUpperCase();
    const layout = this.database
      .all()
      .find(
        (object) =>
          object.type === 'LAYOUT' &&
          (!name || object.name?.toUpperCase() === name.toUpperCase()) &&
          (!handle || object.handle === handle),
      );
    if (!layout?.name || (!name && !handle))
      throw new SystemVariableError(
        'CLAYOUT',
        'invalid',
        `CLAYOUT의 값이 유효하지 않습니다. 이름 "${value}"이(가) 도면에 없습니다.`,
        { reason: 'missing-symbol', reference: value },
      );
    return `${layout.name}*${layout.handle}`;
  }
}

export function validateSystemVariable(definition: SystemVariableDefinition, value: unknown): void {
  let valid = false;
  if (definition.type === 'integer')
    valid = typeof value === 'number' && Number.isSafeInteger(value);
  if (definition.type === 'real') valid = typeof value === 'number' && Number.isFinite(value);
  if (definition.type === 'string') valid = typeof value === 'string';
  if (definition.type === 'boolean') valid = typeof value === 'boolean';
  if (definition.type === 'point2' || definition.type === 'point3') {
    valid =
      Array.isArray(value) &&
      value.length === (definition.type === 'point2' ? 2 : 3) &&
      value.every(
        (coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate),
      );
  }
  if (valid && typeof value === 'number')
    valid =
      (definition.min === undefined ||
        (definition.exclusiveMin ? value > definition.min : value >= definition.min)) &&
      (definition.max === undefined ||
        (definition.exclusiveMax ? value < definition.max : value <= definition.max));
  if (valid && definition.enum)
    valid = definition.enum.some((allowed) => JSON.stringify(allowed) === JSON.stringify(value));
  if (valid && definition.bitmask !== undefined && typeof value === 'number')
    valid = Number.isInteger(value) && value >= 0 && (value & definition.bitmask) === value;
  if (!valid) {
    const range =
      definition.min === undefined
        ? ''
        : ` (${definition.min}${definition.max === undefined ? ' 이상' : `~${definition.max}`})`;
    throw new SystemVariableError(
      definition.name,
      'invalid',
      `${definition.name}의 값이 유효하지 않습니다${range}.`,
      {
        ...(definition.min === undefined ? {} : { min: definition.min }),
        ...(definition.max === undefined ? {} : { max: definition.max }),
      },
    );
  }
}
