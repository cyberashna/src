import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { currentDragBlockId } from '../App';

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
  dragHabitId: string | null;
  onPriorityChange: () => void;
  onHabitDrop: (habitId: string) => Promise<string | null>;
  onDeleteBlock: (blockId: string) => void;
  onCreateBlock: (label: string) => Promise<string | null>;
}

export default function PriorityPickerPanel({ userId, blocks, dragBlockId, dragHabitId, onPriorityChange, onHabitDrop, onDeleteBlock, onCreateBlock }: PriorityPickerPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [priorities, setPriorities] = useState<Priority[]>([
    { block_id: null, priority_rank: 1, completed: false },
    { block_id: null, priority_rank: 2, completed: false },
    { block_id: null, priority_rank: 3, completed: false }
  ]);
  const [showCelebration, setShowCelebration] = useState(false);

  // Per-slot search state
  const [searchText, setSearchText] = useState<Record<number, string>>({ 1: '', 2: '', 3: '' });
  const [openDropdownRank, setOpenDropdownRank] = useState<number | null>(null);
  const searchRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const dropdownRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const todayString = useMemo(() => new Date().toISOString().split('T')[0], []);
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

      if (error) { console.error('Error loading priorities:', error); return; }

      if (data && data.length > 0) {
        const orphanIds: string[] = [];
        const loadedPriorities = [1, 2, 3].map(rank => {
          const existing = data.find(p => p.priority_rank === rank);
          if (existing && !existing.blocks) {
            orphanIds.push(existing.id);
            return { block_id: null, priority_rank: rank, completed: false };
          }
          return existing ? {
            id: existing.id,
            block_id: existing.block_id,
            priority_rank: rank,
            completed: existing.completed,
            block: existing.blocks
          } : { block_id: null, priority_rank: rank, completed: false };
        });
        if (orphanIds.length > 0) {
          await supabase.from('daily_priorities').delete().in('id', orphanIds);
        }
        setPriorities(loadedPriorities);
      } else {
        setPriorities([
          { block_id: null, priority_rank: 1, completed: false },
          { block_id: null, priority_rank: 2, completed: false },
          { block_id: null, priority_rank: 3, completed: false }
        ]);
      }
    } catch (err) { console.error('Exception loading priorities:', err); }
  }, [userId, todayString]);

  useEffect(() => { loadPriorities(); }, [loadPriorities]);

  useEffect(() => {
    const allCompleted = priorities.every(p => p.block_id && p.completed);
    if (allCompleted && priorities.some(p => p.block_id)) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }
  }, [priorities]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      for (const rank of [1, 2, 3]) {
        const inputEl = searchRefs.current[rank];
        const dropEl = dropdownRefs.current[rank];
        if (
          openDropdownRank === rank &&
          inputEl && !inputEl.contains(target) &&
          (!dropEl || !dropEl.contains(target))
        ) {
          setOpenDropdownRank(null);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdownRank]);

  async function setPriority(rank: number, blockId: string) {
    try {
      const existingPriority = priorities.find(p => p.priority_rank === rank);
      if (existingPriority?.id) {
        const { error } = await supabase
          .from('daily_priorities')
          .update({ block_id: blockId })
          .eq('id', existingPriority.id);
        if (error) { console.error('Error updating priority:', error); return; }
      } else {
        const { error } = await supabase
          .from('daily_priorities')
          .insert({ user_id: userId, block_id: blockId, date: todayString, priority_rank: rank, completed: false });
        if (error) { console.error('Error inserting priority:', error); return; }
      }
      await loadPriorities();
      onPriorityChange();
    } catch (err) { console.error('Exception setting priority:', err); }
  }

  async function removePriority(rank: number) {
    try {
      const priority = priorities.find(p => p.priority_rank === rank);
      if (priority?.id) {
        const { error } = await supabase.from('daily_priorities').delete().eq('id', priority.id);
        if (error) { console.error('Error removing priority:', error); return; }
      }
      await loadPriorities();
      onPriorityChange();
    } catch (err) { console.error('Exception removing priority:', err); }
  }

  async function deleteBlockAndPriority(rank: number) {
    try {
      const priority = priorities.find(p => p.priority_rank === rank);
      if (!priority) return;
      if (priority.id) {
        await supabase.from('daily_priorities').delete().eq('id', priority.id);
      }
      if (priority.block_id) onDeleteBlock(priority.block_id);
      await loadPriorities();
      onPriorityChange();
    } catch (err) { console.error('Exception deleting block and priority:', err); }
  }

  async function togglePriorityComplete(rank: number) {
    try {
      const priority = priorities.find(p => p.priority_rank === rank);
      if (priority?.id) {
        const { error } = await supabase
          .from('daily_priorities')
          .update({ completed: !priority.completed })
          .eq('id', priority.id);
        if (error) { console.error('Error toggling priority:', error); return; }
        await loadPriorities();
        onPriorityChange();
      }
    } catch (err) { console.error('Exception toggling priority:', err); }
  }

  const [dragOverRank, setDragOverRank] = useState<number | null>(null);

  function getFilteredBlocks(rank: number): { block: Block; alreadyAssigned: boolean }[] {
    const text = (searchText[rank] ?? '').trim().toLowerCase();
    const assignedToOtherRank = (b: Block) => priorities.some(p => p.block_id === b.id && p.priority_rank !== rank);
    const assignedToThisRank = (b: Block) => priorities.some(p => p.block_id === b.id && p.priority_rank === rank);

    let filtered = blocks.filter(b => !assignedToThisRank(b));
    if (text) {
      filtered = filtered.filter(b => b.label.toLowerCase().includes(text));
    } else {
      filtered = filtered.filter(b => !assignedToOtherRank(b)).slice(0, 8);
    }

    return filtered.map(b => ({ block: b, alreadyAssigned: assignedToOtherRank(b) }));
  }

  function handleSlotDragOver(e: React.DragEvent, rank: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRank(rank);
  }

  function handleSlotDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverRank(null);
  }

  async function handleSlotDrop(e: React.DragEvent, rank: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRank(null);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const transferred = e.dataTransfer.getData('application/block-id') || e.dataTransfer.getData('text/plain');
    const habitId = e.dataTransfer.getData('application/habit-id');
    const blockId = currentDragBlockId || (UUID_RE.test(transferred ?? '') ? transferred : null) || dragBlockId;
    if (blockId) {
      setPriority(rank, blockId);
    } else if (habitId || dragHabitId) {
      const newBlockId = await onHabitDrop(habitId || dragHabitId!);
      if (newBlockId) setPriority(rank, newBlockId);
    }
  }

  async function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rank: number) {
    if (e.key === 'Escape') {
      setOpenDropdownRank(null);
      setSearchText(prev => ({ ...prev, [rank]: '' }));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = (searchText[rank] ?? '').trim();
      if (!text) return;
      const filtered = getFilteredBlocks(rank);
      const exactMatch = filtered.find(({ block: b }) => b.label.toLowerCase() === text.toLowerCase());
      if (exactMatch) {
        await handleSelectBlock(rank, exactMatch.block.id);
      } else {
        const newId = await onCreateBlock(text);
        if (newId) {
          await setPriority(rank, newId);
          setSearchText(prev => ({ ...prev, [rank]: '' }));
          setOpenDropdownRank(null);
        }
      }
    }
  }

  async function handleSelectBlock(rank: number, blockId: string) {
    setOpenDropdownRank(null);
    setSearchText(prev => ({ ...prev, [rank]: '' }));
    await setPriority(rank, blockId);
  }

  async function handleCreateFromDropdown(rank: number) {
    const text = (searchText[rank] ?? '').trim();
    if (!text) return;
    const newId = await onCreateBlock(text);
    if (newId) {
      await setPriority(rank, newId);
      setSearchText(prev => ({ ...prev, [rank]: '' }));
      setOpenDropdownRank(null);
    }
  }

  const priorityColors = [
    { name: 'Gold', bg: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', text: '#000' },
    { name: 'Silver', bg: 'linear-gradient(135deg, #E8E8E8 0%, #B8B8B8 100%)', text: '#000' },
    { name: 'Bronze', bg: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)', text: '#fff' }
  ];

  const isDragging = !!(dragBlockId || dragHabitId);

  return (
    <div className="priority-picker-panel">
      <div className="priority-header" onClick={() => setIsOpen(!isOpen)}>
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
            const rank = priority.priority_rank;
            const filteredResults = getFilteredBlocks(rank);
            const currentText = (searchText[rank] ?? '').trim();

            return (
              <div key={rank} className="priority-slot">
                <div className="priority-badge" style={{ background: color.bg, color: color.text }}>
                  {rank}
                </div>

                {priority.block_id && priority.block ? (
                  <div className="priority-block-assigned">
                    <div className="priority-checkbox" onClick={() => togglePriorityComplete(rank)}>
                      {priority.completed && <span className="checkmark">✓</span>}
                    </div>
                    <div className={`priority-block-label ${priority.completed ? 'completed' : ''}`}>
                      {priority.block.label}
                    </div>
                    <button className="remove-priority" onClick={() => removePriority(rank)} title="Unassign from priority">×</button>
                    <button className="delete-block-priority" onClick={() => deleteBlockAndPriority(rank)} title="Delete block entirely">🗑</button>
                  </div>
                ) : (
                  <div
                    className={`priority-empty ${dragOverRank === rank ? 'drag-over' : ''} ${isDragging ? 'drop-ready' : ''}`}
                    onDragOver={(e) => handleSlotDragOver(e, rank)}
                    onDragLeave={handleSlotDragLeave}
                    onDrop={(e) => handleSlotDrop(e, rank)}
                  >
                    {isDragging ? (
                      <div className="priority-drop-hint">
                        {dragHabitId ? 'Drop habit here' : 'Drop block here'}
                      </div>
                    ) : (
                      <div className="priority-search-wrapper">
                        <input
                          ref={el => { searchRefs.current[rank] = el; }}
                          className="priority-search-input"
                          type="text"
                          placeholder="Type to search or create..."
                          value={searchText[rank] ?? ''}
                          onChange={e => {
                            setSearchText(prev => ({ ...prev, [rank]: e.target.value }));
                            setOpenDropdownRank(rank);
                          }}
                          onFocus={() => setOpenDropdownRank(rank)}
                          onKeyDown={e => handleSearchKeyDown(e, rank)}
                          autoComplete="off"
                        />
                        {openDropdownRank === rank && (
                          <div
                            className="priority-search-dropdown"
                            ref={el => { dropdownRefs.current[rank] = el; }}
                          >
                            {filteredResults.length > 0 ? (
                              <>
                                {filteredResults.map(({ block, alreadyAssigned }) => (
                                  <div
                                    key={block.id}
                                    className={`priority-search-option${alreadyAssigned ? ' priority-search-option--assigned' : ''}`}
                                    onMouseDown={e => { e.preventDefault(); handleSelectBlock(rank, block.id); }}
                                  >
                                    <span className="priority-search-option-label">{block.label}</span>
                                    <span className="priority-search-option-badges">
                                      {alreadyAssigned && (
                                        <span className="priority-search-option-badge priority-search-option-badge--assigned">in use</span>
                                      )}
                                      {block.day_index !== null && (
                                        <span className="priority-search-option-badge">scheduled</span>
                                      )}
                                    </span>
                                  </div>
                                ))}
                                {currentText && !filteredResults.some(({ block: b }) => b.label.toLowerCase() === currentText.toLowerCase()) && (
                                  <div
                                    className="priority-search-option priority-search-option--create"
                                    onMouseDown={e => { e.preventDefault(); handleCreateFromDropdown(rank); }}
                                  >
                                    Create "{currentText}"
                                  </div>
                                )}
                              </>
                            ) : currentText ? (
                              <div
                                className="priority-search-option priority-search-option--create"
                                onMouseDown={e => { e.preventDefault(); handleCreateFromDropdown(rank); }}
                              >
                                Create "{currentText}"
                              </div>
                            ) : (
                              <div className="priority-search-empty">No blocks yet — type to create one</div>
                            )}
                          </div>
                        )}
                      </div>
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
          overflow: visible;
          flex-shrink: 0;
          position: relative;
        }

        .priority-header {
          padding: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: background 0.2s;
          border-radius: 8px 8px 0 0;
        }

        .priority-header:hover { background: #f8f9fa; }

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

        .expand-icon.open { transform: rotate(180deg); }

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
          gap: 10px;
          padding: 10px 14px;
          background: #f8f9fa;
          border-radius: 6px;
          border: 2px solid #e9ecef;
          min-width: 0;
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
          flex-shrink: 0;
        }

        .priority-checkbox:hover { border-color: #2563eb; }

        .priority-checkbox .checkmark {
          color: #2563eb;
          font-weight: bold;
          font-size: 14px;
        }

        .priority-block-label {
          flex: 1;
          font-weight: 500;
          color: #333;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
          flex-shrink: 0;
        }

        .remove-priority:hover { background: #c82333; }

        .delete-block-priority {
          width: 24px;
          height: 24px;
          border: none;
          background: #6c757d;
          color: white;
          border-radius: 50%;
          cursor: pointer;
          font-size: 12px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
          flex-shrink: 0;
        }

        .delete-block-priority:hover { background: #495057; }

        .priority-empty {
          flex: 1;
          border-radius: 6px;
          transition: all 0.2s;
          min-height: 44px;
          display: flex;
          align-items: stretch;
          position: relative;
        }

        .priority-empty.drop-ready {
          border: 2px dashed #93c5fd;
          background: #eff6ff;
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
          width: 100%;
          pointer-events: none;
        }

        .priority-search-wrapper {
          flex: 1;
          position: relative;
          width: 100%;
        }

        .priority-search-input {
          width: 100%;
          padding: 10px 14px;
          border: 2px dashed #dee2e6;
          border-radius: 6px;
          background: white;
          font-size: 14px;
          color: #333;
          transition: border-color 0.2s, border-style 0.2s;
          box-sizing: border-box;
        }

        .priority-search-input::placeholder { color: #adb5bd; }

        .priority-search-input:hover { border-color: #93c5fd; }

        .priority-search-input:focus {
          outline: none;
          border-color: #2563eb;
          border-style: solid;
        }

        .priority-search-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e9ecef;
          border-radius: 6px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
          z-index: 1000;
          overflow: hidden;
          max-height: 240px;
          overflow-y: auto;
        }

        .priority-search-option {
          padding: 9px 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 14px;
          color: #333;
          transition: background 0.12s;
        }

        .priority-search-option:hover { background: #f0f7ff; }

        .priority-search-option--create {
          color: #2563eb;
          font-weight: 500;
          font-style: italic;
          border-top: 1px solid #f3f4f6;
        }

        .priority-search-option--create:hover { background: #eff6ff; }

        .priority-search-option-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .priority-search-option-badges {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }

        .priority-search-option-badge {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: #6b7280;
          background: #f3f4f6;
          padding: 2px 6px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .priority-search-option-badge--assigned {
          color: #b45309;
          background: #fef3c7;
        }

        .priority-search-option--assigned {
          opacity: 0.75;
        }

        .priority-search-empty {
          padding: 12px 14px;
          font-size: 13px;
          color: #adb5bd;
          text-align: center;
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
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
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
