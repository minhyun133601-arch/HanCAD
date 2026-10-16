export type DraftingTab = 'snap' | 'polar' | 'osnap' | '3dosnap' | 'dynamic' | 'quick' | 'cycling';
type Labels = readonly [string, string];
export interface SettingField {
  variable: string;
  label: Labels;
  kind: 'check' | 'number' | 'text' | 'point' | 'select';
  bit?: number;
  inverse?: boolean;
  signed?: boolean;
  index?: number;
  options?: readonly (readonly [number, string, string])[];
}
export interface SettingsGroup {
  title: Labels;
  fields: readonly SettingField[];
}
export const draftingTabs: readonly { id: DraftingTab; label: Labels }[] = [
  { id: 'snap', label: ['스냅 및 그리드', 'Snap and Grid'] },
  { id: 'polar', label: ['극좌표 추적', 'Polar Tracking'] },
  { id: 'osnap', label: ['객체 스냅', 'Object Snap'] },
  { id: '3dosnap', label: ['3D 객체 스냅', '3D Object Snap'] },
  { id: 'dynamic', label: ['동적 입력', 'Dynamic Input'] },
  { id: 'quick', label: ['빠른 특성', 'Quick Properties'] },
  { id: 'cycling', label: ['선택 순환', 'Selection Cycling'] },
];
const check = (variable: string, ko: string, en: string, bit?: number): SettingField => ({
  variable,
  label: [ko, en],
  kind: 'check',
  ...(bit === undefined ? {} : { bit }),
});
const number = (variable: string, ko: string, en: string): SettingField => ({
  variable,
  label: [ko, en],
  kind: 'number',
});
const select = (
  variable: string,
  ko: string,
  en: string,
  options: SettingField['options'],
): SettingField => ({ variable, label: [ko, en], kind: 'select', ...(options ? { options } : {}) });
const point = (variable: string, index: number, ko: string, en: string): SettingField => ({
  variable,
  index,
  label: [ko, en],
  kind: 'point',
});

