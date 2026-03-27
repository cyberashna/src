import React, { useState, useEffect, useCallback } from "react";
import { database, BlockActivityLog } from "../services/database";

type Habit = {
  id: string;
  name: string;
  targetPerWeek: number;
  doneCount: number;
  frequency: string;
  subtasks: Habit[];
};

type Theme = {
  id: string;
  name: string;
  habits: Habit[];
};

type Props = {
  userId: string;
  themes: Theme[];
  onClose: () => void;
};

type HabitStat = {
  habitId: string;
  habitName: string;
  themeName: string;
  totalCompletions: number;
  directCount: number;
  creditedCount: number;
  byDayOfWeek: number[];
  topDays: number[];
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function flattenHabits(habits: Habit[], themeName: string): Array<Habit & { themeName: string }> {
  return habits.flatMap((h) => [{ ...h, themeName }, ...flattenHabits(h.subtasks, themeName)]);
}

const AnalyticsDashboard: React.FC<Props> = ({ userId, themes, onClose }) => {
  const [logs, setLogs] = useState<BlockActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [rangeWeeks, setRangeWeeks] = useState<4 | 8 | 12>(4);

  const allHabits = themes.flatMap((t) => flattenHabits(t.habits, t.name));

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await database.blockActivityLogs.getByUser(userId);
      setLogs(data);
    } catch (e) {
      console.error("Error loading analytics:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const cutoffDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeWeeks * 7);
    return d.toISOString();
  })();

  const filteredLogs = logs.filter((l) => l.completed_at >= cutoffDate);

  const habitStats: HabitStat[] = allHabits.map((h) => {
    const habitLogs = filteredLogs.filter((l) => l.habit_id === h.id);
    const byDayOfWeek = Array(7).fill(0);
    habitLogs.forEach((l) => {
      if (l.day_index !== null && l.day_index >= 0 && l.day_index <= 6) {
        byDayOfWeek[l.day_index]++;
      }
    });
    const topDays = byDayOfWeek
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 2)
      .map(({ i }) => i);

    return {
      habitId: h.id,
      habitName: h.name,
      themeName: h.themeName,
      totalCompletions: habitLogs.length,
      directCount: habitLogs.length,
      creditedCount: 0,
      byDayOfWeek,
      topDays,
    };
  }).filter((s) => s.totalCompletions > 0)
    .sort((a, b) => b.totalCompletions - a.totalCompletions);

  const selectedStat = selectedHabitId
    ? habitStats.find((s) => s.habitId === selectedHabitId) ?? null
    : null;

  const maxCompletions = Math.max(...habitStats.map((s) => s.totalCompletions), 1);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111" }}>Analytics</h2>
            <span style={{ fontSize: 12, color: "#666", marginTop: 2, display: "block" }}>
              Habit completion patterns
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {([4, 8, 12] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setRangeWeeks(w)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    background: rangeWeeks === w ? "#2563eb" : "#ececf5",
                    color: rangeWeeks === w ? "#fff" : "#333",
                    fontWeight: rangeWeeks === w ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {w}w
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
                color: "#999",
                padding: "0 4px",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>
            Loading...
          </div>
        ) : habitStats.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>
            No completions recorded yet. Complete some habit blocks to see analytics.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 0, minHeight: 0, flex: 1, overflow: "hidden" }}>
            <div style={listPanelStyle}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                Habits — last {rangeWeeks} weeks
              </div>
              {habitStats.map((stat) => {
                const pct = Math.round((stat.totalCompletions / maxCompletions) * 100);
                const isSelected = selectedHabitId === stat.habitId;
                return (
                  <div
                    key={stat.habitId}
                    onClick={() => setSelectedHabitId(isSelected ? null : stat.habitId)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: isSelected ? "#eff6ff" : "transparent",
                      border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                      marginBottom: 2,
                      transition: "all 0.12s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>{stat.habitName}</span>
                        <span style={{ fontSize: 11, color: "#888", marginLeft: 6 }}>{stat.themeName}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
                        {stat.totalCompletions}
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: "#2563eb",
                          borderRadius: 2,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={detailPanelStyle}>
              {selectedStat ? (
                <HabitDetail stat={selectedStat} />
              ) : (
                <OverviewPanel stats={habitStats} rangeWeeks={rangeWeeks} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

type DetailProps = {
  stat: HabitStat;
};

const HabitDetail: React.FC<DetailProps> = ({ stat }) => {
  const maxDay = Math.max(...stat.byDayOfWeek, 1);

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 700, color: "#111" }}>
          {stat.habitName}
        </h3>
        <span style={{ fontSize: 12, color: "#888" }}>{stat.themeName}</span>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total completions" value={stat.totalCompletions} color="#2563eb" />
        <StatCard
          label="Best days"
          value={stat.topDays.length > 0 ? stat.topDays.map((i) => DAY_NAMES[i]).join(", ") : "—"}
          color="#059669"
          small
        />
      </div>

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#555" }}>
        Completions by day of week
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 80 }}>
        {stat.byDayOfWeek.map((count, i) => {
          const h = maxDay > 0 ? Math.round((count / maxDay) * 68) : 0;
          const isTop = stat.topDays.includes(i);
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 10, color: "#888", fontWeight: count > 0 ? 600 : 400 }}>
                {count > 0 ? count : ""}
              </span>
              <div
                style={{
                  width: "100%",
                  height: Math.max(h, count > 0 ? 4 : 0),
                  background: isTop ? "#2563eb" : count > 0 ? "#93c5fd" : "#e5e7eb",
                  borderRadius: "3px 3px 0 0",
                  transition: "height 0.3s ease",
                }}
              />
              <span style={{ fontSize: 10, color: isTop ? "#2563eb" : "#888", fontWeight: isTop ? 700 : 400 }}>
                {DAY_NAMES[i].slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

type OverviewProps = {
  stats: HabitStat[];
  rangeWeeks: number;
};

const OverviewPanel: React.FC<OverviewProps> = ({ stats, rangeWeeks }) => {
  const totalCompletions = stats.reduce((s, h) => s + h.totalCompletions, 0);
  const avgPerWeek = rangeWeeks > 0 ? (totalCompletions / rangeWeeks).toFixed(1) : "0";
  const mostConsistent = stats.reduce<HabitStat | null>((best, s) => {
    if (!best) return s;
    const daysWithActivity = s.byDayOfWeek.filter((v) => v > 0).length;
    const bestDays = best.byDayOfWeek.filter((v) => v > 0).length;
    return daysWithActivity > bestDays ? s : best;
  }, null);

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 600, color: "#555" }}>
        Overview — last {rangeWeeks} weeks
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Total completions" value={totalCompletions} color="#2563eb" />
        <StatCard label="Avg / week" value={avgPerWeek} color="#059669" />
        <StatCard label="Active habits" value={stats.length} color="#d97706" />
      </div>
      {mostConsistent && (
        <div style={{
          padding: "10px 12px",
          background: "#f0fdf4",
          borderRadius: 8,
          border: "1px solid #bbf7d0",
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
            Most consistent
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{mostConsistent.habitName}</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
            Active on {mostConsistent.byDayOfWeek.filter((v) => v > 0).length} of 7 days
          </div>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>
        Click a habit on the left to see its daily breakdown.
      </div>
    </div>
  );
};

type StatCardProps = {
  label: string;
  value: number | string;
  color: string;
  small?: boolean;
};

const StatCard: React.FC<StatCardProps> = ({ label, value, color, small }) => (
  <div style={{
    flex: 1,
    minWidth: 80,
    padding: "10px 12px",
    background: "#fafafa",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
  }}>
    <div style={{ fontSize: small ? 14 : 20, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{label}</div>
  </div>
);

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  width: "min(90vw, 760px)",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  padding: "16px 20px",
  borderBottom: "1px solid #e5e7eb",
};

const listPanelStyle: React.CSSProperties = {
  width: 260,
  minWidth: 260,
  borderRight: "1px solid #e5e7eb",
  padding: "12px 10px",
  overflowY: "auto",
};

const detailPanelStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
};

export default AnalyticsDashboard;
