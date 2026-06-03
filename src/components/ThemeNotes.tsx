import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { database } from "../services/database";
import type { WorkoutHistoryEntry } from "../services/database";
import type { Block } from "../App";

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
  subtasks?: Habit[];
};

type ThemeNotesProps = {
  themeId: string;
  themeName: string;
  habits: Habit[];
  groups: HabitGroup[];
  userId: string;
  getHabitDoneCount: (habitId: string, frequency: Habit["frequency"]) => number;
  onClose: () => void;
  onCreateBlockFromNote: (label: string) => Promise<void>;
  onCreateHabitFromNote: (name: string) => Promise<void>;
  blocks?: Block[];
};

type NoteState = {
  content: string;
  saving: boolean;
  saved: boolean;
};

type PinnedInsight = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
};

type ThemeNotesPrefs = {
  generalNote: string;
  pinnedInsights: PinnedInsight[];
  hiddenBlockNoteIds: string[];
};

const createThemeNotesPrefsKey = (userId: string, themeId: string) =>
  `theme-notes:${userId}:${themeId}`;

const getActionLabel = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^[-*[\]\sx]+/i, "")
    .slice(0, 80) ?? "";

const flattenHabits = (habits: Habit[]): Habit[] =>
  habits.flatMap((habit) => [habit, ...flattenHabits(habit.subtasks ?? [])]);

