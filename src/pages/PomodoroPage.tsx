// pages/PomodoroPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/tools/ToastContainer';
import type { PomodoroPhase, PomodoroSession, PomodoroSettings } from '../types/tools';

const DEFAULT_SETTINGS: PomodoroSettings = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLong: 4,
  autoStart: false,
  soundEnabled: true,
  notificationsEnabled: true,
};

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  work: '🔥 Focus',
  'short-break': '☕ Pause courte',
  'long-break': '🌴 Grande pause',
};

const PHASE_COLORS: Record<PomodoroPhase, { main: string; bg: string; border: string }> = {
  work: { main: '#fc8181', bg: 'rgba(252,129,129,.12)', border: 'rgba(252,129,129,.3)' },
  'short-break': { main: '#48bb78', bg: 'rgba(72,187,120,.12)', border: 'rgba(72,187,120,.3)' },
  'long-break': { main: '#63b3ed', bg: 'rgba(99,179,237,.12)', border: 'rgba(99,179,237,.3)' },
};

const genId = () => `pomo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// ── Circular progress ─────────────────────────────────────────
const CircularTimer: React.FC<{
  progress: number; // 0–1
  phase: PomodoroPhase;
  timeStr: string;
  isRunning: boolean;
}> = ({ progress, phase, timeStr, isRunning }) => {
  const c = PHASE_COLORS[phase];
  const R = 110;
  const circ = 2 * Math.PI * R;
  const offset = circ * (1 - progress);

  return (
    <div style={{ position: 'relative', width: 260, height: 260 }}>
      <svg width="260" height="260" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={130} cy={130} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} />
        {/* Progress */}
        <circle
          cx={130} cy={130} r={R}
          fill="none"
          stroke={c.main}
          strokeWidth={12}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset .5s ease, stroke .4s',
            filter: `drop-shadow(0 0 ${isRunning ? 10 : 0}px ${c.main})`,
          }}
        />
        {/* Glow arc */}
        <circle
          cx={130} cy={130} r={R}
          fill="none"
          stroke={c.main}
          strokeWidth={4}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          opacity={0.25}
          style={{ filter: `blur(4px)`, transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      {/* Center content */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontSize: 48, fontWeight: 800, letterSpacing: -2,
          fontFamily: "'Space Mono', monospace",
          color: c.main,
          textShadow: `0 0 20px ${c.main}`,
        }}>{timeStr}</div>
        <div style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>
          {PHASE_LABELS[phase]}
        </div>
        {isRunning && (
          <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%', background: c.main,
                animation: `tools-pulse-dot .9s ${i * .2}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Session dots ──────────────────────────────────────────────
const SessionDots: React.FC<{ completed: number; total: number; color: string }> = ({ completed, total, color }) => (
  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{
        width: i < completed ? 24 : 10,
        height: 10,
        borderRadius: 5,
        background: i < completed ? color : 'rgba(255,255,255,0.1)',
        boxShadow: i < completed ? `0 0 8px ${color}` : 'none',
        transition: 'all .3s',
      }} />
    ))}
  </div>
);

// ── Analytics mini chart ───────────────────────────────────────
const WeeklyChart: React.FC<{ sessions: PomodoroSession[] }> = ({ sessions }) => {
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const now = new Date();
  const weekData = days.map((_, i) => {
    const day = new Date(now);
    day.setDate(now.getDate() - now.getDay() + i + 1);
    const dayStr = day.toDateString();
    return sessions.filter(s => new Date(s.date).toDateString() === dayStr && s.phase === 'work').length;
  });
  const max = Math.max(...weekData, 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, padding: '0 4px' }}>
      {weekData.map((count, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: '100%',
            height: `${(count / max) * 60}px`,
            minHeight: count > 0 ? 6 : 2,
            background: count > 0
              ? 'linear-gradient(180deg, #fc8181, rgba(252,129,129,.4))'
              : 'rgba(255,255,255,0.06)',
            borderRadius: 4,
            boxShadow: count > 0 ? '0 0 8px rgba(252,129,129,.3)' : 'none',
            transition: 'height .4s ease',
          }} />
          <div style={{ fontSize: 10, color: '#4a5568' }}>{days[i]}</div>
          {count > 0 && <div style={{ fontSize: 9, color: '#fc8181', fontWeight: 700 }}>{count}</div>}
        </div>
      ))}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────
