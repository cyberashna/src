import React, { useState, useEffect, useRef, useCallback } from "react";
import { database } from "../services/database";
import type { WorkoutHistoryEntry } from "../services/database";

type HabitGroup = {
  id: string;
  name: string;
  groupType: "strength_training" | "custom";
  linkBehavior: "adjacent_merge" | "none";
};

type Habit = {
  id: string;
  name: string;
  targetPerWeek: number;
  doneCount: number;
  lastDoneAt?: string;
  frequency: "daily" | "weekly" | "monthly" | "none";
  habitGroupId?: string;
};

type ThemeNotesProps = {
  themeId: string;
  themeName: string;
  habits: Habit[];
  groups: HabitGroup[];
  userId: string;
  getHabitDoneCount: (habitId: string, frequency: Habit["frequency"]) => number;
  onClose: () => void;
};

type NoteState = {
  content: string;
  saving: boolean;
  saved: boolean;
};

export const ThemeNotes: React.FC<ThemeNotesProps> = ({
  themeName,
  habits,
  groups,
  userId,
  getHabitDoneCount,
  onClose,
}) => {
  const [expandedHabits, setExpandedHabits] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, NoteState>>({});
  const [workoutHistories, setWorkoutHistories] = useState<Record<string, WorkoutHistoryEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const debounceTimers = useRef<Record<string, number>>({});

  const strengthTrainingHabitIds = habits
    .filter((h) => {
      if (!h.habitGroupId) return false;
      const group = groups.find((g) => g.id === h.habitGroupId);
      return group?.groupType === "strength_training";
    })
    .map((h) => h.id);

  useEffect(() => {
    const load = async () => {
      try {
        const habitIds = habits.map((h) => h.id);
        const notesData = await database.habitNotes.getByHabitIds(habitIds);

        const notesMap: Record<string, NoteState> = {};
        for (const habit of habits) {
          const existing = notesData.find((n) => n.habit_id === habit.id);
          notesMap[habit.id] = {
            content: existing?.content ?? "",
            saving: false,
            saved: false,
          };
        }
        setNotes(notesMap);

        const historyPromises = strengthTrainingHabitIds.map((id) =>
          database.workoutHistory.getByHabit(id)
        );
        const historyResults = await Promise.all(historyPromises);
        const historyMap: Record<string, WorkoutHistoryEntry[]> = {};
        strengthTrainingHabitIds.forEach((id, idx) => {
          historyMap[id] = historyResults[idx];
        });
        setWorkoutHistories(historyMap);
      } catch (err) {
        console.error("Error loading theme notes:", err);
      } finally {
        setLoading(false);
      }
    };
    load();

    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const saveNote = useCallback(async (habitId: string, content: string) => {
    setNotes((prev) => ({
      ...prev,
      [habitId]: { ...prev[habitId], saving: true, saved: false },
    }));

    try {
      await database.habitNotes.upsert(userId, habitId, content);
      setNotes((prev) => ({
        ...prev,
        [habitId]: { ...prev[habitId], saving: false, saved: true },
      }));
      setTimeout(() => {
        setNotes((prev) => ({
          ...prev,
          [habitId]: prev[habitId] ? { ...prev[habitId], saved: false } : prev[habitId],
        }));
      }, 2000);
    } catch (err) {
      console.error("Error saving note:", err);
      setNotes((prev) => ({
        ...prev,
        [habitId]: { ...prev[habitId], saving: false },
      }));
    }
  }, [userId]);

  const handleNoteChange = (habitId: string, value: string) => {
    setNotes((prev) => ({
      ...prev,
      [habitId]: { ...prev[habitId], content: value },
    }));

    if (debounceTimers.current[habitId]) {
      clearTimeout(debounceTimers.current[habitId]);
    }
    debounceTimers.current[habitId] = window.setTimeout(() => {
      saveNote(habitId, value);
    }, 1000);
  };

  const toggleHabit = (habitId: string) => {
    setExpandedHabits((prev) => {
      const next = new Set(prev);
      if (next.has(habitId)) next.delete(habitId);
      else next.add(habitId);
      return next;
    });
  };

  const deleteWorkoutEntry = async (entryId: string, habitId: string) => {
    try {
      await database.workoutHistory.delete(entryId);
      setWorkoutHistories((prev) => ({
        ...prev,
        [habitId]: prev[habitId].filter((e) => e.id !== entryId),
      }));
    } catch (err) {
      console.error("Error deleting workout entry:", err);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTimeSince = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  };

  const isStrengthHabit = (habitId: string) => strengthTrainingHabitIds.includes(habitId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content theme-notes-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{themeName} -- Notes</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ padding: "12px 20px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "#666", padding: "24px" }}>
              Loading...
            </div>
          ) : habits.length === 0 ? (
            <div style={{ textAlign: "center", color: "#999", padding: "24px", fontSize: "13px" }}>
              No habits in this theme yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {habits.map((habit) => {
                const isOpen = expandedHabits.has(habit.id);
                const note = notes[habit.id];
                const done = getHabitDoneCount(habit.id, habit.frequency);
                const target = habit.targetPerWeek;
                const isStrength = isStrengthHabit(habit.id);
                const history = workoutHistories[habit.id] || [];

                return (
                  <div key={habit.id} className="theme-notes-habit-card">
                    <div
                      className="theme-notes-habit-header"
                      onClick={() => toggleHabit(habit.id)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "10px",
                            color: "#999",
                            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.2s ease",
                          }}
                        >
                          &#9654;
                        </span>
                        <span style={{ fontWeight: 600, fontSize: "14px", color: "#222" }}>
                          {habit.name}
                        </span>
                        {isStrength && (
                          <span style={{ fontSize: "11px", color: "#666", background: "#f0f0f0", padding: "2px 6px", borderRadius: "3px" }}>
                            Strength
                          </span>
                        )}
                        <span style={{
                          fontSize: "9px",
                          fontWeight: 600,
                          padding: "2px 5px",
                          borderRadius: "3px",
                          background: habit.frequency === "daily" ? "#fef08a" : habit.frequency === "weekly" ? "#bfdbfe" : habit.frequency === "monthly" ? "#d8b4fe" : "#e5e7eb",
                          color: habit.frequency === "daily" ? "#713f12" : habit.frequency === "weekly" ? "#1e3a8a" : habit.frequency === "monthly" ? "#581c87" : "#374151",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}>
                          {habit.frequency === "daily" ? "D" : habit.frequency === "weekly" ? "W" : habit.frequency === "monthly" ? "M" : "N"}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#666", whiteSpace: "nowrap" }}>
                        {habit.frequency !== "none" ? `${done}/${target}` : `${done} done`}
                      </div>
                    </div>

                    {!isOpen && (
                      <div className="theme-notes-habit-summary">
                        {habit.frequency !== "none" && target > 0 && (
                          <span>
                            {done >= target ? "Goal met" : `${target - done} to go`}
                          </span>
                        )}
                        {habit.lastDoneAt && (
                          <span style={{ color: "#888" }}>
                            Last: {formatTimeSince(habit.lastDoneAt)}
                          </span>
                        )}
                        {isStrength && history.length > 0 && (
                          <span style={{ color: "#888" }}>
                            Latest: {history[0].sets}x{history[0].reps} @ {history[0].weight} {history[0].unit}
                          </span>
                        )}
                      </div>
                    )}

                    {isOpen && (
                      <div className="theme-notes-habit-body">
                        <div className="theme-notes-summary-bar">
                          {habit.frequency !== "none" && target > 0 && (
                            <span>{done >= target ? "Goal met this period" : `${done} of ${target} completed`}</span>
                          )}
                          {habit.frequency === "none" && <span>Total completions: {done}</span>}
                          {habit.lastDoneAt && (
                            <span>Last done: {formatTimeSince(habit.lastDoneAt)}</span>
                          )}
                        </div>

                        <div style={{ marginTop: "10px" }}>
                          <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "4px", display: "block" }}>
                            Notes
                            {note?.saving && <span style={{ fontWeight: 400, color: "#999", marginLeft: "8px" }}>Saving...</span>}
                            {note?.saved && <span style={{ fontWeight: 400, color: "#16a34a", marginLeft: "8px" }}>Saved</span>}
                          </label>
                          <textarea
                            className="theme-notes-textarea"
                            value={note?.content ?? ""}
                            onChange={(e) => handleNoteChange(habit.id, e.target.value)}
                            placeholder={`Write notes about ${habit.name}...`}
                            rows={3}
                          />
                        </div>

                        {isStrength && (
                          <div style={{ marginTop: "12px" }}>
                            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", display: "block" }}>
                              Workout History
                            </label>
                            {history.length === 0 ? (
                              <div style={{ fontSize: "12px", color: "#999", padding: "8px 0" }}>
                                No workouts logged yet. Submit a workout from the planner to start tracking.
                              </div>
                            ) : (
                              <div className="workout-history-list">
                                {history.map((entry) => (
                                  <div key={entry.id} className="workout-history-row">
                                    <span className="workout-history-date">
                                      {formatDate(entry.completed_date)}
                                    </span>
                                    <span className="workout-history-data">
                                      {entry.sets} x {entry.reps} @ {entry.weight} {entry.unit}
                                    </span>
                                    <button
                                      className="workout-history-delete"
                                      onClick={() => deleteWorkoutEntry(entry.id, habit.id)}
                                      title="Remove entry"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                ))}
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
        </div>
      </div>
    </div>
  );
};
