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
          padding: 4px 6px;
          border: 2px dashed #b8b8b8;
          border-radius: 4px;
          background: rgba(102, 126, 234, 0.05);
          cursor: pointer;
          opacity: 0.6;
          transition: all 0.2s;
          animation: ghostPulse 2s ease-in-out infinite;
          overflow: hidden;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
        }

        .ghost-block:hover {
          opacity: 1;
          border-color: #4b6fff;
          background: rgba(75, 111, 255, 0.1);
        }

        .ghost-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 4px;
          padding-right: 16px;
          min-width: 0;
        }

        .ghost-label {
          font-weight: 500;
          color: #4b6fff;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          font-size: 11px;
        }

        .ghost-confidence {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 4px;
          background: #4b6fff;
          color: white;
          border-radius: 10px;
          flex-shrink: 0;
        }

        /* In condensed past columns, show only the dashed border strip */
        td.col-past .ghost-block {
          padding: 2px 2px;
          border-width: 1px;
          height: 8px;
          opacity: 0.4;
          animation: none;
          overflow: hidden;
        }

        td.col-past .ghost-content,
        td.col-past .ghost-dismiss {
          display: none;
        }

        /* On hover inside a past column, expand to full display */
        td.col-past .ghost-block:hover {
          position: absolute;
          z-index: 200;
          width: max-content;
          min-width: 120px;
          max-width: 200px;
          height: auto;
          padding: 4px 6px;
          border-width: 2px;
          opacity: 1;
          overflow: visible;
          animation: ghostPulse 2s ease-in-out infinite;
        }

        td.col-past .ghost-block:hover .ghost-content {
          display: flex;
        }

        td.col-past .ghost-block:hover .ghost-dismiss {
          display: flex;
        }

        .ghost-dismiss {
          position: absolute;
          top: 3px;
          right: 3px;
          width: 16px;
          height: 16px;
          border: none;
          background: rgba(220, 53, 69, 0.9);
          color: white;
          border-radius: 50%;
          font-size: 13px;
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
            box-shadow: 0 0 0 0 rgba(75, 111, 255, 0.3);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(75, 111, 255, 0);
          }
        }
      `}</style>
    </div>
  );
}
