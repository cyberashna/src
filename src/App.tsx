import React, { useState } from "react";
import "./App.css";

type Habit = {
  id: string;
  name: string;
  targetPerWeek: number;
  doneCount: number;
  lastDoneAt?: string; // ISO timestamp of last time it was done
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

type Block = {
  id: string;
  label: string;
  isHabitBlock: boolean;
  location: BlockLocation;
  habitId?: string; // link back to a habit (for habit blocks)
  completed?: boolean; // whether this block instance is checked off
  hashtag?: string; // hashtag for grouping blocks
};


const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createInitialThemes(): Theme[] {
  const creativityHabit: Habit = {
    id: makeId("h"),
    name: "Write poetry",
    targetPerWeek: 2,
    doneCount: 0,
    frequency: "weekly",
    // lastDoneAt is optional; starts undefined
  };

  return [
    { id: makeId("theme"), name: "Household", habits: [] },
    { id: makeId("theme"), name: "Creativity", habits: [creativityHabit] },
    { id: makeId("theme"), name: "Health & Movement", habits: [] },
    { id: makeId("theme"), name: "Learning & Growth", habits: [] },
  ];
}

type ViewMode = "hourly" | "buckets";

const App: React.FC = () => {
  const [themes, setThemes] = useState<Theme[]>(() => createInitialThemes());
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dragHabitId, setDragHabitId] = useState<string | null>(null);

  // view mode: hourly vs buckets
  const [viewMode, setViewMode] = useState<ViewMode>("hourly");
  const [bucketSlots, setBucketSlots] = useState<string[]>([
    "Early morning",
    "Morning",
    "Afternoon",
    "Evening",
    "Night",
  ]);
  const [showBucketConfig, setShowBucketConfig] = useState(false);

  // For adding a habit under a theme
  const [addingThemeId, setAddingThemeId] = useState<string | null>(null);
  const [newThemeHabitName, setNewThemeHabitName] = useState("");
  const [newThemeHabitTarget, setNewThemeHabitTarget] = useState<number>(2);
  const [newThemeHabitFrequency, setNewThemeHabitFrequency] = useState<"weekly" | "monthly" | "none">("weekly");

  // For adding a new theme
  const [newThemeName, setNewThemeName] = useState("");

  // For unscheduled generic blocks (non-habit tasks)
  const [blockLabel, setBlockLabel] = useState("");
  const [blockHashtag, setBlockHashtag] = useState("");

  // Flatten all habits (for helper functions)
  const allHabits = themes.flatMap((theme) =>
    theme.habits.map((habit) => ({
      ...habit,
      themeName: theme.name,
    }))
  );

  // ---- Habits & Themes ----
  const addHabitToTheme = (
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

    const habitId = makeId("h");
    const newHabit: Habit = {
      id: habitId,
      name: trimmed,
      targetPerWeek,
      doneCount: 0,
      frequency,
      // lastDoneAt starts undefined
    };

    setThemes((prevThemes) =>
      prevThemes.map((theme) =>
        theme.id === themeId
          ? { ...theme, habits: [...theme.habits, newHabit] }
          : theme
      )
    );
  };

  const incrementHabit = (habitId: string) => {
    setThemes((prevThemes) =>
      prevThemes.map((theme) => ({
        ...theme,
        habits: theme.habits.map((h) => {
          if (h.id !== habitId) return h;
          const now = new Date().toISOString();
          return {
            ...h,
            doneCount: h.doneCount + 1,
            lastDoneAt: now, // update recency when you press Done
          };
        }),
      }))
    );
  };

  const deleteHabit = (habitId: string) => {
    if (
      !window.confirm(
        "Delete this habit? Any linked habit blocks will become normal blocks."
      )
    )
      return;

    // remove from all themes
    setThemes((prevThemes) =>
      prevThemes.map((theme) => ({
        ...theme,
        habits: theme.habits.filter((h) => h.id !== habitId),
      }))
    );

    // unlink any blocks tied to this habit
    setBlocks((prevBlocks) =>
      prevBlocks.map((b) =>
        b.habitId === habitId
          ? { ...b, isHabitBlock: false, habitId: undefined, completed: false }
          : b
      )
    );
  };

  const resetHabitsForNewWeek = () => {
    if (!window.confirm("Reset all habit counts for a new week?")) return;

    setThemes((prevThemes) =>
      prevThemes.map((theme) => ({
        ...theme,
        habits: theme.habits.map((h) => ({
          ...h,
          doneCount: 0,
          // optionally also clear recency:
          // lastDoneAt: undefined,
        })),
      }))
    );

    setBlocks((prevBlocks) =>
      prevBlocks.map((b) => ({ ...b, completed: false }))
    );
  };

  const addTheme = () => {
    const trimmed = newThemeName.trim();
    if (!trimmed) {
      alert("Enter a theme name.");
      return;
    }

    const newTheme: Theme = {
      id: makeId("theme"),
      name: trimmed,
      habits: [],
    };

    setThemes((prev) => [...prev, newTheme]);
    setNewThemeName("");
  };

  // ---- Blocks ----
  const createBlock = (
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

    const newBlock: Block = {
      id: makeId("b"),
      label: trimmed,
      isHabitBlock,
      location: { type: "unscheduled" },
      habitId,
      completed: false,
      hashtag: hashtag?.trim() || undefined,
    };

    setBlocks((prev) => [...prev, newBlock]);
    setBlockLabel("");
    setBlockHashtag("");
  };

  // Used when dragging directly from a habit into a slot
  const createHabitBlockAtSlot = (
    habitId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    const habit = allHabits.find((h) => h.id === habitId);
    if (!habit) return;

    const newBlock: Block = {
      id: makeId("b"),
      label: `Habit: ${habit.name}`,
      isHabitBlock: true,
      location: { type: "slot", dayIndex, timeIndex },
      habitId: habit.id,
      completed: false,
      hashtag: habit.themeName,
    };

    setBlocks((prev) => [...prev, newBlock]);
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

  const moveBlockToSlot = (
    blockId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, location: { type: "slot", dayIndex, timeIndex } }
          : b
      )
    );
  };

  const moveBlockToUnscheduled = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, location: { type: "unscheduled" } } : b
      )
    );
  };

  const deleteBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
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

  // Toggle completion from the calendar checkbox (for habit blocks)
  const toggleBlockCompletion = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || !block.isHabitBlock || !block.habitId) return;

    const newCompleted = !block.completed;
    const delta = newCompleted ? 1 : -1;

    // Update block's completed state
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, completed: newCompleted } : b
      )
    );

    // Update linked habit's doneCount and lastDoneAt when checking ON
    setThemes((prevThemes) =>
      prevThemes.map((theme) => ({
        ...theme,
        habits: theme.habits.map((h) => {
          if (h.id !== block.habitId) return h;

          const nextCount = Math.max(0, h.doneCount + delta);

          if (newCompleted) {
            return {
              ...h,
              doneCount: nextCount,
              lastDoneAt: new Date().toISOString(),
            };
          }

          return { ...h, doneCount: nextCount };
        }),
      }))
    );
  };

  // ---- Planner (view mode + slots) ----
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setShowBucketConfig(false); // hide editor whenever view mode changes

    if (mode === "buckets") {
      // normalize any slots beyond bucket count back to unscheduled
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

  // ---- Render helpers ----
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

  return (
    <div className="app">
      {/* LEFT COLUMN: THEMES + HABITS + BLOCKS */}
      <div className="left-column">
        <div className="card">
          <div className="top-row">
            <h2>Habit themes</h2>
            <button
              type="button"
              className="secondary small-btn"
              onClick={resetHabitsForNewWeek}
            >
              New week (reset)
            </button>
          </div>
          <p className="small-label">
            Group habits by theme (Household, Creativity, etc). Each habit is
            tracked with a weekly or monthly target.
          </p>

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

                {theme.habits.length === 0 && (
                  <p className="small-label">No habits yet in this theme.</p>
                )}

                <div className="habit-list theme-habit-list">
  {theme.habits.map((habit) => {
    return (
      <div key={habit.id} className="habit-item">
        {/* Top-right X button */}
        <button
          className="habit-delete-x"
          onClick={() => deleteHabit(habit.id)}
          title="Delete habit"
        >
          ×
        </button>

        {/* MAIN HABIT CONTENT – only ONE habit-main */}
        <div className="habit-main">
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

          <span className="pill">Done: {habit.doneCount}</span>
        </div>

        {/* Done button on the right */}
        <div className="habit-actions">
          <button
            style={{ fontSize: 12 }}
            onClick={() => incrementHabit(habit.id)}
          >
            Done
          </button>
        </div>
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
        </div>

        <div className="card">
          <h3>Unscheduled blocks</h3>
          <p className="small-label" style={{ marginBottom: 6 }}>
            Create generic blocks (tasks, one-off plans), then drag them into
            the weekly planner. For habits, drag directly from the habit list.
          </p>

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
              {unscheduledBlocks.length === 0 && (
                <span className="small-label">No unscheduled blocks yet.</span>
              )}
            </div>

            <small className="small-label" style={{ marginTop: 4 }}>
              Double-click a regular block in the grid to send it back here. Habit blocks are deleted on double-click.
            </small>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: WEEKLY PLANNER */}
      <div className="right-column">
        <div className="card">
          <div className="top-row">
            <h2>Weekly Planner</h2>
            <span className="weekly-label">Drag blocks into time slots</span>
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

          <p className="small-label">
            Drag habit handles from the left to schedule them, then check them
            off from here when you’re done. This updates the habit counts on the
            left.
          </p>

          {viewMode === "buckets" && showBucketConfig && (
            <div className="bucket-config">
              <p className="small-label">
                Customize your time buckets (e.g. just “Morning” and
                “Evening”). Blocks stay attached to their row by position.
              </p>
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
    </div>
  );
};

export default App;
