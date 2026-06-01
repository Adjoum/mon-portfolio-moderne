import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, GripHorizontal } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const AI_AVATAR_VIDEO = '/videos/ai-avatar.mp4';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Quelles sont tes compétences ?',
  'Parle-moi de tes projets',
  'Comment te contacter ?',
  'Quelle est ta formation ?',
];

const VideoAvatar: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span className={`ai-video-avatar ${className}`}>
      <video
        src={AI_AVATAR_VIDEO}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      />
    </span>
  );
};

export const AIAgent: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "👋 Salut ! Je suis le clone IA d'Adjoumani. Pose-moi n'importe quelle question sur son parcours, ses projets ou ses compétences !",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');

    const updateScreenSize = () => {
      setIsSmallScreen(media.matches);

      if (media.matches) {
        setPos({ x: 0, y: 0 });
        setDragging(false);
      }
    };

    updateScreenSize();

    if (media.addEventListener) {
      media.addEventListener('change', updateScreenSize);
      return () => media.removeEventListener('change', updateScreenSize);
    }

    media.addListener(updateScreenSize);
    return () => media.removeListener(updateScreenSize);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input à l'ouverture
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // ── Drag desktop/tablette uniquement ───────────────────────
  const onDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isSmallScreen) return;

      setDragging(true);

      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        px: pos.x,
        py: pos.y,
      };

      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [pos, isSmallScreen]
  );

  useEffect(() => {
    if (!dragging || isSmallScreen) return;

    const onMove = (e: PointerEvent) => {
      setPos({
        x: dragStart.current.px + (e.clientX - dragStart.current.mx),
        y: dragStart.current.py + (e.clientY - dragStart.current.my),
      });
    };

    const onUp = () => setDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, isSmallScreen]);

  // ── Send message ──────────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();

    if (!msg || loading) return;

    setInput('');

    const userMsg: Message = { role: 'user', content: msg };
    const newHistory = [...messages, userMsg];

    setMessages(newHistory);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.filter(
            (m) => m.role !== 'assistant' || messages.indexOf(m) > 0
          ),
        }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || data.error || 'Désolé, une erreur est survenue.',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '❌ Connexion impossible. Réessaie dans un instant.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const popupStyle: React.CSSProperties = isSmallScreen
    ? {
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(env(safe-area-inset-bottom) + 88px)',
        zIndex: 1001,
        cursor: 'default',
      }
    : {
        position: 'fixed',
        bottom: `calc(env(safe-area-inset-bottom) + ${100 - pos.y}px)`,
        right: `calc(env(safe-area-inset-right) + ${28 - pos.x}px)`,
        zIndex: 1001,
        cursor: dragging ? 'grabbing' : 'default',
      };

  return (
    <>
      {/* ══ Bouton flottant vidéo ═════════════════════════════ */}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            aria-label="Ouvrir le chat IA"
            onClick={() => setOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            style={{ zIndex: 1000 }}
            className="ai-agent-btn"
          >
            <span className="ai-ring ai-ring-1" />
            <span className="ai-ring ai-ring-2" />
            <span className="ai-ring ai-ring-3" />

            <VideoAvatar className="ai-avatar" />

            <span className="ai-online-dot" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══ Chat popup ═══════════════════════════════════════ */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            style={popupStyle}
            className="ai-chat-popup"
          >
            {/* Header draggable */}
            <div
              className={`ai-chat-header ${isSmallScreen ? 'ai-chat-header-mobile' : ''}`}
              onPointerDown={onDragStart}
            >
              <GripHorizontal size={14} style={{ opacity: 0.4 }} />

              <div className="ai-chat-header-info">
                <div className="ai-chat-avatar">🤖</div>

                <div className="ai-chat-title-zone">
                  <div className="ai-chat-name">Adjoumani AI</div>
                  <div className="ai-chat-status">
                    <span className="ai-status-dot" />
                    En ligne · Clone IA
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setPos({ x: 0, y: 0 });
                }}
                className="ai-close-btn"
                aria-label="Fermer le chat IA"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div className="ai-messages">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className={`ai-msg ai-msg-${msg.role}`}
                >
                  {msg.role === 'assistant' && (
                    <span className="ai-msg-icon">🤖</span>
                  )}

                  <div className="ai-msg-bubble">{msg.content}</div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="ai-msg ai-msg-assistant"
                >
                  <span className="ai-msg-icon">🤖</span>

                  <div className="ai-msg-bubble ai-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </motion.div>
              )}

              <div ref={messagesEnd} />
            </div>

            {/* Suggestions */}
            {messages.length === 1 && (
              <div className="ai-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => sendMessage(s)}
                    className="ai-suggestion-chip"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="ai-input-bar">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    sendMessage();
                  }
                }}
                placeholder="Pose ta question..."
                className="ai-input"
                disabled={loading}
              />

              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="ai-send-btn"
                aria-label="Envoyer le message"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .ai-agent-btn,
        .ai-agent-btn *,
        .ai-chat-popup,
        .ai-chat-popup * {
          box-sizing: border-box;
        }

        /* ── Vidéo du bouton flottant uniquement ───── */
        .ai-video-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 50%;
          background: #0f0f23;
          flex-shrink: 0;
        }

        .ai-video-avatar video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          border-radius: inherit;
          pointer-events: none;
        }

        /* ── Bouton flottant ───────────────────────── */
        .ai-agent-btn {
          position: fixed;
          right: calc(env(safe-area-inset-right) + 28px);
          bottom: calc(env(safe-area-inset-bottom) + 132px);
          width: 76px;
          height: 76px;
          min-width: 76px;
          min-height: 76px;
          max-width: 76px;
          max-height: 76px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899);
          box-shadow:
            0 0 32px rgba(99,102,241,0.65),
            0 12px 36px rgba(0,0,0,0.48);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          overflow: visible;
        }

        .ai-avatar {
          position: relative;
          z-index: 2;
          width: 70px;
          height: 70px;
          min-width: 70px;
          min-height: 70px;
          max-width: 70px;
          max-height: 70px;
          border: 2px solid rgba(255,255,255,0.26);
          box-shadow: inset 0 0 12px rgba(255,255,255,0.18);
        }

        .ai-ring {
          position: absolute;
          border-radius: 50%;
          border: 2px solid rgba(99,102,241,0.35);
          animation: ai-pulse 2.4s ease-out infinite;
          pointer-events: none;
        }

        .ai-ring-1 {
          width: 90px;
          height: 90px;
          animation-delay: 0s;
        }

        .ai-ring-2 {
          width: 112px;
          height: 112px;
          animation-delay: 0.6s;
        }

        .ai-ring-3 {
          width: 134px;
          height: 134px;
          animation-delay: 1.2s;
        }

        @keyframes ai-pulse {
          0% {
            transform: scale(0.85);
            opacity: 0.75;
          }

          100% {
            transform: scale(1.25);
            opacity: 0;
          }
        }

        .ai-online-dot {
          position: absolute;
          bottom: 7px;
          right: 7px;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #22c55e;
          border: 2px solid #0f0f23;
          animation: ai-blink 2s ease-in-out infinite;
          z-index: 3;
        }

        @keyframes ai-blink {
          0%, 100% {
            opacity: 1;
          }

          50% {
            opacity: 0.4;
          }
        }

        /* ── Popup ─────────────────────────────────── */
        .ai-chat-popup {
          width: min(360px, calc(100vw - 32px));
          max-height: min(540px, calc(100dvh - 120px));
          border-radius: 20px;
          overflow: hidden;
          background: rgba(10,10,30,0.95);
          border: 1px solid rgba(99,102,241,0.3);
          box-shadow:
            0 0 0 1px rgba(99,102,241,0.1),
            0 24px 80px rgba(0,0,0,0.7),
            0 0 60px rgba(99,102,241,0.15);
          backdrop-filter: blur(24px);
          display: flex;
          flex-direction: column;
        }

        .ai-chat-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: linear-gradient(
            135deg,
            rgba(99,102,241,0.2),
            rgba(139,92,246,0.1)
          );
          border-bottom: 1px solid rgba(99,102,241,0.2);
          cursor: grab;
          user-select: none;
          touch-action: none;
        }

        .ai-chat-header-mobile {
          cursor: default;
          touch-action: auto;
        }

        .ai-chat-header:active {
          cursor: grabbing;
        }

        .ai-chat-header-mobile:active {
          cursor: default;
        }

        .ai-chat-header-info {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }

        .ai-chat-title-zone {
          min-width: 0;
        }

        .ai-chat-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #ec4899);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }

        .ai-chat-name {
          color: #fff;
          font-weight: 700;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ai-chat-status {
          color: #94a3b8;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ai-status-dot {
          width: 7px;
          height: 7px;
          min-width: 7px;
          border-radius: 50%;
          background: #22c55e;
          animation: ai-blink 2s infinite;
        }

        .ai-close-btn {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          transition: 0.2s;
          flex-shrink: 0;
        }

        .ai-close-btn:hover {
          color: #fff;
          background: rgba(255,255,255,0.1);
        }

        .ai-messages {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          scrollbar-width: thin;
          scrollbar-color: rgba(99,102,241,0.3) transparent;
        }

        .ai-msg {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          min-width: 0;
        }

        .ai-msg-user {
          flex-direction: row-reverse;
        }

        .ai-msg-icon {
          font-size: 18px;
          flex-shrink: 0;
          margin-bottom: 2px;
        }

        .ai-msg-bubble {
          max-width: min(82%, 280px);
          padding: 10px 14px;
          border-radius: 18px;
          font-size: 13px;
          line-height: 1.5;
          color: #e2e8f0;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .ai-msg-assistant .ai-msg-bubble {
          background: rgba(99,102,241,0.15);
          border: 1px solid rgba(99,102,241,0.25);
          border-bottom-left-radius: 4px;
        }

        .ai-msg-user .ai-msg-bubble {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          border-bottom-right-radius: 4px;
        }

        .ai-typing {
          display: flex;
          gap: 5px;
          align-items: center;
          padding: 14px 18px !important;
        }

        .ai-typing span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #6366f1;
          animation: ai-dot 1.2s ease-in-out infinite;
        }

        .ai-typing span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .ai-typing span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes ai-dot {
          0%, 80%, 100% {
            transform: scale(0.7);
            opacity: 0.4;
          }

          40% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .ai-suggestions {
          padding: 0 12px 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-height: 96px;
          overflow-y: auto;
        }

        .ai-suggestion-chip {
          background: rgba(99,102,241,0.12);
          border: 1px solid rgba(99,102,241,0.3);
          color: #a5b4fc;
          border-radius: 20px;
          padding: 6px 12px;
          font-size: 11px;
          cursor: pointer;
          transition: 0.2s;
          white-space: nowrap;
        }

        .ai-suggestion-chip:hover {
          background: rgba(99,102,241,0.25);
          color: #fff;
        }

        .ai-input-bar {
          display: flex;
          gap: 8px;
          padding: 12px 14px;
          border-top: 1px solid rgba(99,102,241,0.2);
          background: rgba(0,0,0,0.3);
          flex-shrink: 0;
        }

        .ai-input {
          flex: 1;
          min-width: 0;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(99,102,241,0.25);
          border-radius: 12px;
          padding: 10px 14px;
          color: #e2e8f0;
          font-size: 13px;
          outline: none;
          transition: 0.2s;
        }

        .ai-input:focus {
          border-color: #6366f1;
          background: rgba(99,102,241,0.1);
        }

        .ai-input::placeholder {
          color: #64748b;
        }

        .ai-send-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: 0.2s;
          flex-shrink: 0;
        }

        .ai-send-btn:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 0 20px rgba(99,102,241,0.5);
        }

        .ai-send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* ── Tablette ───────────────────────────────── */
        @media (max-width: 768px) {
          .ai-agent-btn {
            width: 72px;
            height: 72px;
            min-width: 72px;
            min-height: 72px;
            max-width: 72px;
            max-height: 72px;
            right: calc(env(safe-area-inset-right) + 22px);
            bottom: calc(env(safe-area-inset-bottom) + 124px);
          }

          .ai-avatar {
            width: 66px;
            height: 66px;
            min-width: 66px;
            min-height: 66px;
            max-width: 66px;
            max-height: 66px;
          }

          .ai-ring-1 {
            width: 84px;
            height: 84px;
          }

          .ai-ring-2 {
            width: 104px;
            height: 104px;
          }

          .ai-ring-3 {
            width: 124px;
            height: 124px;
          }
        }

        /* ── Mobile ─────────────────────────────────── */
        @media (max-width: 640px) {
          .ai-chat-popup {
            width: auto;
            left: 12px;
            right: 12px;
            bottom: calc(env(safe-area-inset-bottom) + 88px);
            max-height: calc(100dvh - 112px);
            border-radius: 18px;
          }

          .ai-agent-btn {
            width: 66px;
            height: 66px;
            min-width: 66px;
            min-height: 66px;
            max-width: 66px;
            max-height: 66px;
            right: calc(env(safe-area-inset-right) + 16px);
            bottom: calc(env(safe-area-inset-bottom) + 116px);
          }

          .ai-avatar {
            width: 60px;
            height: 60px;
            min-width: 60px;
            min-height: 60px;
            max-width: 60px;
            max-height: 60px;
          }

          .ai-ring-1 {
            width: 80px;
            height: 80px;
          }

          .ai-ring-2 {
            width: 98px;
            height: 98px;
          }

          .ai-ring-3 {
            width: 116px;
            height: 116px;
          }

          .ai-msg-bubble {
            max-width: calc(100vw - 92px);
          }
        }

        /* ── Très petits écrans ─────────────────────── */
        @media (max-width: 380px) {
          .ai-chat-popup {
            left: 8px;
            right: 8px;
            bottom: calc(env(safe-area-inset-bottom) + 78px);
            max-height: calc(100dvh - 96px);
            border-radius: 16px;
          }

          .ai-chat-header {
            padding: 12px;
            gap: 8px;
          }

          .ai-chat-avatar {
            width: 32px;
            height: 32px;
            font-size: 16px;
          }

          .ai-chat-name {
            font-size: 13px;
          }

          .ai-chat-status {
            font-size: 10px;
          }

          .ai-messages {
            padding: 12px 10px;
          }

          .ai-msg-bubble {
            font-size: 12.5px;
            padding: 9px 12px;
            max-width: calc(100vw - 82px);
          }

          .ai-suggestions {
            padding: 0 10px 8px;
          }

          .ai-suggestion-chip {
            font-size: 10.5px;
            padding: 5px 10px;
          }

          .ai-input-bar {
            padding: 10px;
          }

          .ai-input {
            font-size: 12.5px;
            padding: 9px 12px;
          }

          .ai-send-btn {
            width: 38px;
            height: 38px;
          }

          .ai-agent-btn {
            width: 58px;
            height: 58px;
            min-width: 58px;
            min-height: 58px;
            max-width: 58px;
            max-height: 58px;
            right: calc(env(safe-area-inset-right) + 14px);
            bottom: calc(env(safe-area-inset-bottom) + 104px);
          }

          .ai-avatar {
            width: 52px;
            height: 52px;
            min-width: 52px;
            min-height: 52px;
            max-width: 52px;
            max-height: 52px;
          }

          .ai-ring-1 {
            width: 70px;
            height: 70px;
          }

          .ai-ring-2 {
            width: 86px;
            height: 86px;
          }

          .ai-ring-3 {
            width: 102px;
            height: 102px;
          }
        }
      `}</style>
    </>
  );
};
























// // src/components/AIAgent.tsx
// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { X, Send, GripHorizontal } from 'lucide-react';

// const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// interface Message {
//   role: 'user' | 'assistant';
//   content: string;
// }

// const SUGGESTIONS = [
//   'Quelles sont tes compétences ?',
//   'Parle-moi de tes projets',
//   'Comment te contacter ?',
//   'Quelle est ta formation ?',
// ];

// export const AIAgent: React.FC = () => {
//   const [open,     setOpen]     = useState(false);
//   const [messages, setMessages] = useState<Message[]>([
//     { role: 'assistant', content: "👋 Salut ! Je suis le clone IA d'Adjoumani. Pose-moi n'importe quelle question sur son parcours, ses projets ou ses compétences !" }
//   ]);
//   const [input,    setInput]    = useState('');
//   const [loading,  setLoading]  = useState(false);
//   const [pos,      setPos]      = useState({ x: 0, y: 0 });
//   const [dragging, setDragging] = useState(false);
//   const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
//   const messagesEnd = useRef<HTMLDivElement>(null);
//   const inputRef    = useRef<HTMLInputElement>(null);

//   // Auto-scroll
//   useEffect(() => {
//     messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages]);

//   // Focus input à l'ouverture
//   useEffect(() => {
//     if (open) setTimeout(() => inputRef.current?.focus(), 300);
//   }, [open]);

//   // ── Drag ──────────────────────────────────────────────────
//   const onDragStart = useCallback((e: React.MouseEvent) => {
//     setDragging(true);
//     dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
//   }, [pos]);

//   useEffect(() => {
//     if (!dragging) return;
//     const onMove = (e: MouseEvent) => {
//       setPos({
//         x: dragStart.current.px + (e.clientX - dragStart.current.mx),
//         y: dragStart.current.py + (e.clientY - dragStart.current.my),
//       });
//     };
//     const onUp = () => setDragging(false);
//     window.addEventListener('mousemove', onMove);
//     window.addEventListener('mouseup', onUp);
//     return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
//   }, [dragging]);

//   // ── Send message ──────────────────────────────────────────
//   const sendMessage = async (text?: string) => {
//     const msg = (text || input).trim();
//     if (!msg || loading) return;
//     setInput('');

//     const userMsg: Message = { role: 'user', content: msg };
//     const newHistory = [...messages, userMsg];
//     setMessages(newHistory);
//     setLoading(true);

//     try {
//       const res = await fetch(`${API_URL}/agent/chat`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           message: msg,
//           history: messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0),
//         }),
//       });
//       const data = await res.json();
//       setMessages(prev => [...prev, {
//         role: 'assistant',
//         content: data.reply || data.error || 'Désolé, une erreur est survenue.',
//       }]);
//     } catch {
//       setMessages(prev => [...prev, {
//         role: 'assistant',
//         content: '❌ Connexion impossible. Réessaie dans un instant.',
//       }]);
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <>
//       {/* ══ Icône flottante ══════════════════════════════════ */}
//       <AnimatePresence>
//         {!open && (
//           <motion.button
//             onClick={() => setOpen(true)}
//             initial={{ scale: 0, opacity: 0 }}
//             animate={{ scale: 1, opacity: 1 }}
//             exit={{ scale: 0, opacity: 0 }}
//             whileHover={{ scale: 1.1 }}
//             whileTap={{ scale: 0.95 }}
//             style={{ position: 'fixed', bottom: 100, right: 28, zIndex: 1000 }}
//             className="ai-agent-btn"
//           >
//             {/* Anneaux d'onde */}
//             <span className="ai-ring ai-ring-1" />
//             <span className="ai-ring ai-ring-2" />
//             <span className="ai-ring ai-ring-3" />
//             {/* Avatar */}
//             <span className="ai-avatar">
//               <span style={{ fontSize: 26 }}>🤖</span>
//             </span>
//             {/* Badge online */}
//             <span className="ai-online-dot" />
//           </motion.button>
//         )}
//       </AnimatePresence>

//       {/* ══ Chat popup ═══════════════════════════════════════ */}
//       <AnimatePresence>
//         {open && (
//           <motion.div
//             initial={{ opacity: 0, scale: 0.8, y: 40 }}
//             animate={{ opacity: 1, scale: 1, y: 0 }}
//             exit={{ opacity: 0, scale: 0.8, y: 40 }}
//             transition={{ type: 'spring', stiffness: 300, damping: 28 }}
//             style={{
//               position: 'fixed',
//               bottom: `${100 - pos.y}px`,
//               right:  `${28  - pos.x}px`,
//               zIndex: 1001,
//               cursor: dragging ? 'grabbing' : 'default',
//             }}
//             className="ai-chat-popup"
//           >
//             {/* Header draggable */}
//             <div className="ai-chat-header" onMouseDown={onDragStart}>
//               <GripHorizontal size={14} style={{ opacity: 0.4 }} />
//               <div className="ai-chat-header-info">
//                 <div className="ai-chat-avatar">🤖</div>
//                 <div>
//                   <div className="ai-chat-name">Adjoumani AI</div>
//                   <div className="ai-chat-status">
//                     <span className="ai-status-dot" />
//                     En ligne · Clone IA
//                   </div>
//                 </div>
//               </div>
//               <button onClick={() => { setOpen(false); setPos({ x: 0, y: 0 }); }} className="ai-close-btn">
//                 <X size={16} />
//               </button>
//             </div>

//             {/* Messages */}
//             <div className="ai-messages">
//               {messages.map((msg, i) => (
//                 <motion.div
//                   key={i}
//                   initial={{ opacity: 0, y: 10 }}
//                   animate={{ opacity: 1, y: 0 }}
//                   transition={{ delay: 0.05 }}
//                   className={`ai-msg ai-msg-${msg.role}`}
//                 >
//                   {msg.role === 'assistant' && (
//                     <span className="ai-msg-icon">🤖</span>
//                   )}
//                   <div className="ai-msg-bubble">{msg.content}</div>
//                 </motion.div>
//               ))}
//               {loading && (
//                 <motion.div
//                   initial={{ opacity: 0 }}
//                   animate={{ opacity: 1 }}
//                   className="ai-msg ai-msg-assistant"
//                 >
//                   <span className="ai-msg-icon">🤖</span>
//                   <div className="ai-msg-bubble ai-typing">
//                     <span /><span /><span />
//                   </div>
//                 </motion.div>
//               )}
//               <div ref={messagesEnd} />
//             </div>

//             {/* Suggestions */}
//             {messages.length === 1 && (
//               <div className="ai-suggestions">
//                 {SUGGESTIONS.map((s, i) => (
//                   <button key={i} onClick={() => sendMessage(s)} className="ai-suggestion-chip">
//                     {s}
//                   </button>
//                 ))}
//               </div>
//             )}

//             {/* Input */}
//             <div className="ai-input-bar">
//               <input
//                 ref={inputRef}
//                 value={input}
//                 onChange={e => setInput(e.target.value)}
//                 onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
//                 placeholder="Pose ta question..."
//                 className="ai-input"
//                 disabled={loading}
//               />
//               <button
//                 onClick={() => sendMessage()}
//                 disabled={!input.trim() || loading}
//                 className="ai-send-btn"
//               >
//                 <Send size={16} />
//               </button>
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>

//       <style>{`
//         /* ── Icône ─────────────────────────────────── */
//         .ai-agent-btn {
//           position: relative;
//           width: 62px; height: 62px;
//           border-radius: 50%;
//           border: none;
//           background: linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899);
//           box-shadow: 0 0 30px rgba(99,102,241,0.6), 0 8px 32px rgba(0,0,0,0.4);
//           cursor: pointer;
//           display: flex; align-items: center; justify-content: center;
//         }
//         .ai-ring {
//           position: absolute; border-radius: 50%;
//           border: 2px solid rgba(99,102,241,0.4);
//           animation: ai-pulse 2.4s ease-out infinite;
//         }
//         .ai-ring-1 { width: 80px;  height: 80px;  animation-delay: 0s;    }
//         .ai-ring-2 { width: 100px; height: 100px; animation-delay: 0.6s;  }
//         .ai-ring-3 { width: 120px; height: 120px; animation-delay: 1.2s;  }
//         @keyframes ai-pulse {
//           0%   { transform: scale(0.85); opacity: 0.8; }
//           100% { transform: scale(1.3);  opacity: 0;   }
//         }
//         .ai-avatar { position: relative; z-index: 2; }
//         .ai-online-dot {
//           position: absolute; bottom: 4px; right: 4px;
//           width: 12px; height: 12px; border-radius: 50%;
//           background: #22c55e;
//           border: 2px solid #0f0f23;
//           animation: ai-blink 2s ease-in-out infinite;
//           z-index: 3;
//         }
//         @keyframes ai-blink { 0%,100%{opacity:1} 50%{opacity:0.4} }

