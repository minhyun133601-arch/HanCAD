import { useEffect, useRef } from 'react';

/** Coroutines read current modifier state without restarting or depending on React renders. */
export function useModifyKeys() {
  const held = useRef({ control: false, shift: false });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      held.current = { control: event.ctrlKey, shift: event.shiftKey };
    };
    const blur = () => {
      held.current = { control: false, shift: false };
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return held;
}
