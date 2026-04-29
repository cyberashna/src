import { useState, useEffect, useRef } from 'react';

interface Theme {
  id: string;
  name: string;
}

interface Props {
  themes: Theme[];
  onClose: () => void;
  onCreateHabit: (
    themeId: string,
    name: string,
    targetPerWeek: number,
    frequency: 'daily' | 'weekly' | 'monthly' | 'none'
  ) => Promise<void>;
}

export default function QuickHabitForm({ themes, onClose, onCreateHabit }: Props) {
  const habitThemes = themes.filter(t => t.name !== 'Meals' && t.name !== 'meals');
  const [name, setName] = useState('');
  const [themeId, setThemeId] = useState(habitThemes[0]?.id ?? '');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'none'>('weekly');
  const [target, setTarget] = useState(3);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  async function handleSave() {
    if (!name.trim() || !themeId) return;
    setSaving(true);
    try {
      await onCreateHabit(themeId, name.trim(), frequency === 'none' ? 1 : target, frequency);
      setName('');
      nameRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="quick-habit-panel" ref={panelRef}>
      <div className="quick-habit-header">
        <span className="quick-habit-title">New Habit</span>
        <button className="quick-habit-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="quick-habit-body">
        <div className="quick-habit-field">
          <label className="quick-habit-label">Name</label>
          <input
            ref={nameRef}
            className="quick-habit-input"
            type="text"
            placeholder="e.g. Morning run"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="quick-habit-field">
          <label className="quick-habit-label">Theme</label>
          <select
            className="quick-habit-select"
            value={themeId}
            onChange={e => setThemeId(e.target.value)}
          >
            {habitThemes.length === 0 && (
              <option value="">No themes yet</option>
            )}
            {habitThemes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="quick-habit-row">
          <div className="quick-habit-field quick-habit-field--half">
            <label className="quick-habit-label">Frequency</label>
            <select
              className="quick-habit-select"
              value={frequency}
              onChange={e => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly' | 'none')}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="none">None</option>
            </select>
          </div>

          {frequency !== 'none' && (
            <div className="quick-habit-field quick-habit-field--half">
              <label className="quick-habit-label">
                Target / {frequency === 'daily' ? 'day' : frequency === 'weekly' ? 'week' : 'month'}
              </label>
              <input
                className="quick-habit-input"
                type="number"
                min={1}
                max={30}
                value={target}
                onChange={e => setTarget(Math.max(1, parseInt(e.target.value) || 1))}
                onKeyDown={handleKeyDown}
              />
            </div>
          )}
        </div>

        <button
          className="quick-habit-save"
          onClick={handleSave}
          disabled={saving || !name.trim() || !themeId}
        >
          {saving ? 'Saving...' : '+ Add Habit'}
        </button>
      </div>

      <style>{`
        .quick-habit-panel {
          position: fixed;
          bottom: 24px;
          right: 340px;
          z-index: 500;
          width: 280px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
          border: 1px solid #e9ecef;
          overflow: hidden;
        }

        .quick-habit-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
        }

        .quick-habit-title {
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.3px;
        }

        .quick-habit-close {
          background: rgba(255,255,255,0.15);
          border: none;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
        }

        .quick-habit-close:hover {
          background: rgba(255,255,255,0.3);
        }

        .quick-habit-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .quick-habit-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .quick-habit-row {
          display: flex;
          gap: 10px;
        }

        .quick-habit-field--half {
          flex: 1;
        }

        .quick-habit-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #6b7280;
        }

        .quick-habit-input,
        .quick-habit-select {
          padding: 8px 10px;
          border: 1.5px solid #e5e7eb;
          border-radius: 6px;
          font-size: 13px;
          color: #111827;
          background: white;
          transition: border-color 0.15s;
          width: 100%;
          box-sizing: border-box;
        }

        .quick-habit-input:focus,
        .quick-habit-select:focus {
          outline: none;
          border-color: #2563eb;
        }

        .quick-habit-save {
          margin-top: 4px;
          padding: 10px;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }

        .quick-habit-save:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .quick-habit-save:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
