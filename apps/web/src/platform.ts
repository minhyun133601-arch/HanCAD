import { invoke } from '@tauri-apps/api/core';

export type PlatformCapability = 'files' | 'dialogs' | 'fonts' | 'printers' | 'clipboard';
export type PlatformMode = 'browser' | 'desktop';
export interface PlatformInfo {
  mode: PlatformMode;
  capabilities: readonly PlatformCapability[];
}
export interface FontDescriptor {
  family: string;
  path: string;
}
export interface PrinterDescriptor {
  name: string;
  isDefault: boolean;
}
export interface MockValue<Value> {
  value: Value;
  source: 'mock';
}

export class PlatformCapabilityError extends Error {
  constructor(
    readonly capability: PlatformCapability,
    readonly mode: PlatformMode,
  ) {
    super(`${capability} is unavailable in the ${mode} platform at this phase.`);
    this.name = 'PlatformCapabilityError';
  }
}

export interface Platform {
  readonly mode: PlatformMode;
  info(): Promise<PlatformInfo>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  chooseOpenFile(): Promise<string | null>;
  listFonts(): Promise<readonly FontDescriptor[]>;
  listPrinters(): Promise<readonly PrinterDescriptor[]>;
  readClipboard(): Promise<MockValue<string>>;
  writeClipboard(text: string): Promise<MockValue<void>>;
}

/** Browser OS services are explicit mocks, never browser-to-server proxies. */
export class BrowserPlatform implements Platform {
  readonly mode = 'browser';
  private clipboard = '';

  async info(): Promise<PlatformInfo> {
    return { mode: this.mode, capabilities: [] };
  }
  async readFile(_path: string): Promise<Uint8Array> {
    throw this.unavailable('files');
  }
  async writeFile(_path: string, _data: Uint8Array): Promise<void> {
    throw this.unavailable('files');
  }
  async chooseOpenFile(): Promise<string | null> {
    throw this.unavailable('dialogs');
  }
  async listFonts(): Promise<readonly FontDescriptor[]> {
    throw this.unavailable('fonts');
  }
  async listPrinters(): Promise<readonly PrinterDescriptor[]> {
    throw this.unavailable('printers');
  }
  async readClipboard(): Promise<MockValue<string>> {
    return { value: this.clipboard, source: 'mock' };
  }
  async writeClipboard(text: string): Promise<MockValue<void>> {
    this.clipboard = text;
    return { value: undefined, source: 'mock' };
  }
  private unavailable(capability: PlatformCapability): PlatformCapabilityError {
    return new PlatformCapabilityError(capability, this.mode);
  }
}

/** Only platform_info is implemented natively during the bootstrap phase. */
export class DesktopPlatform implements Platform {
  readonly mode = 'desktop';
  async info(): Promise<PlatformInfo> {
    return invoke<PlatformInfo>('platform_info');
  }
  async readFile(_path: string): Promise<Uint8Array> {
    throw this.unavailable('files');
  }
  async writeFile(_path: string, _data: Uint8Array): Promise<void> {
    throw this.unavailable('files');
  }
  async chooseOpenFile(): Promise<string | null> {
    throw this.unavailable('dialogs');
  }
  async listFonts(): Promise<readonly FontDescriptor[]> {
    throw this.unavailable('fonts');
  }
  async listPrinters(): Promise<readonly PrinterDescriptor[]> {
    throw this.unavailable('printers');
  }
  async readClipboard(): Promise<MockValue<string>> {
    throw this.unavailable('clipboard');
  }
  async writeClipboard(_text: string): Promise<MockValue<void>> {
    throw this.unavailable('clipboard');
  }
  private unavailable(capability: PlatformCapability): PlatformCapabilityError {
    return new PlatformCapabilityError(capability, this.mode);
  }
}

export function createPlatform(): Platform {
  return '__TAURI_INTERNALS__' in window ? new DesktopPlatform() : new BrowserPlatform();
}