export const ThemeNotes: React.FC<ThemeNotesProps> = ({
  themeId,
  themeName,
  habits,
  groups,
  userId,
  getHabitDoneCount,
  onClose,
  onCreateBlockFromNote,
  onCreateHabitFromNote,
  blocks = [],
}) => {
  const [expandedHabits, setExpandedHabits] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, NoteState>>({});
  const [workoutHistories, setWorkoutHistories] = useState<Record<string, WorkoutHistoryEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [themePrefs, setThemePrefs] = useState<ThemeNotesPrefs>({
    generalNote: "",
    pinnedInsights: [],
    hiddenBlockNoteIds: [],
  });
  const debounceTimers = useRef<Record<string, number>>({});
  const themeNoteTimer = useRef<number | null>(null);
  const prefsKey = createThemeNotesPrefsKey(userId, themeId);
  const allHabits = useMemo(() => flattenHabits(habits), [habits]);

  const strengthTrainingHabitIds = useMemo(() => allHabits
    .filter((h) => {
      if (!h.habitGroupId) return false;
      const group = groups.find((g) => g.id === h.habitGroupId);
      return group?.groupType === "strength_training";
    })
    .map((h) => h.id), [allHabits, groups]);

  useEffect(() => {
    const load = async () => {
      try {
        const savedPrefs = window.localStorage.getItem(prefsKey);
        if (savedPrefs) {
          setThemePrefs(JSON.parse(savedPrefs) as ThemeNotesPrefs);
        }

        const habitIds = allHabits.map((h) => h.id);
        const notesData = await database.habitNotes.getByHabitIds(habitIds);

        const notesMap: Record<string, NoteState> = {};
        for (const habit of allHabits) {
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
      if (themeNoteTimer.current) clearTimeout(themeNoteTimer.current);
    };
  }, [allHabits, prefsKey, strengthTrainingHabitIds]);

  const saveThemePrefs = useCallback((nextPrefs: ThemeNotesPrefs) => {
    setThemePrefs(nextPrefs);
    window.localStorage.setItem(prefsKey, JSON.stringify(nextPrefs));
  }, [prefsKey]);

  const updateGeneralNote = (content: string) => {
    const nextPrefs = { ...themePrefs, generalNote: content };
    setThemePrefs(nextPrefs);

    if (themeNoteTimer.current) clearTimeout(themeNoteTimer.current);
    themeNoteTimer.current = window.setTimeout(() => {
      window.localStorage.setItem(prefsKey, JSON.stringify(nextPrefs));
    }, 600);
  };

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

  const pinInsight = (text: string, source: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    saveThemePrefs({
      ...themePrefs,
      pinnedInsights: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: trimmed,
          source,
          createdAt: new Date().toISOString(),
        },
        ...themePrefs.pinnedInsights,
      ].slice(0, 12),
    });
  };

  const removePinnedInsight = (id: string) => {
    saveThemePrefs({
      ...themePrefs,
      pinnedInsights: themePrefs.pinnedInsights.filter((insight) => insight.id !== id),
    });
  };

  const hideBlockNote = (blockId: string) => {
    saveThemePrefs({
      ...themePrefs,
      hiddenBlockNoteIds: Array.from(new Set([...themePrefs.hiddenBlockNoteIds, blockId])),
    });
  };

  const restoreHiddenBlockNotes = () => {
    saveThemePrefs({
      ...themePrefs,
      hiddenBlockNoteIds: [],
    });
  };

  const createBlockFromText = async (text: string) => {
    const label = getActionLabel(text);
    if (!label) return;
    await onCreateBlockFromNote(label);
  };

  const createHabitFromText = async (text: string) => {
    const label = getActionLabel(text);
    if (!label) return;
    await onCreateHabitFromNote(label);
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
  const hiddenCount = themePrefs.hiddenBlockNoteIds.length;

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
          ) : (
            <div className="theme-notes-layout">
              <section className="theme-notes-section">
                <div className="theme-notes-section-header">
                  <h3>Theme Notes</h3>
                  <div className="theme-notes-actions">
                    <button className="secondary small-btn" onClick={() => pinInsight(themePrefs.generalNote, "Theme note")}>
                      Pin insight
                    </button>
                    <button className="secondary small-btn" onClick={() => createBlockFromText(themePrefs.generalNote)}>
                      Turn into block
                    </button>
                    <button className="secondary small-btn" onClick={() => createHabitFromText(themePrefs.generalNote)}>
                      Turn into habit
                    </button>
                  </div>
                </div>
                <textarea
                  className="theme-notes-textarea"
                  value={themePrefs.generalNote}
                  onChange={(e) => updateGeneralNote(e.target.value)}
                  placeholder={`General thoughts about ${themeName}...`}
                  rows={4}
                />
              </section>

              {themePrefs.pinnedInsights.length > 0 && (
                <section className="theme-notes-section">
                  <div className="theme-notes-section-header">
                    <h3>Pinned Insights</h3>
                  </div>
                  <div className="theme-notes-pinned-list">
                    {themePrefs.pinnedInsights.map((insight) => (
                      <div key={insight.id} className="theme-notes-pinned-item">
                        <div>
                          <div className="theme-notes-pinned-source">{insight.source}</div>
                          <div className="theme-notes-pinned-text">{insight.text}</div>
                        </div>
                        <button className="theme-notes-inline-btn" onClick={() => removePinnedInsight(insight.id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="theme-notes-section">
                <div className="theme-notes-section-header">
                  <h3>Linked Habit Notes</h3>
                  {hiddenCount > 0 && (
                    <button className="secondary small-btn" onClick={restoreHiddenBlockNotes}>
                      Show {hiddenCount} archived
                    </button>
                  )}
                </div>
              {allHabits.length === 0 && (
                <div style={{ textAlign: "center", color: "#999", padding: "16px", fontSize: "13px" }}>
                  No habits in this theme yet.
                </div>
              )}
              {allHabits.map((habit) => {
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
                          <div className="theme-notes-subsection-header">
                            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "4px", display: "block" }}>
                            Notes
                            {note?.saving && <span style={{ fontWeight: 400, color: "#999", marginLeft: "8px" }}>Saving...</span>}
                            {note?.saved && <span style={{ fontWeight: 400, color: "#16a34a", marginLeft: "8px" }}>Saved</span>}
                            </label>
                            <div className="theme-notes-actions">
                              <button className="secondary small-btn" onClick={() => pinInsight(note?.content ?? "", `${habit.name} note`)}>
                                Pin
                              </button>
                              <button className="secondary small-btn" onClick={() => createBlockFromText(note?.content ?? "")}>
                                Block
                              </button>
                              <button className="secondary small-btn" onClick={() => createHabitFromText(note?.content ?? "")}>
                                Habit
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="theme-notes-textarea"
                            value={note?.content ?? ""}
                            onChange={(e) => handleNoteChange(habit.id, e.target.value)}
                            placeholder={`Write notes about ${habit.name}...`}
                            rows={3}
                          />
                        </div>

                        {(() => {
                          const habitBlocks = blocks.filter(
                            (b) =>
                              b.habitId === habit.id &&
                              (b.blockNote ?? "").trim() &&
                              !themePrefs.hiddenBlockNoteIds.includes(b.id)
                          );
                          if (habitBlocks.length === 0) return null;
                          return (
                            <div style={{ marginTop: "10px" }}>
                              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "4px", display: "block" }}>
                                Block Notes
                              </label>
                              <div className="theme-notes-block-notes">
                                {habitBlocks.map((b) => (
                                  <div key={b.id} className="theme-notes-block-note-item">
                                    <div className="theme-notes-block-note-label">{b.label}</div>
                                    <div className="theme-notes-block-note-content">{b.blockNote}</div>
                                    <div className="theme-notes-note-actions">
                                      <button className="theme-notes-inline-btn" onClick={() => pinInsight(b.blockNote ?? "", `${habit.name} block`)}>
                                        Pin insight
                                      </button>
                                      <button className="theme-notes-inline-btn" onClick={() => createBlockFromText(b.blockNote ?? "")}>
                                        Turn into block
                                      </button>
                                      <button className="theme-notes-inline-btn" onClick={() => createHabitFromText(b.blockNote ?? "")}>
                                        Turn into habit
                                      </button>
                                      <button className="theme-notes-inline-btn" onClick={() => hideBlockNote(b.id)}>
                                        Archive
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

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
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