const PomodoroPage: React.FC = () => {
  const [settings, setSettings] = useLocalStorage<PomodoroSettings>('adj_pomodoro_settings', DEFAULT_SETTINGS);
  const [sessions, setSessions] = useLocalStorage<PomodoroSession[]>('adj_pomodoro_sessions', []);
  const [phase, setPhase] = useState<PomodoroPhase>('work');
  const [timeLeft, setTimeLeft] = useState(settings.workDuration * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionLabel, setSessionLabel] = useState('Session de travail');
  const [showSettings, setShowSettings] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalTime = {
    work: settings.workDuration * 60,
    'short-break': settings.shortBreakDuration * 60,
    'long-break': settings.longBreakDuration * 60,
  }[phase];

  const progress = 1 - timeLeft / totalTime;
  const timeStr = `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`;

  // Play audio beep
  const playBeep = useCallback(() => {
    if (!settings.soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {}
  }, [settings.soundEnabled]);

  // Phase complete
  const handlePhaseComplete = useCallback(() => {
    setIsRunning(false);
    playBeep();

    if (phase === 'work') {
      const newCount = sessionCount + 1;
      setSessionCount(newCount);
      setSessions(prev => [...prev, {
        id: genId(),
        label: sessionLabel,
        date: new Date().toISOString(),
        duration: settings.workDuration,
        phase: 'work',
      }]);

      const nextPhase = newCount % settings.sessionsBeforeLong === 0 ? 'long-break' : 'short-break';
      addToast(`Session terminée ! 🎉 ${PHASE_LABELS[nextPhase]} commençant…`, 'success');
      setPhase(nextPhase);
      setTimeLeft(nextPhase === 'long-break' ? settings.longBreakDuration * 60 : settings.shortBreakDuration * 60);

      if ('Notification' in window && Notification.permission === 'granted' && settings.notificationsEnabled) {
        new Notification('NovaMind Pomodoro', { body: `Session terminée ! ${PHASE_LABELS[nextPhase]}` });
      }
    } else {
      addToast('Pause terminée. Retour au travail ! 💪', 'info');
      setPhase('work');
      setTimeLeft(settings.workDuration * 60);
    }
  }, [phase, sessionCount, sessionLabel, settings, addToast, playBeep, setSessions]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { handlePhaseComplete(); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, handlePhaseComplete]);

  // Update document title
  useEffect(() => {
    if (isRunning) document.title = `${timeStr} — ${PHASE_LABELS[phase]} | Adjoumani`;
    else document.title = 'Pomodoro Pro | Adjoumani';
    return () => { document.title = 'Adjoumani Portfolio'; };
  }, [timeStr, isRunning, phase]);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(totalTime);
  };

  const switchPhase = (p: PomodoroPhase) => {
    setIsRunning(false);
    setPhase(p);
    setTimeLeft({
      work: settings.workDuration * 60,
      'short-break': settings.shortBreakDuration * 60,
      'long-break': settings.longBreakDuration * 60,
    }[p]);
  };

  const c = PHASE_COLORS[phase];

  // Stats
  const todaySessions = sessions.filter(s =>
    s.phase === 'work' && new Date(s.date).toDateString() === new Date().toDateString()
  );
  const totalFocusMin = sessions.filter(s => s.phase === 'work').reduce((a, s) => a + s.duration, 0);

  return (
    <div className="tools-page" style={{ fontFamily: "'Syne', sans-serif" }}>
      <div className="tools-starfield" />
      <div className="tools-nebula" />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="tools-badge" style={{
            background: c.bg, color: c.main, border: `1px solid ${c.border}`,
            marginBottom: 12, display: 'inline-flex',
          }}>⏱️ Pomodoro Pro</div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, marginBottom: 8 }}>
            Restez dans votre <span className="tools-gradient-text">zone de flow</span>
          </h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28 }}>
          {/* Timer section */}
          <div>
            {/* Phase tabs */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 32,
              background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 6,
            }}>
              {(['work', 'short-break', 'long-break'] as PomodoroPhase[]).map(p => (
                <button
                  key={p}
                  onClick={() => switchPhase(p)}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none',
                    background: phase === p ? PHASE_COLORS[p].bg : 'transparent',
                    color: phase === p ? PHASE_COLORS[p].main : '#718096',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                    outline: phase === p ? `1px solid ${PHASE_COLORS[p].border}` : 'none',
                    transition: 'all .2s',
                  }}
                >{PHASE_LABELS[p]}</button>
              ))}
            </div>

            {/* Timer */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
              <CircularTimer progress={progress} phase={phase} timeStr={timeStr} isRunning={isRunning} />

              <SessionDots
                completed={sessionCount % settings.sessionsBeforeLong}
                total={settings.sessionsBeforeLong}
                color={c.main}
              />

              {/* Session label */}
              <input
                className="tools-input"
                value={sessionLabel}
                onChange={e => setSessionLabel(e.target.value)}
                placeholder="Nom de la session…"
                style={{ maxWidth: 280, textAlign: 'center' }}
              />

              {/* Controls */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={resetTimer}
                  className="tools-btn tools-btn-ghost"
                  style={{ borderRadius: '50%', width: 44, height: 44, padding: 0, fontSize: 18 }}
                >↺</button>

                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setIsRunning(p => !p)}
                  style={{
                    width: 80, height: 80, borderRadius: '50%', border: 'none',
                    background: `linear-gradient(135deg, ${c.main}, rgba(${hexToRgb(c.main)}, 0.7))`,
                    color: 'white', fontSize: 28, cursor: 'pointer',
                    boxShadow: `0 0 ${isRunning ? 30 : 10}px ${c.main}`,
                    transition: 'box-shadow .3s',
                  }}
                >
                  {isRunning ? '⏸' : '▶'}
                </motion.button>

                <button
                  onClick={() => {
                    setIsRunning(false);
                    if (phase === 'work') {
                      const next = (sessionCount + 1) % settings.sessionsBeforeLong === 0 ? 'long-break' : 'short-break';
                      switchPhase(next);
                    } else { switchPhase('work'); }
                  }}
                  className="tools-btn tools-btn-ghost"
                  style={{ borderRadius: '50%', width: 44, height: 44, padding: 0, fontSize: 18 }}
                >⏭</button>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Stats */}
            <div className="tools-glass" style={{ padding: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#a0aec0', marginBottom: 14 }}>📊 Statistiques</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: "Aujourd'hui", value: todaySessions.length, unit: 'sessions', color: '#fc8181' },
                  { label: 'Session', value: sessionCount, unit: 'complétées', color: '#ecc94b' },
                  { label: 'Total focus', value: totalFocusMin, unit: 'minutes', color: '#63b3ed' },
                  { label: 'Historique', value: sessions.length, unit: 'sessions', color: '#48bb78' },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: `rgba(${hexToRgb(s.color)}, 0.08)`,
                    border: `1px solid rgba(${hexToRgb(s.color)}, 0.2)`,
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "'Space Mono', monospace" }}>
                      {s.value}
                    </div>
                    <div style={{ fontSize: 10, color: '#718096', marginTop: 2 }}>{s.unit}</div>
                    <div style={{ fontSize: 9, color: '#4a5568' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly chart */}
            <div className="tools-glass" style={{ padding: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#a0aec0', marginBottom: 14 }}>📅 Cette semaine</div>
              <WeeklyChart sessions={sessions} />
            </div>

            {/* Settings */}
            <div className="tools-glass" style={{ padding: 18 }}>
              <button
                onClick={() => setShowSettings(p => !p)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  color: '#a0aec0', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                }}
              >
                ⚙️ Paramètres
                <span style={{ transform: showSettings ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
              </button>
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { key: 'workDuration', label: 'Focus (min)', min: 1, max: 90 },
                        { key: 'shortBreakDuration', label: 'Pause courte (min)', min: 1, max: 30 },
                        { key: 'longBreakDuration', label: 'Grande pause (min)', min: 5, max: 60 },
                        { key: 'sessionsBeforeLong', label: 'Sessions avant longue pause', min: 2, max: 8 },
                      ].map(({ key, label, min, max }) => (
                        <div key={key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#718096', marginBottom: 5 }}>
                            <span>{label}</span>
                            <span style={{ color: c.main, fontWeight: 700 }}>
                              {settings[key as keyof PomodoroSettings] as number}
                            </span>
                          </div>
                          <input type="range" min={min} max={max}
                            value={settings[key as keyof PomodoroSettings] as number}
                            onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))}
                            style={{ width: '100%', accentColor: c.main }}
                          />
                        </div>
                      ))}
                      {/* Toggles */}
                      {[
                        { key: 'soundEnabled', label: '🔔 Son' },
                        { key: 'autoStart', label: '▶ Auto-start' },
                        { key: 'notificationsEnabled', label: '💬 Notifications' },
                      ].map(({ key, label }) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: '#718096' }}>{label}</span>
                          <button
                            onClick={() => setSettings(s => ({ ...s, [key]: !s[key as keyof PomodoroSettings] }))}
                            style={{
                              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                              background: settings[key as keyof PomodoroSettings]
                                ? `linear-gradient(90deg, ${c.main}, rgba(${hexToRgb(c.main)}, .7))`
                                : 'rgba(255,255,255,0.1)',
                              position: 'relative', transition: 'background .2s',
                            }}
                          >
                            <div style={{
                              position: 'absolute', top: 3,
                              left: settings[key as keyof PomodoroSettings] ? 22 : 3,
                              width: 18, height: 18, borderRadius: '50%', background: 'white',
                              transition: 'left .2s',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                            }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Clear history */}
            {sessions.length > 0 && (
              <button
                className="tools-btn tools-btn-danger"
                onClick={() => { setSessions([]); setSessionCount(0); addToast('Historique effacé', 'info'); }}
                style={{ fontSize: 12 }}
              >🗑️ Effacer l'historique ({sessions.length} sessions)</button>
            )}
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '99,179,237';
}

export default PomodoroPage;
