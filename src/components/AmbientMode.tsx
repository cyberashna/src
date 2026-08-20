import { useEffect, useMemo, useState } from "react";
import type { Block } from "../App";
import type { RoutineTab } from "../services/routineNotes";

export type AmbientLayout = "focus" | "routine" | "desk";

export type AmbientSettings = {
  layout: AmbientLayout;
  routineId: string;
  showClock: boolean;
  showRoutine: boolean;
  showNextBlock: boolean;
  showNextTask: boolean;
  showQuickNote: boolean;
  showWaiting: boolean;
  keepAwake: boolean;
};

export type AmbientTask = {
  label: string;
  sourceLabel: string;
  blockId: string;
  taskId?: string;
};

type Props = {
  settings: AmbientSettings;
  routines: RoutineTab[];
  activeRoutine: RoutineTab | null;
  todayDate: string;
  todayLabel: string;
  weekLabel: string;
  nextBlock: Block | null;
  nextTask: AmbientTask | null;
  waitingCount: number;
  quickNote: string;
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
  wakeLockError: string;
  onSettingsChange: (updates: Partial<AmbientSettings>) => void;
  onQuickNoteChange: (value: string) => void;
  onQuickNoteSubmit: () => void;
  onToggleRoutineItem: (routineId: string, itemId: string) => void;
  onCompleteRoutine: (routineId: string) => void;
  onResetRoutine: (routineId: string) => void;
  onCompleteNextBlock: (blockId: string) => void;
  onCompleteNextTask: (task: AmbientTask) => void;
  onOpenPlanner: () => void;
  onOpenRoutines: () => void;
  onClose: () => void;
};

const layoutLabels: Record<AmbientLayout, string> = {
  focus: "Focus",
  routine: "Routine",
  desk: "Desk",
};

const stripBlockPrefix = (label: string) => label.replace(/^Habit:\s*/i, "").trim();

