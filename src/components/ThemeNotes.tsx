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
  updatedAt?: string;
};

type PinnedInsight = {
  id: string;
  text: string;
  source: string;
  createdAt: string;
};

type ThemeNotesPrefs = {
  generalNote: string;
  generalUpdatedAt?: string;
  pinnedInsights: PinnedInsight[];
  hiddenBlockNoteIds: string[];
};

type MarkdownCommand = "heading" | "bold" | "italic" | "bullet" | "check";

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

const applyMarkdownEdit = (
  value: string,
  start: number,
  end: number,
  command: MarkdownCommand
) => {
  const selected = value.slice(start, end);
  const hasSelection = selected.length > 0;
  const selectedOrPlaceholder = selected || (
    command === "heading" ? "Heading" :
    command === "bullet" ? "List item" :
    command === "check" ? "Action item" :
    "text"
  );

  let replacement = selectedOrPlaceholder;
  let selectStart = start;
  let selectEnd = start + replacement.length;

  if (command === "bold" || command === "italic") {
    const marker = command === "bold" ? "**" : "*";
    replacement = `${marker}${selectedOrPlaceholder}${marker}`;
    selectStart = start + marker.length;
    selectEnd = selectStart + selectedOrPlaceholder.length;
  }

  if (command === "heading") {
    replacement = selectedOrPlaceholder
      .split("\n")
      .map((line) => line.startsWith("#") ? line : `## ${line}`)
      .join("\n");
    selectStart = start + 3;
    selectEnd = start + replacement.length;
  }

  if (command === "bullet" || command === "check") {
    const prefix = command === "bullet" ? "- " : "- [ ] ";
    replacement = selectedOrPlaceholder
      .split("\n")
      .map((line) => line.startsWith(prefix) ? line : `${prefix}${line}`)
      .join("\n");
    selectStart = start + prefix.length;
    selectEnd = hasSelection ? start + replacement.length : selectStart + selectedOrPlaceholder.length;
  }

  return {
    nextValue: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectStart,
    selectEnd,
  };
};

const parseInlineMarkdown = (text: string, keyPrefix: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
};

const renderMarkdownPreview = (content: string) => {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    elements.push(<ul key={`list-${elements.length}`}>{listItems}</ul>);
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const HeadingTag = headingMatch[1].length === 1 ? "h3" : "h4";
      elements.push(
        <HeadingTag key={`heading-${index}`}>
          {parseInlineMarkdown(headingMatch[2], `heading-${index}`)}
        </HeadingTag>
      );
      return;
    }

    const checkboxMatch = trimmed.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (checkboxMatch) {
      listItems.push(
        <li key={`checkbox-${index}`} className="theme-notes-preview-checkbox">
          <input type="checkbox" checked={checkboxMatch[1].toLowerCase() === "x"} readOnly />
          <span>{parseInlineMarkdown(checkboxMatch[2], `checkbox-${index}`)}</span>
        </li>
      );
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(
        <li key={`bullet-${index}`}>
          {parseInlineMarkdown(bulletMatch[1], `bullet-${index}`)}
        </li>
      );
      return;
    }

    flushList();
    elements.push(
      <p key={`paragraph-${index}`}>
        {parseInlineMarkdown(trimmed, `paragraph-${index}`)}
      </p>
    );
  });

  flushList();
  return elements;
};

const MarkdownPreview: React.FC<{ content: string }> = ({ content }) => {
  if (!content.trim()) return null;

  return (
    <div className="theme-notes-markdown-preview">
      {renderMarkdownPreview(content)}
    </div>
  );
};

const MarkdownToolbar: React.FC<{ onCommand: (command: MarkdownCommand) => void }> = ({ onCommand }) => (
  <div className="theme-notes-markdown-toolbar" aria-label="Markdown formatting">
    <button type="button" className="theme-notes-format-btn" onClick={() => onCommand("heading")} title="Heading">
      H
    </button>
    <button type="button" className="theme-notes-format-btn" onClick={() => onCommand("bold")} title="Bold">
      B
    </button>
    <button type="button" className="theme-notes-format-btn italic" onClick={() => onCommand("italic")} title="Italic">
      I
    </button>
    <button type="button" className="theme-notes-format-btn" onClick={() => onCommand("bullet")} title="Bulleted list">
      List
    </button>
    <button type="button" className="theme-notes-format-btn" onClick={() => onCommand("check")} title="Checkbox">
      Check
    </button>
  </div>
);

