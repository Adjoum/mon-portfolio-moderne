// src/components/mindmap/ThemePanel.jsx
// Panneau flottant : choix du thème (dark/light/system) + fond du canvas
import React, { useState } from 'react';
import {
  useTheme,
  THEMES, THEME_LABELS,
  BG_MODES, BG_LABELS,
} from '../../context/ThemeContext';

export function ThemePanel({ onClose }) {
  const { theme, setTheme, bgMode, setBgMode, palette } = useTheme();

  return (
    <div
      style={{
        position: 'absolute', bottom: 60, left: 16, zIndex: 200,
        width: 220,
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: 16,
        backdropFilter: 'blur(20px)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.65)',
        overflow: 'hidden',
        animation: 'panel-in .18s cubic-bezier(.22,1,.36,1)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: `1px solid ${palette.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: palette.accent, fontWeight: 700, fontSize: 13 }}>
          🎨 Apparence
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: palette.textMuted,
          cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 0,
        }}>×</button>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Theme selector */}
        <Section label="Thème" palette={palette}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {THEMES.map(t => (
              <OptionPill
                key={t}
                active={theme === t}
                icon={THEME_LABELS[t].icon}
                label={THEME_LABELS[t].label}
                onClick={() => setTheme(t)}
                palette={palette}
              />
            ))}
          </div>
        </Section>

        {/* Canvas background */}
        <Section label="Fond du canvas" palette={palette}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {BG_MODES.map(bm => (
              <OptionPill
                key={bm}
                active={bgMode === bm}
                icon={BG_LABELS[bm].icon}
                label={BG_LABELS[bm].label}
                onClick={() => setBgMode(bm)}
                palette={palette}
              />
            ))}
          </div>
        </Section>

      </div>
    </div>
  );
}

function Section({ label, children, palette }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: palette.textMuted,
        letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function OptionPill({ active, icon, label, onClick, palette }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '8px 4px',
        border: active
          ? `1px solid ${palette.accent}66`
          : `1px solid ${palette.border}`,
        borderRadius: 10,
        background: active
          ? `${palette.accent}18`
          : hov ? palette.surfaceHover : 'transparent',
        color: active ? palette.accent : palette.textMuted,
        cursor: 'pointer', fontSize: 11, transition: 'all .14s',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{label}</span>
    </button>
  );
}
