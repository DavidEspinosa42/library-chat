import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { PrimaryButton } from "./button.js";

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  showToast: (text: string, action?: Toast["action"]) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((text: string, action?: Toast["action"]) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, text, ...(action ? { action } : {}) }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-ink shadow-lg"
          >
            <span>{toast.text}</span>
            {toast.action && (
              <PrimaryButton
                onClick={() => {
                  toast.action?.onClick();
                  setToasts((t) => t.filter((x) => x.id !== toast.id));
                }}
                className="px-3 py-1"
              >
                {toast.action.label}
              </PrimaryButton>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
