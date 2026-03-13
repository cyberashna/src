import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface Block {
  id: string;
  label: string;
  completed: boolean;
  day_index: number | null;
  time_index: number | null;
}

interface Priority {
  id?: string;
  block_id: string | null;
  priority_rank: number;
  completed: boolean;
  block?: Block;
}

interface PriorityPickerPanelProps {
  userId: string;
  blocks: Block[];
  dragBlockId: string | null;
  onPriorityChange: () => void;
}

export default function PriorityPickerPanel({ userId, blocks, dragBlockId, onPriorityChange }: PriorityPickerPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [priorities, setPriorities] = useState<Priority[]>([
    { block_id: null, priority_rank: 1, completed: false },
    { block_id: null, priority_rank: 2, completed: false },
    { block_id: null, priority_rank: 3, completed: false }
  ]);
  const [showCelebration, setShowCelebration] = useState(false);

  // Calculate once and memoize to prevent infinite re-renders
  const todayString = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const today = useMemo(() => new Date(), []);
  const todayDayOfWeek = useMemo(() => today.toLocaleDateString('en-US', { weekday: 'long' }), [today]);
  const todayDate = useMemo(() => today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), [today]);

  const loadPriorities = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('daily_priorities')
        .select('*, blocks(*)')
        .eq('user_id', userId)
        .eq('date', todayString)
        .order('priority_rank');

      if (error) {
        console.error('Error loading priorities:', error);
        return;
      }

      if (data && data.length > 0) {
        const loadedPriorities = [1, 2, 3].map(rank => {
          const existing = data.find(p => p.priority_rank === rank);
          return existing ? {
            id: existing.id,
            block_id: existing.block_id,
            priority_rank: rank,
            completed: existing.completed,
            block: existing.blocks
          } : {
            block_id: null,
            priority_rank: rank,
            completed: false
          };
        });
        setPriorities(loadedPriorities);
      }
    } catch (err) {
      console.error('Exception loading priorities:', err);
    }
  }, [userId, todayString]);

  useEffect(() => {
    loadPriorities();
  }, [loadPriorities]);

  useEffect(() => {
    const allCompleted = priorities.every(p => p.block_id && p.completed);
    if (allCompleted && priorities.some(p => p.block_id)) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }
  }, [priorities]);

  async function setPriority(rank: number, blockId: string) {
    try {
      const existingPriority = priorities.find(p => p.priority_rank === rank);

      if (existingPriority?.id) {
        const { error } = await supabase
          .from('daily_priorities')
          .update({ block_id: blockId })
          .eq('id', existingPriority.id);

        if (error) {
          console.error('Error updating priority:', error);
          return;
        }
      } else {
        const { error } = await supabase
          .from('daily_priorities')
          .insert({
            user_id: userId,
            block_id: blockId,
            date: todayString,
            priority_rank: rank,
            completed: false
          });

        if (error) {
          console.error('Error inserting priority:', error);
          return;
        }
      }

      await loadPriorities();
      onPriorityChange();
    } catch (err) {
      console.error('Exception setting priority:', err);
    }
  }

  async function removePriority(rank: number) {
    try {
      const priority = priorities.find(p => p.priority_rank === rank);
      if (priority?.id) {
        const { error } = await supabase
          .from('daily_priorities')
          .delete()
          .eq('id', priority.id);

        if (error) {
          console.error('Error removing priority:', error);
          return;
        }
      }

      await loadPriorities();
      onPriorityChange();
    } catch (err) {
      console.error('Exception removing priority:', err);
    }
  }

  async function togglePriorityComplete(rank: number) {
    try {
      const priority = priorities.find(p => p.priority_rank === rank);
      if (priority?.id) {
        const { error } = await supabase
          .from('daily_priorities')
          .update({ completed: !priority.completed })
          .eq('id', priority.id);

        if (error) {
          console.error('Error toggling priority:', error);
          return;
        }

        await loadPriorities();
        onPriorityChange();
      }
    } catch (err) {
      console.error('Exception toggling priority:', err);
    }
  }

  const [dragOverRank, setDragOverRank] = useState<number | null>(null);

  const scheduledBlocks = blocks.filter(b => b.day_index !== null && b.time_index !== null);
  const availableBlocks = scheduledBlocks.filter(
    b => !priorities.some(p => p.block_id === b.id)
  );

  function handleSlotDragOver(e: React.DragEvent, rank: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRank(rank);
  }

  function handleSlotDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOverRank(null);
  }

  function handleSlotDrop(e: React.DragEvent, rank: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRank(null);
    const blockId = e.dataTransfer.getData('text/plain') || dragBlockId;
    if (blockId) {
      setPriority(rank, blockId);
    }
  }

  const priorityColors = [
    { name: 'Gold', bg: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', text: '#000' },
    { name: 'Silver', bg: 'linear-gradient(135deg, #E8E8E8 0%, #B8B8B8 100%)', text: '#000' },
    { name: 'Bronze', bg: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)', text: '#fff' }
  ];

  return (
    <div className="priority-picker-panel">
      <div
        className="priority-header"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="priority-date">
          <div className="day-of-week">{todayDayOfWeek}</div>
          <div className="date">{todayDate}</div>
        </div>
        <div className="priority-title">
          {priorities.filter(p => p.block_id).length === 0 ? (
            <span>Set Today's Priorities</span>
          ) : (
            <span>{priorities.filter(p => p.completed).length}/{priorities.filter(p => p.block_id).length} Complete</span>
          )}
        </div>
        <div className={`expand-icon ${isOpen ? 'open' : ''}`}>▼</div>
      </div>

      {showCelebration && (
        <div className="celebration-overlay">
          <div className="celebration-content">
            <div className="celebration-icon">🎉</div>
            <div className="celebration-text">All priorities complete!</div>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="priority-slots">
          {priorities.map((priority, index) => {
            const color = priorityColors[index];

            return (
              <div key={priority.priority_rank} className="priority-slot">
                <div
                  className="priority-badge"
                  style={{ background: color.bg, color: color.text }}
                >
                  {priority.priority_rank}
                </div>

                {priority.block_id && priority.block ? (
                  <div className="priority-block-assigned">
                    <div
                      className="priority-checkbox"
                      onClick={() => togglePriorityComplete(priority.priority_rank)}
                    >
                      {priority.completed && <span className="checkmark">✓</span>}
                    </div>
                    <div className={`priority-block-label ${priority.completed ? 'completed' : ''}`}>
                      {priority.block.label}
                    </div>
                    <button
                      className="remove-priority"
                      onClick={() => removePriority(priority.priority_rank)}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    className={`priority-empty ${dragOverRank === priority.priority_rank ? 'drag-over' : ''} ${dragBlockId ? 'drop-ready' : ''}`}
                    onDragOver={(e) => handleSlotDragOver(e, priority.priority_rank)}
                    onDragLeave={handleSlotDragLeave}
                    onDrop={(e) => handleSlotDrop(e, priority.priority_rank)}
                  >
                    {dragBlockId ? (
                      <div className="priority-drop-hint">
                        Drop block here
                      </div>
                    ) : (
                      <select
                        className="priority-selector"
                        value=""
                        onChange={(e) => setPriority(priority.priority_rank, e.target.value)}
                      >
                        <option value="">Choose a block...</option>
                        {availableBlocks.map(block => (
                          <option key={block.id} value={block.id}>
                            {block.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .priority-picker-panel {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          flex-shrink: 0;
        }

        .priority-header {
          padding: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: background 0.2s;
        }

        .priority-header:hover {
          background: #f8f9fa;
        }

        .priority-date {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 12px;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          border-radius: 6px;
          min-width: 70px;
        }

        .day-of-week {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .date {
          font-size: 18px;
          font-weight: 700;
          margin-top: 2px;
        }

        .priority-title {
          flex: 1;
          font-weight: 600;
          color: #333;
        }

        .expand-icon {
          transition: transform 0.3s;
          color: #999;
        }

        .expand-icon.open {
          transform: rotate(180deg);
        }

        .priority-slots {
          padding: 16px;
          border-top: 1px solid #e9ecef;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .priority-slot {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .priority-badge {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        }

        .priority-block-assigned {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: #f8f9fa;
          border-radius: 6px;
          border: 2px solid #e9ecef;
        }

        .priority-checkbox {
          width: 20px;
          height: 20px;
          border: 2px solid #dee2e6;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          background: white;
          transition: all 0.2s;
        }

        .priority-checkbox:hover {
          border-color: #2563eb;
        }

        .priority-checkbox .checkmark {
          color: #2563eb;
          font-weight: bold;
          font-size: 14px;
        }

        .priority-block-label {
          flex: 1;
          font-weight: 500;
          color: #333;
        }

        .priority-block-label.completed {
          text-decoration: line-through;
          color: #999;
        }

        .remove-priority {
          width: 24px;
          height: 24px;
          border: none;
          background: #dc3545;
          color: white;
          border-radius: 50%;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .remove-priority:hover {
          background: #c82333;
        }

        .priority-empty {
          flex: 1;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .priority-empty.drop-ready {
          border: 2px dashed #93c5fd;
          background: #eff6ff;
          padding: 0;
        }

        .priority-empty.drag-over {
          border-color: #2563eb;
          background: #dbeafe;
          transform: scale(1.02);
        }

        .priority-drop-hint {
          padding: 10px 14px;
          text-align: center;
          font-size: 13px;
          font-weight: 500;
          color: #2563eb;
        }

        .priority-selector {
          width: 100%;
          padding: 10px 14px;
          border: 2px dashed #dee2e6;
          border-radius: 6px;
          background: white;
          font-size: 14px;
          color: #666;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .priority-selector:hover {
          border-color: #667eea;
        }

        .priority-selector:focus {
          outline: none;
          border-color: #667eea;
          border-style: solid;
        }

        .celebration-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.3);
          z-index: 10000;
          animation: fadeIn 0.3s;
        }

        .celebration-content {
          background: white;
          padding: 40px 60px;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          text-align: center;
          animation: scaleIn 0.3s;
        }

        .celebration-icon {
          font-size: 64px;
          margin-bottom: 16px;
          animation: bounce 0.6s;
        }

        .celebration-text {
          font-size: 24px;
          font-weight: 700;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
}
