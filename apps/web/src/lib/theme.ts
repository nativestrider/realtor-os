export type ThemeId = 'day' | 'night';

export const THEME_STORAGE_KEY = 'realtor-theme';

export function isThemeId(value: string | null): value is ThemeId {
  return value === 'day' || value === 'night';
}

export function themeFromSystem(): ThemeId {
  if (typeof window === 'undefined') return 'night';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
}

export function readStoredTheme(): ThemeId | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: ThemeId) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode
  }
}

export function resolveTheme(): ThemeId {
  return readStoredTheme() ?? themeFromSystem();
}
