
type Props = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <p style={{ margin: "0 0 16px 0", fontSize: "14px", lineHeight: 1.5 }}>
            {message}
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button className="secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              className={destructive ? "danger-btn" : ""}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
