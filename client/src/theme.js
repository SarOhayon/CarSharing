import { useEffect, useState } from 'react';

// Light/dark choice, remembered per device. Until someone picks, it follows
// the device setting.
const read = () => {
  try {
    return localStorage.getItem('theme');
  } catch {
    return null;
  }
};

export function useTheme() {
  const [theme, setTheme] = useState(() => read() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* private mode: just don't remember it */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}
