import { useEffect, useState } from "react";

export type SmartWeekSuggestionSource = "standing" | "last-week" | "unscheduled";

export type SmartWeekSuggestion = {
  id: string;
  source: SmartWeekSuggestionSource;
  sourceBlockId?: string;
  label: string;
  dayIndex: number;
  timeIndex: number;
  isHabitBlock: boolean;
  habitId?: string;
  hashtag?: string;
  standingBlockId?: string;
  reason: string;
};

type Props = {
  suggestions: SmartWeekSuggestion[];
  days: string[];
  timeSlots: string[];
  loading: boolean;
  applying: boolean;
  onRefresh: () => void;
  onApply: (suggestions: SmartWeekSuggestion[]) => void;
  onClose: () => void;
};

const SOURCE_LABELS: Record<SmartWeekSuggestionSource, string> = {
  standing: "Standing",
  "last-week": "Last week",
  unscheduled: "Backlog",
};

export default function SmartWeeklySetupModal({
  suggestions,
  days,
  timeSlots,
  loading,
  applying,
  onRefresh,
  onApply,
  onClose,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(suggestions.map((s) => s.id))
  );
  const [editedSuggestions, setEditedSuggestions] = useState<SmartWeekSuggestion[]>(suggestions);

  useEffect(() => {
    setSelectedIds(new Set(suggestions.map((s) => s.id)));
    setEditedSuggestions(suggestions);
  }, [suggestions]);

  const selectedSuggestions = editedSuggestions.filter((s) => selectedIds.has(s.id));

  function toggleSuggestion(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateSuggestion(id: string, updates: Partial<Pick<SmartWeekSuggestion, "dayIndex" | "timeIndex">>) {
    setEditedSuggestions((prev) =>
      prev.map((suggestion) =>
        suggestion.id === id ? { ...suggestion, ...updates } : suggestion
      )
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content smart-weekly-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Smart Weekly Setup</h2>
            <span className="smart-weekly-subtitle">
              Suggested from your routines, last week, and unscheduled blocks.
            </span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-body smart-weekly-body">
          {loading ? (
            <div className="smart-weekly-empty">Finding useful suggestions...</div>
          ) : suggestions.length === 0 ? (
            <div className="smart-weekly-empty">
              No open slots or reusable blocks found for this week.
            </div>
          ) : (
            <div className="smart-weekly-list">
              {editedSuggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className={`smart-weekly-item ${selectedIds.has(suggestion.id) ? "selected" : ""}`}
                >
                  <label className="smart-weekly-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(suggestion.id)}
                      onChange={() => toggleSuggestion(suggestion.id)}
                    />
                    <span>
                      <strong>{suggestion.label}</strong>
                      {suggestion.hashtag && <em> #{suggestion.hashtag}</em>}
                    </span>
                  </label>
                  <span className={`smart-weekly-source source-${suggestion.source}`}>
                    {SOURCE_LABELS[suggestion.source]}
                  </span>
                  <span className="smart-weekly-reason">{suggestion.reason}</span>
                  <div className="smart-weekly-controls">
                    <select
                      value={suggestion.dayIndex}
                      onChange={(e) =>
                        updateSuggestion(suggestion.id, { dayIndex: Number(e.target.value) })
                      }
                    >
                      {days.map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                    <select
                      value={suggestion.timeIndex}
                      onChange={(e) =>
                        updateSuggestion(suggestion.id, { timeIndex: Number(e.target.value) })
                      }
                    >
                      {timeSlots.map((slot, index) => (
                        <option key={`${slot}-${index}`} value={index}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="smart-weekly-actions">
            <button className="secondary" type="button" onClick={onRefresh} disabled={loading || applying}>
              Refresh
            </button>
            <button className="secondary" type="button" onClick={onClose} disabled={applying}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApply(selectedSuggestions)}
              disabled={loading || applying || selectedSuggestions.length === 0}
            >
              {applying ? "Applying..." : `Apply ${selectedSuggestions.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