//         /* ── Popup ─────────────────────────────────── */
//         .ai-chat-popup {
//           width: 360px;
//           border-radius: 20px;
//           overflow: hidden;
//           background: rgba(10,10,30,0.95);
//           border: 1px solid rgba(99,102,241,0.3);
//           box-shadow:
//             0 0 0 1px rgba(99,102,241,0.1),
//             0 24px 80px rgba(0,0,0,0.7),
//             0 0 60px rgba(99,102,241,0.15);
//           backdrop-filter: blur(24px);
//           display: flex; flex-direction: column;
//           max-height: 540px;
//         }
//         .ai-chat-header {
//           display: flex; align-items: center; gap: 10px;
//           padding: 14px 16px;
//           background: linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.1));
//           border-bottom: 1px solid rgba(99,102,241,0.2);
//           cursor: grab; user-select: none;
//         }
//         .ai-chat-header:active { cursor: grabbing; }
//         .ai-chat-header-info { display:flex; align-items:center; gap:10px; flex:1; }
//         .ai-chat-avatar {
//           width:36px; height:36px; border-radius:50%;
//           background: linear-gradient(135deg,#6366f1,#ec4899);
//           display:flex; align-items:center; justify-content:center;
//           font-size:18px; flex-shrink:0;
//         }
//         .ai-chat-name   { color:#fff; font-weight:700; font-size:14px; }
//         .ai-chat-status { color:#94a3b8; font-size:11px; display:flex; align-items:center; gap:5px; margin-top:2px; }
//         .ai-status-dot  { width:7px; height:7px; border-radius:50%; background:#22c55e; animation:ai-blink 2s infinite; }
//         .ai-close-btn   { background:none; border:none; color:#94a3b8; cursor:pointer; padding:4px; border-radius:8px; transition:.2s; }
//         .ai-close-btn:hover { color:#fff; background:rgba(255,255,255,0.1); }