export default function AmbientMode({
  settings,
  routines,
  activeRoutine,
  todayDate,
  todayLabel,
  weekLabel,
  nextBlock,
  nextTask,
  waitingCount,
  quickNote,
  wakeLockSupported,
  wakeLockActive,
  wakeLockError,
  onSettingsChange,
  onQuickNoteChange,
  onQuickNoteSubmit,
  onToggleRoutineItem,
  onCompleteRoutine,
  onResetRoutine,
  onCompleteNextBlock,
  onCompleteNextTask,
  onOpenPlanner,
  onOpenRoutines,
  onClose,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const completedRoutineItemIds = useMemo(
    () => new Set(activeRoutine?.completedByDate[todayDate] ?? []),
    [activeRoutine, todayDate]
  );
  const routineDoneCount =
    activeRoutine?.items.filter((item) => completedRoutineItemIds.has(item.id)).length ?? 0;
  const routineTotalCount = activeRoutine?.items.length ?? 0;

  const timeLabel = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const dateLabel = now.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className={`ambient-mode ambient-mode--${settings.layout}`}>
      <div className="ambient-shell">
        <header className="ambient-topbar">
          <div>
            <span className="ambient-eyebrow">Ambient Mode</span>
            <strong>{todayLabel}</strong>
          </div>
          <div className="ambient-top-actions">
            <button type="button" onClick={onOpenPlanner}>Planner</button>
            <button type="button" onClick={onOpenRoutines}>Routines</button>
            <button
              type="button"
              className={settingsOpen ? "active" : ""}
              onClick={() => setSettingsOpen((value) => !value)}
            >
              Settings
            </button>
            <button type="button" onClick={onClose}>Exit</button>
          </div>
        </header>

        {settings.showClock && (
          <section className="ambient-clock-panel">
            <span>{dateLabel}</span>
            <strong>{timeLabel}</strong>
            <em>{weekLabel}</em>
          </section>
        )}

        <main className="ambient-grid">
          {settings.showNextBlock && (
            <section className="ambient-panel ambient-panel--next">
              <div className="ambient-panel-label">Next block</div>
              {nextBlock ? (
                <>
                  <strong>{stripBlockPrefix(nextBlock.label)}</strong>
                  <span>{nextBlock.hashtag ? `#${nextBlock.hashtag}` : "Scheduled for today"}</span>
                  <button type="button" onClick={() => onCompleteNextBlock(nextBlock.id)}>
                    Done
                  </button>
                </>
              ) : (
                <>
                  <strong>Nothing open</strong>
                  <span>Today is clear for the moment.</span>
                </>
              )}
            </section>
          )}

          {settings.showNextTask && (
            <section className="ambient-panel ambient-panel--task">
              <div className="ambient-panel-label">Next task</div>
              {nextTask ? (
                <>
                  <strong>{nextTask.label}</strong>
                  <span>{nextTask.sourceLabel}</span>
                  <button type="button" onClick={() => onCompleteNextTask(nextTask)}>
                    Done
                  </button>
                </>
              ) : (
                <>
                  <strong>No open task</strong>
                  <span>Tasks will appear here when a block has checklist items.</span>
                </>
              )}
            </section>
          )}

          {settings.showRoutine && (
            <section className="ambient-panel ambient-panel--routine">
              <div className="ambient-panel-heading">
                <div>
                  <div className="ambient-panel-label">Routine checklist</div>
                  <strong>{activeRoutine?.name ?? "No routine yet"}</strong>
                </div>
                <span>{routineDoneCount}/{routineTotalCount}</span>
              </div>
              {activeRoutine && activeRoutine.items.length > 0 ? (
                <>
                  <div className="ambient-routine-list">
                    {activeRoutine.items.slice(0, 8).map((item) => {
                      const done = completedRoutineItemIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={done ? "done" : ""}
                          onClick={() => onToggleRoutineItem(activeRoutine.id, item.id)}
                        >
                          <span>{done ? "✓" : ""}</span>
                          <strong>{item.label}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="ambient-inline-actions">
                    <button
                      type="button"
                      onClick={() => onCompleteRoutine(activeRoutine.id)}
                      disabled={routineTotalCount === 0 || routineDoneCount === routineTotalCount}
                    >
                      Complete all
                    </button>
                    <button
                      type="button"
                      onClick={() => onResetRoutine(activeRoutine.id)}
                      disabled={routineDoneCount === 0}
                    >
                      Reset
                    </button>
                  </div>
                </>
              ) : (
                <span>No routine items here yet.</span>
              )}
            </section>
          )}

          {settings.showQuickNote && (
            <section className="ambient-panel ambient-panel--note">
              <div className="ambient-panel-label">Quick note</div>
              <form
                className="ambient-note-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onQuickNoteSubmit();
                }}
              >
                <textarea
                  value={quickNote}
                  onChange={(event) => onQuickNoteChange(event.target.value)}
                  placeholder="Capture a thought..."
                  rows={4}
                />
                <div className="ambient-note-controls">
                  <span>Saved to Waiting</span>
                  <button type="submit" disabled={!quickNote.trim()}>
                    Save note
                  </button>
                </div>
              </form>
            </section>
          )}

          {settings.showWaiting && (
            <section className="ambient-panel ambient-panel--waiting">
              <div className="ambient-panel-label">Waiting</div>
              <strong>{waitingCount}</strong>
              <span>{waitingCount === 1 ? "block waiting" : "blocks waiting"}</span>
              <button type="button" onClick={onOpenPlanner}>Open planner</button>
            </section>
          )}
        </main>

        {settingsOpen && (
          <aside className="ambient-settings-panel">
            <div className="ambient-settings-header">
              <strong>Customize Ambient</strong>
              <button type="button" onClick={() => setSettingsOpen(false)}>Done</button>
            </div>

            <label>
              <span>Layout</span>
              <select
                value={settings.layout}
                onChange={(event) => onSettingsChange({ layout: event.target.value as AmbientLayout })}
              >
                {Object.entries(layoutLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Routine</span>
              <select
                value={routines.some((routine) => routine.id === settings.routineId) ? settings.routineId : "auto"}
                onChange={(event) => onSettingsChange({ routineId: event.target.value })}
              >
                <option value="auto">Auto</option>
                {routines.map((routine) => (
                  <option key={routine.id} value={routine.id}>{routine.name}</option>
                ))}
              </select>
            </label>

            <div className="ambient-toggle-list">
              {([
                ["showClock", "Clock and date"],
                ["showRoutine", "Routine checklist"],
                ["showNextBlock", "Next block"],
                ["showNextTask", "Next task"],
                ["showQuickNote", "Quick note"],
                ["showWaiting", "Waiting count"],
                ["keepAwake", "Keep screen awake"],
              ] as const).map(([key, label]) => (
                <label key={key} className="ambient-toggle-row">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(event) => onSettingsChange({ [key]: event.target.checked })}
                    disabled={key === "keepAwake" && !wakeLockSupported}
                  />
                </label>
              ))}
            </div>

            <div className="ambient-wake-note">
              {wakeLockSupported
                ? settings.keepAwake
                  ? wakeLockActive
                    ? "Screen awake is on while Ambient Mode is open."
                    : wakeLockError || "Trying to keep the screen awake..."
                  : "Screen awake is off."
                : "Screen awake is not available in this browser."}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
