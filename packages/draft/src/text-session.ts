import type { CadEntity, CadPoint, CadSettings, CadText } from '@hancad/legacy-bridge';
import { CAD_ENTITY_LIMIT } from '@hancad/legacy-bridge';
import { parseDraftNumber, parseDraftPoint, validDraftPoint } from './coordinates';
import { draftEntityBase, draftLine } from './entities';

export type TextPrompt = 'textStart' | 'textHeight' | 'textRotation' | 'textContent';
export type TextError =
  | 'point'
  | 'positiveHeight'
  | 'invalidAngle'
  | 'unsupportedOption'
  | 'textContent'
  | 'entityLimit'
  | 'needPoints'
  | 'closedSession';
export interface TextInputResult {
  status: 'continue' | 'committed' | 'cancelled' | 'error';
  error?: TextError;
}
export interface TextSnapshot {
  tool: 'TEXT';
  status: 'active' | 'committed' | 'cancelled';
  prompt: TextPrompt;
  inputMode: 'point' | 'number' | 'text';
  preview: readonly CadEntity[];
  point?: CadPoint;
  textSize: number;
  rotation: number;
  text: string;
  canClose: false;
}
export interface TextSessionOptions {
  onAcceptedPoint?: (point: CadPoint) => void;
  textSize: number;
  availableEntities?: number;
  onCommit: (entities: CadEntity[]) => void;
  onChange?: (snapshot: TextSnapshot) => void;
}

const epsilon = 1e-8;
const failure = (error: TextError): TextInputResult => ({ status: 'error', error });
const unsupported =
  /^(J|JUSTIFY|S|STYLE|C|CENTER|R|RIGHT|A|ALIGN|M|MIDDLE|F|FIT|TL|TC|TR|ML|MC|MR|BL|BC|BR)$/i;

/** Left-baseline single-line TEXT. All accepted lines form one command transaction. */
export class TextSession {
  private status: TextSnapshot['status'] = 'active';
  private prompt: TextPrompt = 'textStart';
  private point: CadPoint | undefined;
  private cursor: CadPoint | undefined;
  private textSize: number;
  private rotation = 0;
  private text = '';
  private readonly accepted: CadText[] = [];
  private readonly settings: CadSettings;
  private readonly availableEntities: number;

  constructor(
    settings: CadSettings,
    private readonly options: TextSessionOptions,
  ) {
    this.settings = { ...settings };
    this.textSize = options.textSize;
    const available = options.availableEntities ?? CAD_ENTITY_LIMIT;
    this.availableEntities = Number.isFinite(available)
      ? Math.max(0, Math.min(CAD_ENTITY_LIMIT, Math.floor(available)))
      : 0;
    this.notify();
  }

  acceptPoint(point: CadPoint): TextInputResult {
    const result = this.applyPoint(point);
    if (result.status !== 'error') this.options.onAcceptedPoint?.({ ...point });
    return result;
  }