//         .ai-messages {
//           flex:1; overflow-y:auto; padding:14px 12px;
//           display:flex; flex-direction:column; gap:10px;
//           scrollbar-width:thin; scrollbar-color:rgba(99,102,241,0.3) transparent;
//         }
//         .ai-msg { display:flex; align-items:flex-end; gap:8px; }
//         .ai-msg-user { flex-direction:row-reverse; }
//         .ai-msg-icon { font-size:18px; flex-shrink:0; margin-bottom:2px; }
//         .ai-msg-bubble {
//           max-width:82%; padding:10px 14px;
//           border-radius:18px; font-size:13px; line-height:1.5; color:#e2e8f0;
//           word-break:break-word;
//         }
//         .ai-msg-assistant .ai-msg-bubble {
//           background:rgba(99,102,241,0.15);
//           border:1px solid rgba(99,102,241,0.25);
//           border-bottom-left-radius:4px;
//         }
//         .ai-msg-user .ai-msg-bubble {
//           background:linear-gradient(135deg,#6366f1,#8b5cf6);
//           color:#fff; border-bottom-right-radius:4px;
//         }
//         .ai-typing { display:flex; gap:5px; align-items:center; padding:14px 18px !important; }
//         .ai-typing span {
//           width:7px; height:7px; border-radius:50%; background:#6366f1;
//           animation:ai-dot 1.2s ease-in-out infinite;
//         }
//         .ai-typing span:nth-child(2){animation-delay:.2s}
//         .ai-typing span:nth-child(3){animation-delay:.4s}
//         @keyframes ai-dot { 0%,80%,100%{transform:scale(0.7);opacity:.4} 40%{transform:scale(1);opacity:1} }

