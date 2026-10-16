import type { ToggleId } from '@hancad/input';

/** Original geometric symbols; no Autodesk artwork is included. */
const paths: Readonly<Record<ToggleId, string>> = {
  grid: 'M3 3H17V17H3ZM3 8H17M3 12H17M8 3V17M12 3V17',
  snap: 'M3 3H17V17H3ZM7 10H13M10 7V13',
  ortho: 'M4 3V16H17M4 12H8V16',
  polar: 'M4 15H17M4 15L14 4M9 15A5 5 0 0 0 7.5 11.5',
  objectSnap: 'M4 4H16V16H4ZM1 10H6M14 10H19M10 1V6M10 14V19',
  object3dSnap: 'M3 6L10 2L17 6V14L10 18L3 14ZM3 6L10 10L17 6M10 10V18',
  objectSnapTracking: 'M2 15H15V2M3 11L7 15L3 19M11 6L15 2L19 6',
  dynamicInput: 'M2 4H18V15H2ZM5 8H8M5 11H11M14 7V12',
  dynamicUcs: 'M4 3V16H17M4 16L12 8M11 5H16V10',
  isoplane: 'M2 6L10 2L18 6L10 10ZM2 6V14L10 18L18 14V6M10 10V18',
  selectionCycling: 'M3 3H12V12H3ZM8 8H17V17H8M12 3L16 3L16 6',
  coordinates: 'M4 2V16H18M4 16L11 9M2 5L4 2L6 5M15 14L18 16L15 18',
  groups: 'M2 5H8V11H2ZM12 9H18V15H12M8 8H12M7 15H11',
  pickStyle: 'M2 5H8V11H2ZM12 9H18V15H12M8 8H12M7 15H11',
  inferConstraints: 'M3 5H17M5 3V17M11 11L16 16M11 16L16 11',
  quickProperties: 'M4 2H16V18H4ZM7 6H13M7 10H13M7 14H11',
  tablet: 'M2 4H18V16H2ZM6 12L12 6L14 8L8 14H6Z',
  lineweight: 'M2 4H18M2 9H18M2 10H18M2 15H18M2 16H18M2 17H18',
};

export function StatusIcon({ id }: { id: ToggleId }) {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true" focusable="false">
      <path
        d={paths[id]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
