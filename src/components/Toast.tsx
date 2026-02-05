import { useState, useEffect, useCallback, useRef } from "react";

export type ToastType = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  action?: { label: string; onClick: () => void };
};

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

const TOAST_DURATION = 4000;
const UNDO_TOAST_DURATION = 6000;

function ToastEntry({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    const duration = toast.action ? UNDO_TOAST_DURATION : TOAST_DURATION;
    timerRef.current = setTimeout(dismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, [dismiss, toast.action]);

  const bgColor =
    toast.type === "success" ? "#0d7a3a" : toast.type === "error" ? "#c53030" : "#2d5f9a";

  return (
    <div
      className={`toast-item ${exiting ? "toast-exit" : "toast-enter"}`}
      style={{ background: bgColor }}
    >
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action!.onClick();
            dismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={dismiss}>
        x
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastEntry key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

let toastCounter = 0;
export function createToastId(): string {
  return `toast-${++toastCounter}-${Date.now()}`;
}
