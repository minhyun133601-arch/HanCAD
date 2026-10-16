import type { Locale } from './messages';

type ToggleName =
  | 'grid'
  | 'ortho'
  | 'snap'
  | 'objectSnap'
  | 'object3dSnap'
  | 'polar'
  | 'objectSnapTracking'
  | 'dynamicInput'
  | 'dynamicUcs'
  | 'isoplane'
  | 'selectionCycling'
  | 'coordinates'
  | 'groups'
  | 'pickStyle'
  | 'inferConstraints'
  | 'quickProperties'
  | 'tablet'
  | 'lineweight';

/** Drafting-aid toggle echoes and shortcut notices (Phase 03). */
export interface ShortcutMessages {
  toggleNames: Readonly<Record<ToggleName, string>>;
  /** "<그리드 켜기>" as echoed after F7. */
  toggleState: (name: string, enabled: boolean) => string;
  /** SNAPISOPAIR 0, 1, 2. */
  isoplane: readonly [string, string, string];
  featurePending: (name: string) => string;
  /** Status-bar tooltip suffix for such toggles. */
  pendingTooltip: string;
  cycleViewports: string;
  cycleOverlap: string;
  actionPending: (name: string) => string;
}

const ko: ShortcutMessages = {
  toggleNames: {
    grid: '그리드',
    ortho: '직교',
    snap: '스냅',
    objectSnap: '객체 스냅',
    object3dSnap: '3D 객체 스냅',
    polar: '극좌표',
    objectSnapTracking: '객체 스냅 추적',
    dynamicInput: '동적 입력',
    dynamicUcs: '동적 UCS',
    isoplane: '등각평면',
    selectionCycling: '선택 순환',
    coordinates: '좌표',
    groups: '그룹',
    pickStyle: '그룹',
    inferConstraints: '구속조건 추론',
    quickProperties: '빠른 특성',
    tablet: '태블릿',
    lineweight: '선가중치',
  },
  toggleState: (name, enabled) => `<${name} ${enabled ? '켜기' : '끄기'}>`,
  isoplane: ['<등각평면 좌측>', '<등각평면 위쪽>', '<등각평면 우측>'],
  featurePending: (name) =>
    `${name} 기능은 아직 구현되지 않았습니다. 시스템 변수 값만 바뀌었습니다.`,
  pendingTooltip: '기능 미구현: 시스템 변수만 바뀝니다',
  cycleViewports: '뷰포트 순환',
  cycleOverlap: '겹친 객체 순환 선택',
  actionPending: (name) => `${name}은(는) 아직 구현되지 않았습니다.`,
};

const en: ShortcutMessages = {
  toggleNames: {
    grid: 'Grid',
    ortho: 'Ortho',
    snap: 'Snap',
    objectSnap: 'Osnap',
    object3dSnap: '3D Osnap',
    polar: 'Polar',
    objectSnapTracking: 'Object Snap Tracking',
    dynamicInput: 'Dynamic Input',
    dynamicUcs: 'Dynamic UCS',
    isoplane: 'Isoplane',
    selectionCycling: 'Selection Cycling',
    coordinates: 'Coords',
    groups: 'Group',
    pickStyle: 'Group',
    inferConstraints: 'Infer Constraints',
    quickProperties: 'Quick Properties',
    tablet: 'Tablet',
    lineweight: 'Lineweight',
  },
  toggleState: (name, enabled) => `<${name} ${enabled ? 'on' : 'off'}>`,
  isoplane: ['<Isoplane Left>', '<Isoplane Top>', '<Isoplane Right>'],
  featurePending: (name) =>
    `${name} itself is not implemented yet; only its system variable changed.`,
  pendingTooltip: 'Not implemented yet: only the system variable changes',
  cycleViewports: 'Viewport cycling',
  cycleOverlap: 'Cycling through overlapping objects',
  actionPending: (name) => `${name} is not implemented yet.`,
};

export function getShortcutMessages(locale: Locale): ShortcutMessages {
  return locale === 'ko-KR' ? ko : en;
}
