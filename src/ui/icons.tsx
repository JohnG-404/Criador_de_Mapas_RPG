/** Ícones de traço usados nos botões da barra superior e nos diálogos. */
export const ICONS = {
  scroll: 'M7 4h11a2 2 0 0 1 2 2v1h-3M7 4a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h12a2 2 0 0 0 2-2V7M7 4a2 2 0 0 1 2 2v1M9 11h5M9 15h4',
  dice: 'M12 2l8.5 5v10L12 22l-8.5-5V7zM12 6.5 7 15h10zM12 2v4.5M3.5 7 7 15M20.5 7 17 15M3.5 17 7 15M20.5 17 17 15M7 15l5 7 5-7',
  chest: 'M3 10h18v10H3zM3 10a9 5 0 0 1 18 0M10 13h4v3h-4zM3 14h7M14 14h7',
  quill: 'M20 3C12 4 7 9 5 19l1 1c2-5 5-8 9-9-2 0-4 0-5 1 3-3 6-4 9-5-2 0-3 0-4 .5C17 6 19 5 20 3zM4 21h9',
  cloud: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.5 4.3 4.3 0 0 0 7 18z',
  export: 'M12 3v12M7.5 7.5 12 3l4.5 4.5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  undo: 'M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3',
  frame: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  players: 'M3 5h18v11H3zM8 20h8M12 16v4',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  portal: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9M12 3C9.5 5.6 8.3 8.6 8.3 12s1.2 6.4 3.7 9',
  user: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  access: 'M12 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM4 8.5c2.7.8 5.3 1.2 8 1.2s5.3-.4 8-1.2M12 9.7V15M12 15l-3.5 6.5M12 15l3.5 6.5',
} as const;

export type IconName = keyof typeof ICONS;

export function UiIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={ICONS[name]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
