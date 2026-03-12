interface StandingBlockBadgeProps {
  onRemove?: () => void;
}

export default function StandingBlockBadge({ onRemove }: StandingBlockBadgeProps) {
  return (
    <div className="standing-block-badge" title="This block repeats weekly">
      <span className="standing-icon">⟲</span>
      {onRemove && (
        <button
          className="remove-standing"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Stop recurring"
        >
          ×
        </button>
      )}

      <style>{`
        .standing-block-badge {
          position: absolute;
          top: 4px;
          right: 4px;
          display: flex;
          align-items: center;
          gap: 2px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border-radius: 10px;
          padding: 2px 6px;
          font-size: 12px;
          font-weight: 700;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          z-index: 10;
        }

        .standing-icon {
          line-height: 1;
        }

        .remove-standing {
          width: 14px;
          height: 14px;
          border: none;
          background: rgba(220, 53, 69, 0.9);
          color: white;
          border-radius: 50%;
          font-size: 12px;
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          line-height: 1;
          margin-left: 2px;
        }

        .standing-block-badge:hover .remove-standing {
          display: flex;
        }

        .remove-standing:hover {
          background: #dc3545;
        }
      `}</style>
    </div>
  );
}
