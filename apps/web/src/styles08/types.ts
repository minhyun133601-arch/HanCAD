import type { CommandRegistry } from '@hancad/commands';
import type { DrawingDatabase } from '@hancad/db';
import type { SystemVariables } from '@hancad/sysvars';
import type { Locale } from '@hancad/ui';

export interface StyleManagerHost {
  registry: CommandRegistry;
  database: DrawingDatabase;
  sysvars: SystemVariables;
  locale: Locale;
  print(message: string): void;
  focus(): void;
  readSupportFile?(name: string): Promise<Uint8Array>;
  writeSupportFile?(name: string, text: string): Promise<void>;
}
export interface StyleDialogActions {
  color(): void;
  linetype(): void;
  lineweight(): void;
  transparency(): void;
}
