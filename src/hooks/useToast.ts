// hooks/useToast.ts
import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  icon?: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((
    message: string,
    type: Toast['type'] = 'info',
    icon?: string
  ) => {
    const id = Math.random().toString(36).slice(2);
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    setToasts(prev => [...prev, { id, message, type, icon: icon || icons[type] }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
