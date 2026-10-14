import { DrawingDatabase, EventBus } from '@hancad/db';
import type { SymbolTableName } from '@hancad/db';
import { getSystemVariableDefinition, systemVariableDefinitions } from './registry';
import type { SystemVariableDefinition, SysvarValue } from './registry';

export class SystemVariableError extends Error {
  constructor(
    readonly variable: string,
    readonly code: 'unknown' | 'readonly' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'SystemVariableError';
  }
}

export class SystemVariableProfile {
  readonly values = new Map<string, SysvarValue>();
  readonly events = new EventBus<{ name: string; value: SysvarValue }>();
}

export interface SystemVariablesOptions {
  database?: DrawingDatabase;
  profile?: SystemVariableProfile;
}

export class SystemVariables {
  readonly database: DrawingDatabase;
  readonly profile: SystemVariableProfile;
  readonly events = new EventBus<{ name: string; value: SysvarValue }>();
  private readonly sessionValues = new Map<string, SysvarValue>();
  private readonly unsubscribers: (() => void)[];

  constructor(options: SystemVariablesOptions = {}) {
    this.database = options.database ?? new DrawingDatabase();
    this.profile = options.profile ?? new SystemVariableProfile();
    this.unsubscribers = [
      this.database.events.subscribe((event) => {
        if (event.type === 'sysvar-changed' && getSystemVariableDefinition(event.name))
          this.events.publish({ name: event.name, value: this.get(event.name) });
      }),
      this.profile.events.subscribe((event) => this.events.publish(structuredClone(event))),
    ];
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
  }

  get(name: string): SysvarValue {
    const definition = this.requireDefinition(name);
    const stored =
      definition.scope === 'drawing'
        ? this.database.getVariable(definition.name)
        : definition.scope === 'profile'
          ? this.profile.values.get(definition.name)
          : this.sessionValues.get(definition.name);
    if (stored === undefined) return structuredClone(definition.default);
    validateSystemVariable(definition, stored);
    return structuredClone(stored as SysvarValue);
  }

  getNumber(name: string): number {
    const value = this.get(name);
    if (typeof value !== 'number')
      throw new SystemVariableError(name, 'invalid', `${name}은(는) 숫자 변수가 아닙니다.`);
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
      );
    return symbol.name;
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
      (definition.min === undefined || value >= definition.min) &&
      (definition.max === undefined || value <= definition.max);
  if (valid && definition.enum)
    valid = definition.enum.some((allowed) => JSON.stringify(allowed) === JSON.stringify(value));
  if (!valid) {
    const range =
      definition.min === undefined
        ? ''
        : ` (${definition.min}${definition.max === undefined ? ' 이상' : `~${definition.max}`})`;
    throw new SystemVariableError(
      definition.name,
      'invalid',
      `${definition.name}의 값이 유효하지 않습니다${range}.`,
    );
  }
}
