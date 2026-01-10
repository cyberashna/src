import React, { useState, useEffect } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";
import { AuthScreen } from "./components/AuthScreen";
import { CalendarSettings } from "./components/CalendarSettings";
import { ThemeGoals } from "./components/ThemeGoals";
import { database } from "./services/database";
import type { User } from "@supabase/supabase-js";

type Habit = {
  id: string;
  name: string;
  targetPerWeek: number;
  doneCount: number;
  lastDoneAt?: string;
  frequency: "weekly" | "monthly" | "none";
};

type Theme = {
  id: string;
  name: string;
  habits: Habit[];
};

type BlockLocation =
  | { type: "unscheduled" }
  | { type: "slot"; dayIndex: number; timeIndex: number };

export type Block = {
  id: string;
  label: string;
  isHabitBlock: boolean;
  location: BlockLocation;
  habitId?: string;
  completed?: boolean;
  hashtag?: string;
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const formatTimeSince = (timestamp: string): string => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return then.toLocaleDateString();
};

const getCurrentWeekRange = (): string => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatDate = (date: Date) => {
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  return `${formatDate(monday)} - ${formatDate(sunday)}`;
};

const hourlySlots = [
  "6:00 AM",
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
  "9:00 PM",
  "10:00 PM",
];

type ViewMode = "hourly" | "buckets";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [themes, setThemes] = useState<Theme[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dragHabitId, setDragHabitId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("hourly");
  const [bucketSlots, setBucketSlots] = useState<string[]>([
    "Early morning",
    "Morning",
    "Afternoon",
    "Evening",
    "Night",
  ]);
  const [showBucketConfig, setShowBucketConfig] = useState(false);

  const [addingThemeId, setAddingThemeId] = useState<string | null>(null);
  const [newThemeHabitName, setNewThemeHabitName] = useState("");
  const [newThemeHabitTarget, setNewThemeHabitTarget] = useState<number>(2);
  const [newThemeHabitFrequency, setNewThemeHabitFrequency] = useState<"weekly" | "monthly" | "none">("weekly");
  const [expandedHabits, setExpandedHabits] = useState<Set<string>>(new Set());

  const [newThemeName, setNewThemeName] = useState("");

  const [blockLabel, setBlockLabel] = useState("");
  const [blockHashtag, setBlockHashtag] = useState("");

  const [showCalendarSettings, setShowCalendarSettings] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;

    setDataLoading(true);
    try {
      const [themesData, habitsData, blocksData] = await Promise.all([
        database.themes.getAll(user.id),
        database.habits.getAll(user.id),
        database.blocks.getAll(user.id),
      ]);

      const themesWithHabits: Theme[] = themesData.map((theme) => ({
        id: theme.id,
        name: theme.name,
        habits: habitsData
          .filter((h) => h.theme_id === theme.id)
          .map((h) => ({
            id: h.id,
            name: h.name,
            targetPerWeek: h.target_per_week,
            doneCount: h.done_count,
            lastDoneAt: h.last_done_at ?? undefined,
            frequency: h.frequency,
          })),
      }));

      setThemes(themesWithHabits);

      const convertedBlocks: Block[] = blocksData.map((b) => ({
        id: b.id,
        label: b.label,
        isHabitBlock: b.is_habit_block,
        habitId: b.habit_id ?? undefined,
        completed: b.completed,
        hashtag: b.hashtag ?? undefined,
        location:
          b.location_type === "slot" && b.day_index !== null && b.time_index !== null
            ? { type: "slot", dayIndex: b.day_index, timeIndex: b.time_index }
            : { type: "unscheduled" },
      }));

      setBlocks(convertedBlocks);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setDataLoading(false);
    }
  };

  const allHabits = themes.flatMap((theme) =>
    theme.habits.map((habit) => ({
      ...habit,
      themeName: theme.name,
    }))
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setThemes([]);
    setBlocks([]);
  };

  const addHabitToTheme = async (
    themeId: string,
    name: string,
    targetPerWeek: number,
    frequency: "weekly" | "monthly" | "none"
  ) => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Enter a habit name.");
      return;
    }
    if (frequency !== "none" && (!targetPerWeek || targetPerWeek <= 0)) {
      alert("Enter a valid target.");
      return;
    }

    if (!user) return;

    try {
      const habitData = await database.habits.create(
        user.id,
        themeId,
        trimmed,
        targetPerWeek,
        frequency
      );

      const newHabit: Habit = {
        id: habitData.id,
        name: habitData.name,
        targetPerWeek: habitData.target_per_week,
        doneCount: habitData.done_count,
        frequency: habitData.frequency,
      };

      setThemes((prevThemes) =>
        prevThemes.map((theme) =>
          theme.id === themeId
            ? { ...theme, habits: [...theme.habits, newHabit] }
            : theme
        )
      );
    } catch (error) {
      console.error("Error creating habit:", error);
      alert("Failed to create habit");
    }
  };

  const incrementHabit = async (habitId: string) => {
    const habit = allHabits.find((h) => h.id === habitId);
    if (!habit || !user) return;

    const now = new Date().toISOString();
    const newCount = habit.doneCount + 1;

    try {
      await database.habits.update(habitId, {
        done_count: newCount,
        last_done_at: now,
      });

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: theme.habits.map((h) =>
            h.id === habitId
              ? { ...h, doneCount: newCount, lastDoneAt: now }
              : h
          ),
        }))
      );

      const theme = themes.find((t) => t.habits.some((h) => h.id === habitId));
      if (theme) {
        const goals = await database.themeGoals.getByTheme(theme.id);
        const completedDate = now.split('T')[0];

        for (const goal of goals) {
          try {
            await database.themeGoals.recordCompletion(
              user.id,
              goal.id,
              habitId,
              completedDate
            );
          } catch (error) {
            console.error("Error recording goal completion:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error updating habit:", error);
    }
  };

  const clearLastDoneAt = async (habitId: string) => {
    if (!user) return;

    try {
      await database.habits.clearLastDoneAt(habitId);

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: theme.habits.map((h) =>
            h.id === habitId ? { ...h, lastDoneAt: undefined } : h
          ),
        }))
      );
    } catch (error) {
      console.error("Error clearing last done timestamp:", error);
    }
  };

  const deleteHabit = async (habitId: string) => {
    if (
      !window.confirm(
        "Delete this habit? Any linked habit blocks will become normal blocks."
      )
    )
      return;

    try {
      await database.habits.delete(habitId);

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: theme.habits.filter((h) => h.id !== habitId),
        }))
      );

      setBlocks((prevBlocks) =>
        prevBlocks.map((b) =>
          b.habitId === habitId
            ? { ...b, isHabitBlock: false, habitId: undefined, completed: false }
            : b
        )
      );

      const affectedBlocks = blocks.filter((b) => b.habitId === habitId);
      for (const block of affectedBlocks) {
        await database.blocks.update(block.id, {
          is_habit_block: false,
          habit_id: null,
          completed: false,
        });
      }
    } catch (error) {
      console.error("Error deleting habit:", error);
      alert("Failed to delete habit");
    }
  };

  const toggleHabitExpanded = (habitId: string) => {
    setExpandedHabits((prev) => {
      const next = new Set(prev);
      if (next.has(habitId)) {
        next.delete(habitId);
      } else {
        next.add(habitId);
      }
      return next;
    });
  };

  const addTheme = async () => {
    const trimmed = newThemeName.trim();
    if (!trimmed) {
      alert("Enter a theme name.");
      return;
    }

    if (!user) return;

    try {
      const themeData = await database.themes.create(user.id, trimmed);

      const newTheme: Theme = {
        id: themeData.id,
        name: themeData.name,
        habits: [],
      };

      setThemes((prev) => [...prev, newTheme]);
      setNewThemeName("");
    } catch (error) {
      console.error("Error creating theme:", error);
      alert("Failed to create theme");
    }
  };

  const createBlock = async (
    label: string,
    isHabitBlock = false,
    habitId?: string,
    hashtag?: string
  ) => {
    const trimmed = label.trim();
    if (!trimmed) {
      alert("Enter a label for the block.");
      return;
    }

    if (!user) return;

    try {
      const blockData = await database.blocks.create(user.id, {
        label: trimmed,
        is_habit_block: isHabitBlock,
        habit_id: habitId ?? null,
        location_type: "unscheduled",
        day_index: null,
        time_index: null,
        completed: false,
        hashtag: hashtag?.trim() || null,
      });

      const newBlock: Block = {
        id: blockData.id,
        label: blockData.label,
        isHabitBlock: blockData.is_habit_block,
        location: { type: "unscheduled" },
        habitId: blockData.habit_id ?? undefined,
        completed: blockData.completed,
        hashtag: blockData.hashtag ?? undefined,
      };

      setBlocks((prev) => [...prev, newBlock]);
      setBlockLabel("");
      setBlockHashtag("");
    } catch (error) {
      console.error("Error creating block:", error);
      alert("Failed to create block");
    }
  };

  const createHabitBlockAtSlot = async (
    habitId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    const habit = allHabits.find((h) => h.id === habitId);
    if (!habit || !user) return;

    try {
      const blockData = await database.blocks.create(user.id, {
        label: `Habit: ${habit.name}`,
        is_habit_block: true,
        habit_id: habitId,
        location_type: "slot",
        day_index: dayIndex,
        time_index: timeIndex,
        completed: false,
        hashtag: habit.themeName,
      });

      const newBlock: Block = {
        id: blockData.id,
        label: blockData.label,
        isHabitBlock: true,
        location: { type: "slot", dayIndex, timeIndex },
        habitId: habitId,
        completed: false,
        hashtag: habit.themeName,
      };

      setBlocks((prev) => [...prev, newBlock]);
    } catch (error) {
      console.error("Error creating habit block:", error);
    }
  };

  const handleDragStart = (blockId: string) => {
    setDragBlockId(blockId);
    setDragHabitId(null);
  };

  const handleDragEnd = () => {
    setDragBlockId(null);
  };

  const handleHabitDragStart = (habitId: string) => {
    setDragHabitId(habitId);
    setDragBlockId(null);
  };

  const handleHabitDragEnd = () => {
    setDragHabitId(null);
  };

  const moveBlockToSlot = async (
    blockId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    try {
      await database.blocks.update(blockId, {
        location_type: "slot",
        day_index: dayIndex,
        time_index: timeIndex,
      });

      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? { ...b, location: { type: "slot", dayIndex, timeIndex } }
            : b
        )
      );
    } catch (error) {
      console.error("Error moving block:", error);
    }
  };

  const moveBlockToUnscheduled = async (blockId: string) => {
    try {
      await database.blocks.update(blockId, {
        location_type: "unscheduled",
        day_index: null,
        time_index: null,
      });

      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, location: { type: "unscheduled" } } : b
        )
      );
    } catch (error) {
      console.error("Error moving block:", error);
    }
  };

  const deleteBlock = async (blockId: string) => {
    try {
      await database.blocks.delete(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } catch (error) {
      console.error("Error deleting block:", error);
    }
  };

  const handleBlockDoubleClick = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    if (block.isHabitBlock) {
      deleteBlock(blockId);
    } else {
      moveBlockToUnscheduled(blockId);
    }
  };

  const toggleBlockCompletion = async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || !block.isHabitBlock || !block.habitId) return;

    const newCompleted = !block.completed;
    const delta = newCompleted ? 1 : -1;

    const habit = allHabits.find((h) => h.id === block.habitId);
    if (!habit) return;

    const nextCount = Math.max(0, habit.doneCount + delta);

    try {
      await database.blocks.update(blockId, { completed: newCompleted });

      if (newCompleted) {
        const now = new Date().toISOString();
        await database.habits.update(block.habitId, {
          done_count: nextCount,
          last_done_at: now,
        });

        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            habits: theme.habits.map((h) =>
              h.id === block.habitId
                ? { ...h, doneCount: nextCount, lastDoneAt: now }
                : h
            ),
          }))
        );

        const theme = themes.find((t) => t.habits.some((h) => h.id === block.habitId));
        if (theme && user) {
          const goals = await database.themeGoals.getByTheme(theme.id);
          const completedDate = now.split('T')[0];

          for (const goal of goals) {
            try {
              await database.themeGoals.recordCompletion(
                user.id,
                goal.id,
                block.habitId!,
                completedDate
              );
            } catch (error) {
              console.error("Error recording goal completion:", error);
            }
          }
        }
      } else {
        await database.habits.update(block.habitId, {
          done_count: nextCount,
        });

        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            habits: theme.habits.map((h) =>
              h.id === block.habitId ? { ...h, doneCount: nextCount } : h
            ),
          }))
        );
      }

      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, completed: newCompleted } : b
        )
      );
    } catch (error) {
      console.error("Error toggling completion:", error);
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setShowBucketConfig(false);

    if (mode === "buckets") {
      setBlocks((prev) =>
        prev.map((b) =>
          b.location.type === "slot" &&
          b.location.timeIndex >= bucketSlots.length
            ? { ...b, location: { type: "unscheduled" } }
            : b
        )
      );
    }
  };

  const updateBucketName = (index: number, name: string) => {
    setBucketSlots((prev) =>
      prev.map((slot, i) => (i === index ? name : slot))
    );
  };

  const addBucket = () => {
    setBucketSlots((prev) => [...prev, "New bucket"]);
  };

  const deleteBucket = (index: number) => {
    setBucketSlots((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const safeNext = next.length > 0 ? next : ["Time"];

      setBlocks((prevBlocks) =>
        prevBlocks.map((b) =>
          b.location.type === "slot" &&
          b.location.timeIndex >= safeNext.length
            ? { ...b, location: { type: "unscheduled" } }
            : b
        )
      );

      return safeNext;
    });
  };

  const slotLabels = viewMode === "hourly" ? hourlySlots : bucketSlots;

  const unscheduledBlocks = blocks.filter(
    (b) => b.location.type === "unscheduled"
  );

  const getBlocksForSlot = (dayIndex: number, timeIndex: number) => {
    return blocks.filter(
      (b) =>
        b.location.type === "slot" &&
        b.location.dayIndex === dayIndex &&
        b.location.timeIndex === timeIndex
    );
  };

  const handleSlotDrop = (
    e: React.DragEvent<HTMLTableCellElement>,
    dayIndex: number,
    timeIndex: number
  ) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");

    if (dragBlockId) {
      moveBlockToSlot(dragBlockId, dayIndex, timeIndex);
    } else if (dragHabitId) {
      createHabitBlockAtSlot(dragHabitId, dayIndex, timeIndex);
    }
  };

  const handleSlotDragOver = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  };

  const handleSlotDragLeave = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.currentTarget.classList.remove("drag-over");
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        fontSize: "18px",
        color: "#666"
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthSuccess={() => {}} />;
  }

  return (
    <>
      <div className="app">
        <div className="left-column">
          <div className="card">
            <div className="top-row">
              <h2>Habit themes</h2>
              <button
                type="button"
                className="secondary small-btn"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>

            {dataLoading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                Loading your data...
              </div>
            ) : (
              <>
                <div className="theme-list">
                  {themes.map((theme) => (
                    <div key={theme.id} className="theme-card">
                      <div className="theme-title-row">
                        <div className="theme-name">{theme.name}</div>
                        <button
                          type="button"
                          className="secondary small-btn"
                          onClick={() => {
                            setAddingThemeId(theme.id);
                            setNewThemeHabitName("");
                            setNewThemeHabitTarget(2);
                            setNewThemeHabitFrequency("weekly");
                          }}
                        >
                          Add habit
                        </button>
                      </div>

                      <div className="habit-list theme-habit-list">
                        {theme.habits.map((habit) => {
                          const isExpanded = expandedHabits.has(habit.id);
                          return (
                            <div key={habit.id} className="habit-item">
                              <button
                                onClick={() => toggleHabitExpanded(habit.id)}
                                style={{
                                  position: "absolute",
                                  left: "8px",
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: "16px",
                                  color: "#999",
                                  padding: "4px",
                                  lineHeight: 1,
                                  transition: "transform 0.2s ease"
                                }}
                                title={isExpanded ? "Collapse" : "Expand"}
                              >
                                <span style={{
                                  display: "inline-block",
                                  transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                  transition: "transform 0.2s ease"
                                }}>
                                  ▶
                                </span>
                              </button>

                              {!isExpanded && (
                                <div style={{
                                  paddingLeft: "28px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  width: "100%",
                                  minHeight: "48px"
                                }}>
                                  <div>
                                    <div style={{ fontWeight: 500, color: "#333", marginBottom: "2px" }}>
                                      {habit.name}
                                    </div>
                                    <div className="habit-meta">
                                      {habit.frequency === "none" ? "No target" : `Target: ${habit.targetPerWeek} / ${habit.frequency}`}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {isExpanded && (
                                <>
                                  <button
                                    className="habit-delete-x"
                                    onClick={() => deleteHabit(habit.id)}
                                    title="Delete habit"
                                  >
                                    ×
                                  </button>

                                  <div className="habit-main" style={{ paddingLeft: "24px" }}>
                                    <div
                                      className="habit-drag-area"
                                      draggable
                                      onDragStart={() => handleHabitDragStart(habit.id)}
                                      onDragEnd={handleHabitDragEnd}
                                      title="Drag to schedule this habit"
                                    >
                                      <span className="habit-name-draggable">{habit.name}</span>
                                    </div>

                                    <div className="habit-meta">
                                      {habit.frequency === "none" ? "No target" : `Target: ${habit.targetPerWeek} / ${habit.frequency}`}
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                      <span className="pill">Done: {habit.doneCount}</span>
                                      {habit.lastDoneAt && (
                                        <>
                                          <span style={{ fontSize: "12px", color: "#666" }}>
                                            Last: {formatTimeSince(habit.lastDoneAt)}
                                          </span>
                                          <button
                                            onClick={() => clearLastDoneAt(habit.id)}
                                            style={{
                                              fontSize: "11px",
                                              padding: "2px 6px",
                                              background: "#f0f0f0",
                                              border: "1px solid #ddd",
                                              borderRadius: "3px",
                                              cursor: "pointer",
                                              color: "#666"
                                            }}
                                            title="Clear last done timestamp"
                                          >
                                            Clear
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <div className="habit-actions">
                                    <button
                                      style={{ fontSize: 12 }}
                                      onClick={() => incrementHabit(habit.id)}
                                    >
                                      Done
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {addingThemeId === theme.id && (
                        <div className="add-habit-form">
                          <label className="small-label">Habit name</label>
                          <input
                            type="text"
                            value={newThemeHabitName}
                            onChange={(e) => setNewThemeHabitName(e.target.value)}
                            placeholder="e.g. Clean kitchen"
                          />
                          <label className="small-label">Frequency</label>
                          <select
                            value={newThemeHabitFrequency}
                            onChange={(e) => setNewThemeHabitFrequency(e.target.value as "weekly" | "monthly" | "none")}
                          >
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="none">No Target</option>
                          </select>
                          {newThemeHabitFrequency !== "none" && (
                            <>
                              <label className="small-label">Target</label>
                              <input
                                type="number"
                                min={1}
                                max={newThemeHabitFrequency === "weekly" ? 14 : 28}
                                value={newThemeHabitTarget}
                                onChange={(e) =>
                                  setNewThemeHabitTarget(
                                    parseInt(e.target.value || "0", 10)
                                  )
                                }
                              />
                            </>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button
                              type="button"
                              onClick={() => {
                                addHabitToTheme(
                                  theme.id,
                                  newThemeHabitName,
                                  newThemeHabitTarget,
                                  newThemeHabitFrequency
                                );
                                setAddingThemeId(null);
                                setNewThemeHabitName("");
                                setNewThemeHabitTarget(2);
                                setNewThemeHabitFrequency("weekly");
                              }}
                            >
                              Save habit
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setAddingThemeId(null);
                                setNewThemeHabitName("");
                                setNewThemeHabitTarget(2);
                                setNewThemeHabitFrequency("weekly");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      <ThemeGoals
                        themeId={theme.id}
                        userId={user.id}
                      />
                    </div>
                  ))}
                </div>

                <div className="add-theme-row">
                  <label className="small-label">Add a new theme</label>
                  <div className="inline">
                    <input
                      type="text"
                      placeholder="e.g. Spiritual, Social"
                      value={newThemeName}
                      onChange={(e) => setNewThemeName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={addTheme}
                    >
                      Add theme
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3>Unscheduled blocks</h3>

            <div className="blocks-panel">
              <div className="inline">
                <input
                  id="blockLabelInput"
                  type="text"
                  placeholder="e.g. Deep clean bathroom"
                  value={blockLabel}
                  onChange={(e) => setBlockLabel(e.target.value)}
                />
              </div>
              <div className="inline" style={{ marginTop: 4 }}>
                <input
                  id="blockHashtagInput"
                  type="text"
                  placeholder="Hashtag (optional)"
                  value={blockHashtag}
                  onChange={(e) => setBlockHashtag(e.target.value)}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => createBlock(blockLabel, false, undefined, blockHashtag)}
                  disabled={dataLoading}
                >
                  Add block
                </button>
              </div>

              <div className="block-list" style={{ marginTop: 8 }}>
                {unscheduledBlocks.map((block) => (
                  <div
                    key={block.id}
                    className={
                      "block" +
                      (block.isHabitBlock ? " habit-block" : "") +
                      (block.completed ? " block-done" : "")
                    }
                    draggable
                    onDragStart={() => handleDragStart(block.id)}
                    onDragEnd={handleDragEnd}
                  >
                    {block.label}
                    {block.hashtag && <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 12 }}>#{block.hashtag}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="right-column">
          <div className="card">
            <div className="top-row">
              <h2>Weekly Planner</h2>
              <span className="weekly-label">{getCurrentWeekRange()}</span>
            </div>

            <div className="view-toggle">
              <span className="small-label">View:</span>
              <label>
                <input
                  type="radio"
                  value="hourly"
                  checked={viewMode === "hourly"}
                  onChange={() => handleViewModeChange("hourly")}
                />
                Hourly
              </label>
              <label>
                <input
                  type="radio"
                  value="buckets"
                  checked={viewMode === "buckets"}
                  onChange={() => handleViewModeChange("buckets")}
                />
                Buckets
              </label>

              {viewMode === "buckets" && (
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setShowBucketConfig((prev) => !prev)}
                >
                  {showBucketConfig ? "Hide bucket settings" : "Customize buckets"}
                </button>
              )}
            </div>

            {viewMode === "buckets" && showBucketConfig && (
              <div className="bucket-config">
                {bucketSlots.map((name, idx) => (
                  <div key={idx} className="bucket-row">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => updateBucketName(idx, e.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary small-btn"
                      onClick={() => deleteBucket(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={addBucket}
                  style={{ marginTop: 4 }}
                >
                  Add bucket
                </button>
              </div>
            )}
          </div>

          <div className="planner-wrapper">
            <table className="planner">
              <thead>
                <tr>
                  <th className="time-col">Time</th>
                  {days.map((day) => (
                    <th key={day}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slotLabels.map((slotLabel, slotIndex) => (
                  <tr key={slotLabel + slotIndex}>
                    <th className="time-col">{slotLabel}</th>
                    {days.map((_, dayIndex) => {
                      const slotBlocks = getBlocksForSlot(dayIndex, slotIndex);
                      return (
                        <td
                          key={`${dayIndex}-${slotIndex}`}
                          className="slot"
                          onDragOver={handleSlotDragOver}
                          onDragLeave={handleSlotDragLeave}
                          onDrop={(e) =>
                            handleSlotDrop(e, dayIndex, slotIndex)
                          }
                        >
                          <div className="slot-inner">
                            {slotBlocks.map((block) => (
                              <div
                                key={block.id}
                                className={
                                  "block" +
                                  (block.isHabitBlock ? " habit-block" : "") +
                                  (block.completed ? " block-done" : "")
                                }
                                draggable
                                onDragStart={() => handleDragStart(block.id)}
                                onDragEnd={handleDragEnd}
                                onDoubleClick={() =>
                                  handleBlockDoubleClick(block.id)
                                }
                              >
                                {block.isHabitBlock ? (
                                  <label
                                    className="block-label-with-check"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!!block.completed}
                                      onChange={() =>
                                        toggleBlockCompletion(block.id)
                                      }
                                    />
                                    <span>
                                      {block.label}
                                      {block.hashtag && <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 10 }}> #{block.hashtag}</span>}
                                    </span>
                                  </label>
                                ) : (
                                  <>
                                    {block.label}
                                    {block.hashtag && <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 10 }}> #{block.hashtag}</span>}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button
          className="settings-btn"
          onClick={() => setShowCalendarSettings(true)}
          title="Calendar Settings"
        >
          📅
        </button>

        {showCalendarSettings && (
          <CalendarSettings
            userId={user?.id ?? null}
            onClose={() => setShowCalendarSettings(false)}
            onImportEvents={(importedBlocks) => {
              setBlocks((prev) => [...prev, ...importedBlocks]);
            }}
          />
        )}
      </div>
    </>
  );
};

export default App;