//         .ai-suggestions {
//           padding:0 12px 10px; display:flex; flex-wrap:wrap; gap:6px;
//         }
//         .ai-suggestion-chip {
//           background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.3);
//           color:#a5b4fc; border-radius:20px; padding:5px 12px;
//           font-size:11px; cursor:pointer; transition:.2s; white-space:nowrap;
//         }
//         .ai-suggestion-chip:hover { background:rgba(99,102,241,0.25); color:#fff; }

//         .ai-input-bar {
//           display:flex; gap:8px; padding:12px 14px;
//           border-top:1px solid rgba(99,102,241,0.2);
//           background:rgba(0,0,0,0.3);
//         }
//         .ai-input {
//           flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(99,102,241,0.25);
//           border-radius:12px; padding:10px 14px; color:#e2e8f0; font-size:13px; outline:none;
//           transition:.2s;
//         }
//         .ai-input:focus { border-color:#6366f1; background:rgba(99,102,241,0.1); }
//         .ai-input::placeholder { color:#475569; }
//         .ai-send-btn {
//           width:40px; height:40px; border-radius:12px; border:none;
//           background:linear-gradient(135deg,#6366f1,#8b5cf6);
//           color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;
//           transition:.2s; flex-shrink:0;
//         }
//         .ai-send-btn:hover:not(:disabled) { transform:scale(1.05); box-shadow:0 0 20px rgba(99,102,241,0.5); }
//         .ai-send-btn:disabled { opacity:.4; cursor:not-allowed; }

//         /* ── Responsive ────────────────────────────── */
//         @media (max-width: 480px) {
//           .ai-chat-popup { width: calc(100vw - 24px); right: 12px !important; bottom: 90px !important; }
//           .ai-agent-btn  { width:54px; height:54px; bottom:88px !important; right:16px !important; }
//         }
//       `}</style>
//     </>
//   );
// };