import { useState } from "react";

type Block = {
  id: string;
  isHabitBlock: boolean;
  habitId?: string;
  completed?: boolean;
  location: { type: string };
};

type Habit = {
  id: string;
  name: string;
  targetPerWeek: number;
  frequency: string;
};

type Props = {
  blocks: Block[];
  habits: Habit[];
};

export function WeekSummary({ blocks, habits }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  const scheduledBlocks = blocks.filter((b) => b.location.type === "slot");
  const completedBlocks = scheduledBlocks.filter((b) => b.completed);
  const totalScheduled = scheduledBlocks.length;
  const totalCompleted = completedBlocks.length;
  const pct = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

  const habitStats = habits
    .filter((h) => h.frequency !== "none")
    .map((h) => {
      const done = blocks.filter(
        (b) => b.habitId === h.id && b.completed && b.location.type === "slot"
      ).length;
      return { name: h.name, done, target: h.targetPerWeek };
    });

  return (
    <div className="week-summary">
      <button
        className="week-summary-toggle"
        onClick={() => setCollapsed(!collapsed)}
        type="button"
      >
        <span className="week-summary-header">
          <span className="week-summary-title">Weekly Progress</span>
          <span className="week-summary-quick">
            {totalCompleted}/{totalScheduled} done ({pct}%)
          </span>
        </span>
        <span
          className="week-summary-chevron"
          style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
        >
          &#9660;
        </span>
      </button>

      {!collapsed && (
        <div className="week-summary-body">
          <div className="week-summary-bar-container">
            <div className="week-summary-bar" style={{ width: `${pct}%` }} />
          </div>

          {habitStats.length > 0 && (
            <div className="week-summary-habits">
              {habitStats.map((h) => {
                const hPct = h.target > 0 ? Math.min(100, Math.round((h.done / h.target) * 100)) : 0;
                const isComplete = h.done >= h.target;
                return (
                  <div key={h.name} className="week-summary-habit-row">
                    <span className="week-summary-habit-name">{h.name}</span>
                    <span className="week-summary-habit-count">
                      {h.done}/{h.target}
                    </span>
                    <div className="week-summary-habit-bar-container">
                      <div
                        className={`week-summary-habit-bar ${isComplete ? "complete" : ""}`}
                        style={{ width: `${hPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