const MarkdownNoteEditor: React.FC<{
  value: string;
  placeholder: string;
  rows: number;
  textareaRef: React.Ref<HTMLTextAreaElement>;
  isEditing: boolean;
  onChange: (value: string) => void;
  onCommand: (command: MarkdownCommand) => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
}> = ({
  value,
  placeholder,
  rows,
  textareaRef,
  isEditing,
  onChange,
  onCommand,
  onStartEdit,
  onStopEdit,
}) => {
  const hasContent = value.trim().length > 0;

  if (!isEditing && hasContent) {
    return (
      <button
        type="button"
        className="theme-notes-preview-button"
        onClick={onStartEdit}
        title="Click to edit"
      >
        <MarkdownPreview content={value} />
      </button>
    );
  }

  return (
    <div
      className="theme-notes-editor"
      onBlur={(event) => {
        const nextFocus = event.relatedTarget as Node | null;
        if (nextFocus && event.currentTarget.contains(nextFocus)) return;
        onStopEdit();
      }}
    >
      <textarea
        ref={textareaRef}
        className="theme-notes-textarea"
        value={value}
        onFocus={onStartEdit}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      <MarkdownToolbar onCommand={onCommand} />
      {hasContent && (
        <div className="theme-notes-live-preview">
          <MarkdownPreview content={value} />
        </div>
      )}
    </div>
  );
};

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
  const [activeNoteEditor, setActiveNoteEditor] = useState<"theme" | string | null>(null);
  const [themePrefs, setThemePrefs] = useState<ThemeNotesPrefs>({
    generalNote: "",
    generalUpdatedAt: undefined,
    pinnedInsights: [],
    hiddenBlockNoteIds: [],
  });
  const debounceTimers = useRef<Record<string, number>>({});
  const themeNoteTimer = useRef<number | null>(null);
  const themeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const habitTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
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
            updatedAt: existing?.updated_at,
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
    const nextPrefs = { ...themePrefs, generalNote: content, generalUpdatedAt: new Date().toISOString() };
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
      const savedNote = await database.habitNotes.upsert(userId, habitId, content);
      setNotes((prev) => ({
        ...prev,
        [habitId]: { ...prev[habitId], saving: false, saved: true, updatedAt: savedNote.updated_at },
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

  const applyMarkdownCommand = (target: "theme" | string, command: MarkdownCommand) => {
    const textarea = target === "theme" ? themeTextareaRef.current : habitTextareaRefs.current[target];
    const value = target === "theme" ? themePrefs.generalNote : notes[target]?.content ?? "";
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const { nextValue, selectStart, selectEnd } = applyMarkdownEdit(value, start, end, command);

    if (target === "theme") {
      updateGeneralNote(nextValue);
    } else {
      handleNoteChange(target, nextValue);
    }

    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(selectStart, selectEnd);
    });
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

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
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
                  {themePrefs.generalUpdatedAt && (
                    <span className="theme-notes-timestamp">
                      Last edited {formatTimestamp(themePrefs.generalUpdatedAt)}
                    </span>
                  )}
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
                <MarkdownNoteEditor
                  value={themePrefs.generalNote}
                  placeholder={`General thoughts about ${themeName}...`}
                  rows={4}
                  textareaRef={themeTextareaRef}
                  isEditing={activeNoteEditor === "theme" || !themePrefs.generalNote.trim()}
                  onChange={updateGeneralNote}
                  onCommand={(command) => applyMarkdownCommand("theme", command)}
                  onStartEdit={() => setActiveNoteEditor("theme")}
                  onStopEdit={() => setActiveNoteEditor((current) => current === "theme" ? null : current)}
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
                          <div className="theme-notes-timestamp">
                            Pinned {formatTimestamp(insight.createdAt)}
                          </div>
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
                            {note?.updatedAt && (
                              <span className="theme-notes-timestamp">
                                Last edited {formatTimestamp(note.updatedAt)}
                              </span>
                            )}
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
                          <MarkdownNoteEditor
                            value={note?.content ?? ""}
                            placeholder={`Write notes about ${habit.name}...`}
                            rows={3}
                            textareaRef={(node) => { habitTextareaRefs.current[habit.id] = node; }}
                            isEditing={activeNoteEditor === habit.id || !(note?.content ?? "").trim()}
                            onChange={(value) => handleNoteChange(habit.id, value)}
                            onCommand={(command) => applyMarkdownCommand(habit.id, command)}
                            onStartEdit={() => setActiveNoteEditor(habit.id)}
                            onStopEdit={() => setActiveNoteEditor((current) => current === habit.id ? null : current)}
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
                                    <div className="theme-notes-block-note-label-row">
                                      <div className="theme-notes-block-note-label">{b.label}</div>
                                      {b.blockNoteUpdatedAt && (
                                        <span className="theme-notes-timestamp">
                                          {formatTimestamp(b.blockNoteUpdatedAt)}
                                        </span>
                                      )}
                                    </div>
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
