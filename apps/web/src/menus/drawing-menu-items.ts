import type { MenuEntry } from './ContextMenu';
import { keywordOf, promptOptions } from '../command-line/PromptKeywords';

export interface DrawingMenuActions {
  korean: boolean;
  commandActive: boolean;
  selected: boolean;
  commandName: string | null;
  prompt: string;
  recent: readonly string[];
  execute: (macro: string) => void;
  submit: (value: string) => void;
  cancel: () => void;
  clearSelection: () => void;
  snapItems: readonly MenuEntry[];
}

export function drawingMenuItems(options: DrawingMenuActions): readonly MenuEntry[] {
  const { korean, execute } = options;
  const label = (ko: string, en: string): string => (korean ? ko : en);
  const command = (id: string, ko: string, en: string, macro: string): MenuEntry => ({
    id,
    label: label(ko, en),
    onSelect: () => execute(macro),
  });
  const recent: MenuEntry = {
    id: 'recent',
    label: label('최근 입력(I)', 'Recent Input'),
    items: options.recent.length
      ? options.recent
          .slice(0, 20)
          .map((name) => ({ id: `recent-${name}`, label: name, onSelect: () => execute(name) }))
      : [{ id: 'empty', label: label('(없음)', '(None)'), disabled: true }],
  };
  const navigation = [
    command('pan', '초점이동(P)', 'Pan', "'_PAN"),
    command('zoom', '줌(Z)', 'Zoom', "'_ZOOM"),
    command('quickcalc', '빠른 계산기', 'QuickCalc', "'_QUICKCALC"),
  ];
  if (options.commandActive)
    return [
      { id: 'enter', label: label('입력(E)', 'Enter'), onSelect: () => options.submit('') },
      { id: 'cancel', label: label('취소(C)', 'Cancel'), onSelect: options.cancel },
      recent,
      ...promptOptions(options.prompt).map((item, index) => ({
        id: `keyword-${index}`,
        label: item,
        onSelect: () => {
          const key = keywordOf(item);
          if (key) options.submit(key);
        },
      })),
      { kind: 'separator', id: 'snap-separator' },
      {
        id: 'snap-overrides',
        label: label('스냅 재지정(O)', 'Snap Overrides'),
        items: options.snapItems,
      },
      ...navigation,
    ];
  const previous = options.recent[0] ?? options.commandName;
  const items: MenuEntry[] = [
    {
      id: 'repeat',
      label: label(`반복 ${previous ?? ''}(R)`, `Repeat ${previous ?? ''}`),
      disabled: !previous,
      onSelect: () => options.submit(''),
    },
    recent,
    { kind: 'separator', id: 'edit-separator' },
  ];
  if (options.selected)
    items.push(
      command('erase', '지우기(E)', 'Erase', 'ERASE'),
      command('move', '이동(M)', 'Move', 'MOVE'),
      command('copy-selection', '선택 복사(Y)', 'Copy Selection', 'COPY'),
      command('scale', '축척(L)', 'Scale', 'SCALE'),
      command('rotate', '회전(O)', 'Rotate', 'ROTATE'),
      {
        id: 'draw-order',
        label: label('그리기 순서', 'Draw Order'),
        items: [
          command('front', '맨 앞으로 가져오기', 'Bring to Front', '^C^C_DRAWORDER;_Front;'),
          command('back', '맨 뒤로 보내기', 'Send to Back', '^C^C_DRAWORDER;_Back;'),
        ],
      },
      {
        id: 'group',
        label: label('그룹', 'Group'),
        items: [
          command('group-create', '그룹', 'Group', 'GROUP'),
          command('ungroup', '그룹 해제', 'Ungroup', 'UNGROUP'),
        ],
      },
      command('add-selected', '선택 항목 추가', 'Add Selected', 'ADDSELECTED'),
      command('select-similar', '유사 객체 선택', 'Select Similar', 'SELECTSIMILAR'),
      {
        id: 'deselect',
        label: label('모두 선택 해제', 'Deselect All'),
        onSelect: options.clearSelection,
      },
    );
  items.push(
    {
      id: 'clipboard',
      label: label('클립보드', 'Clipboard'),
      items: [
        command('cut', '잘라내기(T)', 'Cut', 'CUTCLIP'),
        command('copy', '복사(C)', 'Copy', 'COPYCLIP'),
        command('copybase', '기준점을 사용하여 복사(B)', 'Copy with Base Point', 'COPYBASE'),
        command('paste', '붙여넣기(P)', 'Paste', 'PASTECLIP'),
        command('pasteorig', '원래 좌표로 붙여넣기', 'Paste to Original Coordinates', 'PASTEORIG'),
      ],
    },
    {
      id: 'isolate',
      label: label('분리', 'Isolate'),
      items: [
        command('isolate-objects', '객체 분리', 'Isolate Objects', 'ISOLATEOBJECTS'),
        command('hide-objects', '객체 숨기기', 'Hide Objects', 'HIDEOBJECTS'),
        command('end-isolation', '객체 분리 끝내기', 'End Object Isolation', 'UNISOLATEOBJECTS'),
      ],
    },
    { kind: 'separator', id: 'undo-separator' },
    command('undo', '명령 취소(U)', 'Undo', 'U'),
    command('redo', '명령 복구(D)', 'Redo', 'REDO'),
    ...navigation.slice(0, 2),
    command('qselect', '빠른 선택(Q)...', 'Quick Select...', 'QSELECT'),
    navigation[2]!,
    command('find', '찾기(F)...', 'Find...', 'FIND'),
    command('options', '옵션(N)...', 'Options...', 'OPTIONS'),
  );
  if (options.selected)
    items.push(
      command('properties', '특성(S)', 'Properties', 'PROPERTIES'),
      command('quick-properties', '빠른 특성', 'Quick Properties', 'QUICKPROPERTIES'),
    );
  return items;
}
