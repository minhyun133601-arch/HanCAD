export type IconName =
  | 'line'
  | 'polyline'
  | 'circle'
  | 'arc'
  | 'rectangle'
  | 'point'
  | 'cloud'
  | 'region'
  | 'move'
  | 'copy'
  | 'rotate'
  | 'trim'
  | 'offset'
  | 'fillet'
  | 'text'
  | 'dimension'
  | 'layer'
  | 'new'
  | 'open'
  | 'save'
  | 'undo'
  | 'redo'
  | 'plot'
  | 'block'
  | 'options';

const paths: Record<IconName, string> = {
  line: 'M4 21 21 4 M3 19h4v4H3z M19 2h4v4h-4z',
  polyline: 'M3 21 8 5 16 18 23 7 M2 19h3v3H2z M7 3h3v3H7z M15 17h3v3h-3z',
  circle: 'M23 13a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M11 13h4 M13 11v4',
  arc: 'M3 21A18 18 0 0 1 21 3 M2 19h3v3H2z M19 2h3v3h-3z',
  rectangle: 'M3 5h20v16H3z M2 4h3v3H2z M21 19h3v3h-3z',
  point: 'M13 3v22 M3 14h20 M8 9h10v10H8z',
  cloud:
    'M6 22a4 4 0 0 1-3-7 4 4 0 0 1 1-8 4 4 0 0 1 7-3 4 4 0 0 1 7 0 4 4 0 0 1 6 5 4 4 0 0 1-1 7 4 4 0 0 1-6 7 4 4 0 0 1-6 1 4 4 0 0 1-5-2',
  region: 'M3 5h20v18H3z M3 13l8-8 M3 21 19 5 M9 23 23 9 M17 23l6-6',
  move: 'M13 2v22 M2 13h22 M9 6l4-4 4 4 M9 20l4 4 4-4 M6 9l-4 4 4 4 M20 9l4 4-4 4',
  copy: 'M3 3h13v13H3z M10 10h13v13H10z',
  rotate: 'M5 10a9 9 0 1 1 1 10 M5 3v7h7 M13 11v4 M11 13h4',
  trim: 'M4 4l18 18 M4 22 22 4 M8 2v22 M2 18h22',
  offset: 'M3 20V6h16 M8 23V11h16 M12 3v3 M15 8v3',
  fillet: 'M3 3v12a8 8 0 0 0 8 8h12 M8 3v12a3 3 0 0 0 3 3h12',
  text: 'M3 4h20 M13 4v19 M8 23h10 M3 4v4 M23 4v4',
  dimension: 'M3 4v20 M23 4v20 M3 8h20 M3 8l4-3 M23 8l-4 3 M8 20h10',
  layer: 'M2 8l11-6 11 6-11 6z M2 13l11 6 11-6 M2 18l11 6 11-6',
  new: 'M6 2h10l5 5v17H6z M16 2v6h5 M9 15h9 M13 11v9',
  open: 'M3 8V4h8l3 4h9v4 M3 8l2 15h16l3-12H7',
  save: 'M3 3h17l3 3v17H3z M7 3v8h12V3 M7 23v-8h12v8',
  undo: 'M9 4l-6 6 6 6 M3 10h12a8 8 0 0 1 0 16',
  redo: 'M17 4l6 6-6 6 M23 10H11a8 8 0 0 0 0 16',
  plot: 'M7 3h12v6H7z M7 18H3V9h20v9h-4 M7 14h12v10H7z M19 11h1',
  block: 'M3 7l10-5 10 5v13l-10 5-10-5z M3 7l10 5 10-5 M13 12v13',
  options:
    'M13 2v5 M13 19v5 M2 13h5 M19 13h5 M5 5l4 4 M17 17l4 4 M5 21l4-4 M17 9l4-4 M18 13a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
};

export function Icon({ name, small = false }: { name: IconName; small?: boolean }) {
  return (
    <svg
      className={small ? 'tool-icon small-icon' : 'tool-icon'}
      viewBox="0 0 26 28"
      aria-hidden="true"
    >
      <path
        d={paths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
