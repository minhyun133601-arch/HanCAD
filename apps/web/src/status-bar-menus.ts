import type { ToggleId } from '@hancad/input';
import type { SystemVariables } from '@hancad/sysvars';
import type { Locale } from '@hancad/ui';
import type { MenuEntry } from './menus/ContextMenu';
import { draftingToggles } from './drafting-toggles';
import type { DraftingTab } from './drafting-settings-fields';

export function coordinateMenu(
  sysvars: SystemVariables,
  locale: Locale,
  relative: boolean,
  execute: (macro: string) => void,
): MenuEntry[] {
  const ko = locale === 'ko-KR';
  return [
    { value: 2, label: ko ? '상대적(R)' : 'Relative(R)', disabled: !relative },
    { value: 1, label: ko ? '절대적(A)' : 'Absolute(A)' },
    { value: 3, label: ko ? '지리적(G)' : 'Geographic(G)', disabled: true },
    { value: 0, label: ko ? '특정(S)' : 'Specific(S)' },
  ].map((item) => ({
    id: `coords-${item.value}`,
    label: item.label,
    checked: sysvars.getNumber('COORDS') === item.value,
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    onSelect: () => execute(`'_SETVAR COORDS ${item.value}`),
  }));
}

export function statusSettings(
  id: ToggleId,
  sysvars: SystemVariables,
  locale: Locale,
  toggle: () => void,
  execute: (macro: string) => void,
  openSettings?: (tab: DraftingTab) => void,
): MenuEntry[] {
  const ko = locale === 'ko-KR';
  const setting = draftingToggles[id];
  const enabled = setting.enabled(sysvars);
  const items: MenuEntry[] = [
    {
      id: 'on',
      label: ko ? '켜기(N)' : 'On(N)',
      checked: enabled,
      onSelect: () => {
        if (!enabled) toggle();
      },
    },
    {
      id: 'off',
      label: ko ? '끄기(F)' : 'Off(F)',
      checked: !enabled,
      onSelect: () => {
        if (enabled) toggle();
      },
    },
  ];
  function values(variable: string, options: readonly [number, string, string][]): void {
    items.push({ kind: 'separator', id: `before-${variable}` });
    for (const [value, korean, english] of options)
      items.push({
        id: `${variable}-${value}`,
        label: ko ? korean : english,
        checked:
          (variable === 'DYNMODE'
            ? Math.abs(sysvars.getNumber(variable))
            : sysvars.getNumber(variable)) === value,
        onSelect: () => execute(`'_SETVAR ${variable} ${value}`),
      });
  }
  function prompt(variable: string, korean: string, english: string): void {
    items.push({
      id: variable,
      label: ko ? korean : english,
      onSelect: () => execute(`'_${variable}`),
    });
  }
  switch (id) {
    case 'grid':
      prompt('GRIDUNIT', '그리드 간격...', 'Grid spacing...');
      prompt('GRIDDISPLAY', '그리드 표시...', 'Grid display...');
      break;
    case 'snap':
      prompt('SNAPUNIT', '스냅 간격...', 'Snap spacing...');
      values('SNAPTYPE', [
        [0, '그리드 스냅', 'Grid snap'],
        [1, '극좌표 스냅', 'Polar snap'],
      ]);
      break;
    case 'polar':
      values(
        'POLARANG',
        [90, 45, 30, 22.5, 18, 15, 10, 5].map((v) => [v, `${v}°`, `${v}°`]),
      );
      break;
    case 'objectSnap': {
      items.push({ kind: 'separator', id: 'snap-modes' });
      for (const [mask, korean, english] of [
        [1, '끝점', 'Endpoint'],
        [2, '중간점', 'Midpoint'],
        [4, '중심', 'Center'],
        [1024, '기하학적 중심', 'Geometric Center'],
        [8, '노드', 'Node'],
        [16, '사분점', 'Quadrant'],
        [32, '교차점', 'Intersection'],
        [64, '삽입점', 'Insertion'],
        [128, '수직', 'Perpendicular'],
        [256, '접점', 'Tangent'],
        [512, '근처점', 'Nearest'],
        [2048, '가상 교차점', 'Apparent intersection'],
        [4096, '연장선', 'Extension'],
        [8192, '평행', 'Parallel'],
      ] as const) {
        const mode = sysvars.getNumber('OSMODE');
        items.push({
          id: `osnap-${mask}`,
          label: ko ? korean : english,
          checked: (mode & mask) !== 0,
          onSelect: () => execute(`'_SETVAR OSMODE ${mode ^ mask}`),
        });
      }
      break;
    }
    case 'object3dSnap':
      prompt('3DOSMODE', '3D 객체 스냅 설정...', '3D object snap settings...');
      break;
    case 'objectSnapTracking':
      for (const [bit, korean, english] of [
        [0, '직교로만 추적', 'Track orthogonally only'],
        [2, '모든 극좌표 각도 설정을 사용하여 추적', 'Track using all polar angle settings'],
      ] as const) {
        items.push({
          id: `tracking-${bit}`,
          label: ko ? korean : english,
          checked: (sysvars.getNumber('POLARMODE') & 2) === bit,
          onSelect: () =>
            execute(`'_SETVAR POLARMODE ${(sysvars.getNumber('POLARMODE') & ~2) | bit}`),
        });
      }
      break;
    case 'dynamicInput':
      values('DYNMODE', [
        [1, '포인터 입력', 'Pointer input'],
        [2, '치수 입력', 'Dimension input'],
        [3, '포인터 및 치수 입력', 'Pointer and dimension input'],
      ]);
      prompt('DYNPROMPT', '동적 프롬프트...', 'Dynamic prompts...');
      break;
    case 'isoplane':
      items.splice(
        0,
        items.length,
        ...[0, 1, 2].map((value) => ({
          id: `plane-${value}`,
          label:
            (ko
              ? ['등각평면 좌측', '등각평면 위쪽', '등각평면 우측']
              : ['Isoplane left', 'Isoplane top', 'Isoplane right'])[value] ?? '',
          checked: sysvars.getNumber('SNAPISOPAIR') === value,
          onSelect: () => execute(`'_SETVAR SNAPISOPAIR ${value}`),
        })),
      );
      break;
    case 'lineweight':
      prompt('LWDEFAULT', '기본 선가중치...', 'Default lineweight...');
      break;
    case 'groups':
      prompt('PICKSTYLE', '그룹 선택 설정...', 'Group selection settings...');
      break;
    case 'quickProperties':
      prompt('QPMODE', '빠른 특성 설정...', 'Quick Properties settings...');
      break;
    case 'selectionCycling':
      prompt('SELECTIONCYCLING', '선택 순환 설정...', 'Selection Cycling settings...');
      break;
    case 'dynamicUcs':
      prompt('UCSDETECT', '동적 UCS 설정...', 'Dynamic UCS settings...');
      break;
    case 'inferConstraints':
      prompt('CONSTRAINTINFER', '구속조건 추론 설정...', 'Infer Constraints settings...');
      break;
    case 'tablet':
      prompt('TABMODE', '태블릿 설정...', 'Tablet settings...');
      break;
    default:
      break;
  }
  const tabs: Partial<Record<ToggleId, DraftingTab>> = {
    grid: 'snap',
    snap: 'snap',
    isoplane: 'snap',
    polar: 'polar',
    objectSnap: 'osnap',
    object3dSnap: '3dosnap',
    objectSnapTracking: 'polar',
    dynamicInput: 'dynamic',
    quickProperties: 'quick',
    selectionCycling: 'cycling',
  };
  const tab = tabs[id];
  if (tab)
    items.push(
      { kind: 'separator', id: 'before-settings' },
      {
        id: 'settings',
        label: ko ? '설정...' : 'Settings...',
        onSelect: () => {
          if (openSettings) openSettings(tab);
          else execute("'_DSETTINGS");
        },
      },
    );
  return items;
}
