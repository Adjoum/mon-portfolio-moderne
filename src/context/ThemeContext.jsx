// src/context/ThemeContext.jsx
// Gère : thème UI (dark | light | system) + fond du canvas (none | dots | grid | lines | chess)
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

export const THEMES    = ['dark', 'light', 'system'];
export const BG_MODES  = ['none', 'dots', 'grid', 'lines', 'chess'];

export const THEME_LABELS = {
  dark:   { icon: '🌙', label: 'Sombre'  },
  light:  { icon: '☀️', label: 'Clair'   },
  system: { icon: '💻', label: 'Système' },
};

export const BG_LABELS = {
  none:  { icon: '⬜', label: 'Aucun'      },
  dots:  { icon: '⠿',  label: 'Points'     },
  grid:  { icon: '▦',  label: 'Grille'     },
  lines: { icon: '≡',  label: 'Lignes'     },
  chess: { icon: '▣',  label: 'Carreaux'   },
};

// Palette par thème
export const PALETTES = {
  dark: {
    canvasBg:     '#04040e',
    canvasBg2:    '#0a0a1e',
    surface:      'rgba(8,8,22,0.95)',
    surfaceHover: 'rgba(14,14,32,0.98)',
    border:       'rgba(110,231,247,0.12)',
    borderHover:  'rgba(110,231,247,0.28)',
    text:         '#e2e8f0',
    textMuted:    '#64748b',
    textSubtle:   '#334155',
    nodeBg:       'rgba(10,10,28,0.88)',
    nodeStroke:   0.42,
    accent:       '#6EE7F7',
    accentSecond: '#A78BFA',
    gridDot:      'rgba(110,231,247,0.06)',
    gridLine:     'rgba(110,231,247,0.04)',
  },
  light: {
    canvasBg:     '#f0f4f8',
    canvasBg2:    '#e8edf5',
    surface:      'rgba(255,255,255,0.97)',
    surfaceHover: 'rgba(248,250,252,0.99)',
    border:       'rgba(15,23,42,0.12)',
    borderHover:  'rgba(15,23,42,0.28)',
    text:         '#0f172a',
    textMuted:    '#64748b',
    textSubtle:   '#94a3b8',
    nodeBg:       'rgba(255,255,255,0.92)',
    nodeStroke:   0.55,
    accent:       '#0ea5e9',
    accentSecond: '#8b5cf6',
    gridDot:      'rgba(15,23,42,0.09)',
    gridLine:     'rgba(15,23,42,0.06)',
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme,  setTheme]  = useState(() => localStorage.getItem('nm-theme')  || 'dark');
  const [bgMode, setBgMode] = useState(() => localStorage.getItem('nm-bg')     || 'dots');

  // Resolve system preference
  const resolved = useMemo(() => {
    if (theme !== 'system') return theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, [theme]);

  const palette = PALETTES[resolved] || PALETTES.dark;

  useEffect(() => { localStorage.setItem('nm-theme', theme);  }, [theme]);
  useEffect(() => { localStorage.setItem('nm-bg',    bgMode); }, [bgMode]);

  // Watch system preference when theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {}; // re-render via setTheme identity trick
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, bgMode, setBgMode, resolved, palette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
};
