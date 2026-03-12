interface PriorityBadgeProps {
  rank: 1 | 2 | 3;
}

export default function PriorityBadge({ rank }: PriorityBadgeProps) {
  const badges = {
    1: {
      bg: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
      symbol: '★',
      label: 'Priority 1'
    },
    2: {
      bg: 'linear-gradient(135deg, #E8E8E8 0%, #B8B8B8 100%)',
      symbol: '★',
      label: 'Priority 2'
    },
    3: {
      bg: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)',
      symbol: '★',
      label: 'Priority 3'
    }
  };

  const badge = badges[rank];

  return (
    <div
      className="priority-badge-corner"
      style={{ background: badge.bg }}
      title={badge.label}
    >
      {badge.symbol}

      <style>{`
        .priority-badge-corner {
          position: absolute;
          top: 0;
          left: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${rank === 2 ? '#333' : '#fff'};
          font-size: 14px;
          font-weight: 700;
          border-radius: 0 0 8px 0;
          box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
          z-index: 5;
        }
      `}</style>
    </div>
  );
}
