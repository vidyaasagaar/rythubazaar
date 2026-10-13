import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cx } from '../lib/format';

interface Toast {
  id: number;
  tone: 'success' | 'error';
  text: string;
}

const ToastContext = createContext<(tone: Toast['tone'], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-md animate-fadeIn items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-card',
              t.tone === 'success'
                ? 'border-forest-200 bg-forest-50 text-forest-900'
                : 'border-chili-100 bg-chili-50 text-chili-700',
            )}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{t.text}</span>
            <button
              className="-m-1 rounded p-1 opacity-70 hover:opacity-100"
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