  private applyPoint(point: CadPoint): TextInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (!validDraftPoint(point)) return failure('point');
    this.cursor = undefined;
    if (this.prompt === 'textStart') {
      this.point = { ...point };
      this.prompt = 'textHeight';
    } else if (this.prompt === 'textHeight' && this.point) {
      return this.acceptHeight(Math.hypot(point.x - this.point.x, point.y - this.point.y));
    } else if (this.prompt === 'textRotation' && this.point) {
      if (Math.hypot(point.x - this.point.x, point.y - this.point.y) <= epsilon)
        return failure('invalidAngle');
      this.rotation = Math.atan2(point.y - this.point.y, point.x - this.point.x);
      this.prompt = 'textContent';
    } else if (this.prompt === 'textContent') {
      if (this.text.trim()) {
        const result = this.acceptLine(this.text);
        if (result.status === 'error') return result;
      }
      this.point = { ...point };
      this.text = '';
    } else return failure('point');
    this.notify();
    return { status: 'continue' };
  }

  acceptText(value: string): TextInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (value === '\u001b') return this.cancel();
    if (this.prompt === 'textContent') return value.trim() ? this.acceptLine(value) : this.finish();
    const input = value.trim();
    if (this.prompt === 'textStart' && unsupported.test(input)) return failure('unsupportedOption');
    if (this.prompt === 'textHeight') {
      const height = input ? parseDraftNumber(input) : this.textSize;
      if (height !== undefined) return this.acceptHeight(height);
      const point = parseDraftPoint(input, this.point);
      return point ? this.acceptPoint(point) : failure('positiveHeight');
    }
    if (this.prompt === 'textRotation') {
      const degrees = input ? parseDraftNumber(input) : 0;
      if (degrees !== undefined) {
        this.rotation = -((degrees % 360) * Math.PI) / 180;
        this.prompt = 'textContent';
        this.notify();
        return { status: 'continue' };
      }
      const point = parseDraftPoint(input, this.point);
      return point ? this.acceptPoint(point) : failure('invalidAngle');
    }
    const point = parseDraftPoint(input);
    return point ? this.acceptPoint(point) : failure(input ? 'point' : 'needPoints');
  }

  updateText(value: string): void {
    if (this.status !== 'active' || this.prompt !== 'textContent') return;
    this.text = value;
    this.notify();
  }

  moveCursor(point: CadPoint): void {
    if (this.status !== 'active' || !validDraftPoint(point) || this.prompt === 'textContent')
      return;
    this.cursor = { ...point };
    this.notify();
  }

  finish(): TextInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (this.prompt !== 'textContent') return failure('needPoints');
    return this.close('committed');
  }

  cancel(): TextInputResult {
    return this.status === 'active' ? this.close('cancelled') : failure('closedSession');
  }

  getSnapshot(): TextSnapshot {
    const preview: CadEntity[] = this.status === 'active' ? structuredClone(this.accepted) : [];
    if (this.status === 'active' && this.point && this.cursor && this.prompt !== 'textContent')
      preview.push(draftLine(this.settings, this.point, this.cursor, 'preview-text-guide'));
    return {
      tool: 'TEXT',
      status: this.status,
      prompt: this.prompt,
      inputMode:
        this.prompt === 'textStart' ? 'point' : this.prompt === 'textContent' ? 'text' : 'number',
      preview,
      ...(this.point ? { point: { ...this.point } } : {}),
      textSize: this.textSize,
      rotation: this.rotation,
      text: this.text,
      canClose: false,
    };
  }

  private acceptHeight(height: number): TextInputResult {
    // The transitional model normalizer caps text at 1000; reject instead of silently changing it.
    if (!Number.isFinite(height) || height <= epsilon || height > 1000)
      return failure('positiveHeight');
    this.textSize = height;
    this.prompt = 'textRotation';
    this.notify();
    return { status: 'continue' };
  }

  private acceptLine(value: string): TextInputResult {
    if (!this.point) return failure('needPoints');
    if (this.accepted.length >= this.availableEntities) return failure('entityLimit');
    if (value.length > 2000 || /[\r\n]/.test(value)) return failure('textContent');
    const nextPoint = {
      x: this.point.x - Math.sin(this.rotation) * this.textSize * 1.25,
      y: this.point.y + Math.cos(this.rotation) * this.textSize * 1.25,
    };
    if (!validDraftPoint(nextPoint)) return failure('point');
    this.accepted.push({
      ...draftEntityBase(this.settings),
      type: 'text',
      point: { ...this.point },
      text: value,
      textSize: this.textSize,
      rotation: this.rotation,
    });
    this.point = nextPoint;
    this.text = '';
    this.notify();
    return { status: 'continue' };
  }

  private close(status: 'committed' | 'cancelled'): TextInputResult {
    if (this.accepted.length) this.options.onCommit(structuredClone(this.accepted));
    this.status = status;
    this.cursor = undefined;
    this.text = '';
    this.notify();
    return { status };
  }

  private notify(): void {
    this.options.onChange?.(this.getSnapshot());
  }
}
