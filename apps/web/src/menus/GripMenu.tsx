import { gripModes } from '@hancad/draft';
import type { EntityGrip, GripAction, GripMode } from '@hancad/draft';
import type { GripMenuState } from '../useGrips';
import { ContextMenu } from './ContextMenu';

const labels: Record<GripAction, readonly [string, string]> = {
  stretch: ['신축(S)', 'Stretch(S)'],
  lengthen: ['길이 조정(L)', 'Lengthen(L)'],
  addVertex: ['정점 추가(A)', 'Add Vertex(A)'],
  removeVertex: ['정점 제거(R)', 'Remove Vertex(R)'],
  convertArc: ['호로 변환(C)', 'Convert to Arc(C)'],
  convertLine: ['선으로 변환(C)', 'Convert to Line(C)'],
};
export function GripMenu({
  menu,
  korean,
  action,
  onClose,
  activeMode,
  setMode,
  submit,
}: {
  menu: GripMenuState | null;
  korean: boolean;
  action: (grip: EntityGrip, action: GripAction) => void;
  onClose: () => void;
  activeMode?: GripMode;
  setMode?: (mode: GripMode) => void;
  submit?: (value: string) => void;
}) {
  if (!menu) return null;
  const modes: Record<GripMode, string> = {
    STRETCH: '신축',
    MOVE: '이동',
    ROTATE: '회전',
    SCALE: '축척',
    MIRROR: '대칭',
  };
  const entries = activeMode
    ? [
        ...gripModes.map((mode) => ({
          id: `grip-mode-${mode}`,
          label: korean ? modes[mode] : mode,
          checked: activeMode === mode,
          onSelect: () => setMode?.(mode),
        })),
        ...[
          ['B', '기준점(B)', 'Base point(B)'],
          ['C', '복사(C)', 'Copy(C)'],
          ['U', '명령 취소(U)', 'Undo(U)'],
          ...(activeMode === 'SCALE' || activeMode === 'ROTATE'
            ? [['R', '참조(R)', 'Reference(R)']]
            : []),
          ['X', '종료(X)', 'eXit(X)'],
        ].map(([value, ko, en]) => ({
          id: `grip-option-${value}`,
          label: (korean ? ko : en)!,
          onSelect: () => submit?.(value!),
        })),
      ]
    : menu.grip.actions.map((value) => ({
        id: `grip-${value}`,
        label: labels[value][korean ? 0 : 1],
        onSelect: () => action(menu.grip, value),
      }));
  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      label={korean ? '그립 편집' : 'Grip editing'}
      onClose={onClose}
      items={entries}
    />
  );
}
