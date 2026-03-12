interface GhostBlockProps {
  label: string;
  confidenceScore: number;
  onAccept: () => void;
  onDismiss: () => void;
}

export default function GhostBlock({ label, confidenceScore, onAccept, onDismiss }: GhostBlockProps) {
  return (
    <div className="ghost-block" onClick={onAccept}>
      <div className="ghost-content">
        <span className="ghost-label">{label}</span>
        <span className="ghost-confidence">{confidenceScore}%</span>
      </div>
      <button
        className="ghost-dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        title="Dismiss suggestion"
      >
        ×
      </button>

      <style>{`
        .ghost-block {
          position: relative;
          padding: 8px 10px;
          border: 2px dashed #b8b8b8;
          border-radius: 4px;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
          cursor: pointer;
          opacity: 0.6;
          transition: all 0.2s;
          animation: ghostPulse 2s ease-in-out infinite;
        }

        .ghost-block:hover {
          opacity: 1;
          border-color: #667eea;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
          transform: scale(1.02);
        }

        .ghost-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding-right: 20px;
        }

        .ghost-label {
          font-weight: 500;
          color: #667eea;
          flex: 1;
        }

        .ghost-confidence {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          background: #667eea;
          color: white;
          border-radius: 10px;
        }

        .ghost-dismiss {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 18px;
          height: 18px;
          border: none;
          background: rgba(220, 53, 69, 0.9);
          color: white;
          border-radius: 50%;
          font-size: 14px;
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .ghost-block:hover .ghost-dismiss {
          display: flex;
        }

        .ghost-dismiss:hover {
          background: #dc3545;
        }

        @keyframes ghostPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.3);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(102, 126, 234, 0);
          }
        }
      `}</style>
    </div>
  );
}