export const draftingSettings: Readonly<Record<DraftingTab, readonly SettingsGroup[]>> = {
  snap: [
    {
      title: ['스냅', 'Snap'],
      fields: [
        check('SNAPMODE', '스냅 켜기(F9)', 'Snap On(F9)'),
        point('SNAPUNIT', 0, '스냅 X 간격두기', 'Snap X spacing'),
        point('SNAPUNIT', 1, '스냅 Y 간격두기', 'Snap Y spacing'),
        number('SNAPANG', '스냅 각도', 'Snap angle'),
        point('SNAPBASE', 0, '스냅 기준 X', 'Snap base X'),
        point('SNAPBASE', 1, '스냅 기준 Y', 'Snap base Y'),
      ],
    },
    {
      title: ['스냅 유형 및 스타일', 'Snap Type and Style'],
      fields: [
        select('SNAPTYPE', '스냅 유형', 'Snap type', [
          [0, '그리드 스냅', 'Grid snap'],
          [1, 'PolarSnap', 'PolarSnap'],
        ]),
        select('SNAPSTYL', '스냅 스타일', 'Snap style', [
          [0, '직사각형 스냅', 'Rectangular snap'],
          [1, '등각투영 스냅', 'Isometric snap'],
        ]),
        select('SNAPISOPAIR', '등각평면', 'Isoplane', [
          [0, '좌측', 'Left'],
          [1, '위쪽', 'Top'],
          [2, '우측', 'Right'],
        ]),
        number('POLARDIST', '극좌표 거리', 'Polar distance'),
      ],
    },
    {
      title: ['그리드', 'Grid'],
      fields: [
        check('GRIDMODE', '그리드 켜기(F7)', 'Grid On(F7)'),
        point('GRIDUNIT', 0, '그리드 X 간격두기', 'Grid X spacing'),
        point('GRIDUNIT', 1, '그리드 Y 간격두기', 'Grid Y spacing'),
        number('GRIDMAJOR', '주요 선 사이의 거리', 'Major line every'),
        check('GRIDSTYLE', '2D 모형 공간 점 그리드', '2D model space dot grid', 1),
        check('GRIDSTYLE', '블록 편집기 점 그리드', 'Block editor dot grid', 2),
        check('GRIDSTYLE', '시트/배치 점 그리드', 'Sheet/layout dot grid', 4),
      ],
    },
    {
      title: ['그리드 동작', 'Grid Behavior'],
      fields: [
        check('GRIDDISPLAY', '가변 그리드', 'Adaptive grid', 2),
        check(
          'GRIDDISPLAY',
          '그리드 간격 아래에 재분할 허용',
          'Allow subdivision below grid spacing',
          4,
        ),
        check('GRIDDISPLAY', '한계를 초과하여 그리드 표시', 'Display grid beyond Limits', 1),
        check('GRIDDISPLAY', '동적 UCS 따름', 'Follow Dynamic UCS', 8),
      ],
    },
  ],
  polar: [
    {
      title: ['극좌표 추적', 'Polar Tracking'],
      fields: [
        check('AUTOSNAP', '극좌표 추적 켜기(F10)', 'Polar Tracking On(F10)', 8),
        number('POLARANG', '증분 각도', 'Increment angle'),
        {
          variable: 'POLARADDANG',
          label: ['추가 각도(세미콜론으로 구분)', 'Additional angles (semicolon separated)'],
          kind: 'text',
        },
        check('POLARMODE', '추가 각도 사용', 'Use additional angles', 4),
      ],
    },
    {
      title: ['객체 스냅 추적 설정', 'Object Snap Tracking Settings'],
      fields: [
        check('AUTOSNAP', '객체 스냅 추적 켜기(F11)', 'Object Snap Tracking On(F11)', 16),
        check(
          'POLARMODE',
          '모든 극좌표 각도 설정을 사용하여 추적',
          'Track using all polar angle settings',
          2,
        ),
        check(
          'POLARMODE',
          '마지막 세그먼트를 기준으로 각도 측정',
          'Measure angles relative to last segment',
          1,
        ),
      ],
    },
  ],
  osnap: [
    {
      title: ['활성 객체 스냅', 'Running Object Snaps'],
      fields: [
        { ...check('OSMODE', '객체 스냅 켜기(F3)', 'Object Snap On(F3)', 16384), inverse: true },
        check('AUTOSNAP', '객체 스냅 추적 켜기(F11)', 'Object Snap Tracking On(F11)', 16),
      ],
    },
    {
      title: ['객체 스냅 모드', 'Object Snap Modes'],
      fields: [
        [1, '끝점', 'Endpoint'],
        [2, '중간점', 'Midpoint'],
        [4, '중심', 'Center'],
        [1024, '기하학적 중심', 'Geometric Center'],
        [8, '노드', 'Node'],
        [16, '사분점', 'Quadrant'],
        [32, '교차점', 'Intersection'],
        [4096, '연장선', 'Extension'],
        [64, '삽입점', 'Insertion'],
        [128, '수직', 'Perpendicular'],
        [256, '접점', 'Tangent'],
        [512, '근처점', 'Nearest'],
        [2048, '가상 교차점', 'Apparent Intersection'],
        [8192, '평행', 'Parallel'],
      ].map(([bit, ko, en]) => check('OSMODE', String(ko), String(en), Number(bit))),
    },
    {
      title: ['AutoSnap 및 옵션', 'AutoSnap and Options'],
      fields: [
        check('AUTOSNAP', '표식기', 'Marker', 1),
        check('AUTOSNAP', '툴팁', 'Tooltip', 2),
        check('AUTOSNAP', '자석', 'Magnet', 4),
        number('APERTURE', '객체 스냅 조준 상자 크기', 'Object snap aperture size'),
        check('OSOPTIONS', '해치 객체 무시', 'Ignore hatch objects', 1),
        check('OSOPTIONS', '음의 Z 값 객체 무시', 'Ignore objects with negative Z values', 2),
        check('OSOPTIONS', '치수보조선 무시', 'Ignore dimension extension lines', 4),
      ],
    },
  ],
  '3dosnap': [
    {
      title: ['3D 객체 스냅', '3D Object Snap'],
      fields: [
        {
          ...check('3DOSMODE', '3D 객체 스냅 켜기(F4)', '3D Object Snap On(F4)', 1),
          inverse: true,
        },
        ...[
          [2, '정점', 'Vertex'],
          [4, '모서리의 중간점', 'Midpoint on Edge'],
          [8, '면의 중심', 'Center of Face'],
          [16, '매듭점', 'Knot'],
          [32, '직교', 'Perpendicular'],
          [64, '면의 근처점', 'Nearest to Face'],
          [128, '점 구름 노드', 'Point Cloud Node'],
          [256, '점 구름 평면의 근처점', 'Point Cloud Nearest to Plane'],
          [512, '점 구름 평면에 수직', 'Point Cloud Perpendicular'],
          [1024, '점 구름 교차점', 'Point Cloud Intersection'],
          [2048, '점 구름 모서리', 'Point Cloud Edge'],
          [4096, '점 구름 모서리에 수직', 'Point Cloud Perpendicular to Edge'],
          [8192, '점 구름 중심선', 'Point Cloud Centerline'],
          [16384, '점 구름 구석', 'Point Cloud Corner'],
        ].map(([bit, ko, en]) => check('3DOSMODE', String(ko), String(en), Number(bit))),
      ],
    },
  ],
  dynamic: [
    {
      title: ['포인터 입력', 'Pointer Input'],
      fields: [
        check('DYNMODE', '포인터 입력 사용', 'Enable Pointer Input', 1),
        select('DYNPIFORMAT', '형식', 'Format', [
          [0, '극좌표 형식', 'Polar format'],
          [1, '데카르트 형식', 'Cartesian format'],
        ]),
        select('DYNPICOORDS', '좌표', 'Coordinates', [
          [0, '상대 좌표', 'Relative coordinates'],
          [1, '절대 좌표', 'Absolute coordinates'],
        ]),
        select('DYNPIVIS', '포인터 입력 표시', 'Pointer input visibility', [
          [0, '점을 지정하는 경우', 'When specifying a point'],
          [1, '명령이 활성화된 경우', 'When a command is active'],
          [2, '항상', 'Always'],
        ]),
      ],
    },
    {
      title: ['치수 입력', 'Dimension Input'],
      fields: [
        check('DYNMODE', '치수 입력 사용', 'Enable Dimension Input', 2),
        select('DYNDIVIS', '그립 신축 중 표시할 치수', 'Dimensions shown during grip stretch', [
          [0, '한 개', 'One'],
          [1, '두 개', 'Two'],
          [2, '다음 동적 치수', 'Following dynamic dimensions'],
        ]),
        check('DYNDIGRIP', '결과 치수', 'Resulting dimension', 1),
        check('DYNDIGRIP', '길이 변경 치수', 'Length change dimension', 2),
        check('DYNDIGRIP', '절대 각도 치수', 'Absolute angle dimension', 4),
        check('DYNDIGRIP', '각도 변경 치수', 'Angle change dimension', 8),
        check('DYNDIGRIP', '호 반지름 치수', 'Arc radius dimension', 16),
      ],
    },
    {
      title: ['동적 프롬프트', 'Dynamic Prompts'],
      fields: [
        check(
          'DYNPROMPT',
          '십자선 근처에 명령 프롬프트 및 명령 입력 표시',
          'Show command prompting and command input near crosshairs',
        ),
        check(
          'DYNINFOTIPS',
          '명령 프롬프트와 함께 추가 팁 표시',
          'Show additional tips with command prompting',
        ),
      ],
    },
    {
      title: ['제도 툴팁 모양', 'Drafting Tooltip Appearance'],
      fields: [
        number('TOOLTIPSIZE', '크기', 'Size'),
        number('TOOLTIPTRANSPARENCY', '투명도', 'Transparency'),
        check(
          'DYNTOOLTIPS',
          '모든 제도 툴팁에 설정 적용',
          'Apply settings to all drafting tooltips',
        ),
      ],
    },
  ],
  quick: [
    {
      title: ['빠른 특성 팔레트', 'Quick Properties Palette'],
      fields: [
        {
          ...check('QPMODE', '빠른 특성 팔레트 표시', 'Display Quick Properties palette'),
          signed: true,
        },
        check('PICKFIRST', '사전 선택 사용', 'Use preselection'),
        select('QPLOCATION', '팔레트 위치', 'Palette location', [
          [0, '커서에 따라 다름', 'Cursor-dependent'],
          [1, '정적', 'Static'],
        ]),
      ],
    },
  ],
  cycling: [
    {
      title: ['선택 순환', 'Selection Cycling'],
      fields: [
        { ...check('SELECTIONCYCLING', '선택 순환 허용', 'Allow Selection Cycling'), signed: true },
        select(
          'SELECTIONCYCLING',
          '선택 순환 리스트 상자 표시',
          'Display Selection Cycling list box',
          [
            [0, '끄기', 'Off'],
            [1, '배지만', 'Badge only'],
            [2, '배지 및 리스트 상자', 'Badge and list box'],
          ],
        ),
      ],
    },
  ],
};
