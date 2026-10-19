import type { PromptStep } from '@hancad/commands';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import type { LayerHost } from './layer-host';
import { commitLayerChange, layerMetadata, liveLayerState } from './layer-host';
import type { LayerMetadata } from './layer-states';
import { walkLayerCli } from './layer-cli';
import { recordLayerNotification } from '../layer-notifications';
export class LayerCliSession {
  private answers: string[] = [];
  private initial: LegacyCadState | undefined;
  private metadata: LayerMetadata | undefined;
  state: LegacyCadState | undefined;
  step: PromptStep | undefined;
  constructor(
    private readonly host: () => LayerHost,
    private readonly changed: () => void,
    private readonly ended: () => void,
    private readonly fileAction?: (type: 'import' | 'export', name: string) => void,
  ) {}
  begin(): void {
    this.answers = [];
    this.initial = liveLayerState(this.host());
    this.metadata = layerMetadata(this.host());
    this.replay();
  }
  private replay(): void {
    if (!this.initial || !this.metadata) return;
    const result = walkLayerCli(this.answers, this.initial, this.metadata, this.host().korean);
    this.state = result.state;
    this.step = result.step;
    if (this.step) {
      if (this.step.notice) this.host().print(this.step.notice);
      this.changed();
      return;
    }
    for (const message of result.messages) if (message) this.host().print(message);
    this.finish();
    if (result.fileAction) this.fileAction?.(result.fileAction.type, result.fileAction.name);
    this.ended();
  }
  submit(value: string): void {
    this.answers.push(value);
    this.replay();
  }
  finish(): void {
    if (this.initial && this.metadata) {
      const result = walkLayerCli(this.answers, this.initial, this.metadata, this.host().korean);
      if (
        JSON.stringify(result.state) !== JSON.stringify(this.initial) ||
        JSON.stringify(result.metadata) !== JSON.stringify(this.metadata)
      )
        commitLayerChange(this.host(), 'LAYER', result.state, result.metadata);
      if (result.restoredState)
        recordLayerNotification(this.host().database, liveLayerState(this.host()), 'restore');
    }
    this.initial = undefined;
    this.state = undefined;
    this.step = undefined;
    this.metadata = undefined;
  }
}
