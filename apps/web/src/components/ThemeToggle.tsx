'use client';

import { useEffect, useState } from 'react';
import { applyTheme, resolveTheme, type ThemeId } from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeId>('night');

  useEffect(() => {
    const resolved = resolveTheme();
    setTheme(resolved);
    applyTheme(resolved);
  }, []);

  function choose(next: ThemeId) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Appearance">
      <button
        type="button"
        className={theme === 'day' ? 'active' : ''}
        aria-pressed={theme === 'day'}
        onClick={() => choose('day')}
      >
        Day
      </button>
      <button
        type="button"
        className={theme === 'night' ? 'active' : ''}
        aria-pressed={theme === 'night'}
        onClick={() => choose('night')}
      >
        Night
      </button>
    </div>
  );
}
