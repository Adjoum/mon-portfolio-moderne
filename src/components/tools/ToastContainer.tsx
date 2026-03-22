// components/tools/ToastContainer.tsx
import React from 'react';
import type { Toast } from '../../hooks/useToast';

interface Props { toasts: Toast[]; onRemove: (id: string) => void; }

const TYPE_COLORS: Record<Toast['type'], string> = {
  success: 'rgba(72,187,120,.3)',
  error:   'rgba(252,129,129,.3)',
  info:    'rgba(99,179,237,.3)',
  warning: 'rgba(236,201,75,.3)',
};

export const ToastContainer: React.FC<Props> = ({ toasts, onRemove }) => (
  <div className="tools-toast-wrap">
    {toasts.map(t => (
      <div
        key={t.id}
        className="tools-toast"
        style={{ borderColor: TYPE_COLORS[t.type] }}
        onClick={() => onRemove(t.id)}
      >
        <span>{t.icon}</span>
        <span>{t.message}</span>
      </div>
    ))}
  </div>
);
