import React, { useState, useEffect } from "react";
import { database, type ThemeGoal, type ThemeGoalCompletion } from "../services/database";

type GoalType = "total_completions" | "unique_daily_habits" | "group_completion";

interface HabitGroupInfo {
  id: string;
  name: string;
}

interface HabitInfo {
  id: string;
  habitGroupId?: string;
}

interface ThemeGoalsProps {
  themeId: string;
  userId: string;
  groups: HabitGroupInfo[];
  habits: HabitInfo[];
}

export const ThemeGoals: React.FC<ThemeGoalsProps> = ({ themeId, userId, groups, habits }) => {
  const [goals, setGoals] = useState<ThemeGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>("total_completions");
  const [targetCount, setTargetCount] = useState(1);
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [description, setDescription] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [completionCounts, setCompletionCounts] = useState<Record<string, number>>({});

  const eligibleGroups = groups.filter(g =>
    habits.some(h => h.habitGroupId === g.id)
  );

  useEffect(() => {
    loadGoals();
  }, [themeId]);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const goalsData = await database.themeGoals.getByTheme(themeId);
      setGoals(goalsData);

      const counts: Record<string, number> = {};
      for (const goal of goalsData) {
        const startDate = goal.frequency === "daily"
          ? new Date().toISOString().split('T')[0]
          : getWeekStart();
        const completions = await database.themeGoals.getCompletionCount(goal.id, startDate);
        counts[goal.id] = computeCount(goal, completions);
      }
      setCompletionCounts(counts);
    } catch (error) {
      console.error("Error loading goals:", error);
    } finally {
      setLoading(false);
    }
  };

  const computeCount = (goal: ThemeGoal, completions: ThemeGoalCompletion[]): number => {
    if (goal.goal_type === "group_completion" && goal.habit_group_id) {
      const groupHabitIds = new Set(
        habits.filter(h => h.habitGroupId === goal.habit_group_id).map(h => h.id)
      );
      const uniqueGroupHabits = new Set(
        completions.filter(c => groupHabitIds.has(c.habit_id)).map(c => c.habit_id)
      );
      return uniqueGroupHabits.size;
    }
    if (goal.goal_type === "unique_daily_habits") {
      return new Set(completions.map(c => c.habit_id)).size;
    }
    return completions.length;
  };

  const getWeekStart = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().split('T')[0];
  };

  const handleAddGoal = async () => {
    if (!targetCount || targetCount <= 0) {
      alert("Enter a valid target count.");
      return;
    }
    if (goalType === "group_completion" && !selectedGroupId) {
      alert("Select a group for this goal.");
      return;
    }

    try {
      await database.themeGoals.create(
        userId,
        themeId,
        goalType,
        targetCount,
        frequency,
        description.trim() || undefined,
        goalType === "group_completion" ? selectedGroupId : undefined
      );

      setShowAddForm(false);
      setGoalType("total_completions");
      setTargetCount(1);
      setFrequency("daily");
      setDescription("");
      setSelectedGroupId("");
      await loadGoals();
    } catch (error) {
      console.error("Error creating goal:", error);
      alert("Failed to create goal");
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!window.confirm("Delete this goal?")) return;

    try {
      await database.themeGoals.delete(goalId);
      await loadGoals();
    } catch (error) {
      console.error("Error deleting goal:", error);
      alert("Failed to delete goal");
    }
  };

  const handleToggleActive = async (goal: ThemeGoal) => {
    try {
      await database.themeGoals.update(goal.id, { is_active: !goal.is_active });
      await loadGoals();
    } catch (error) {
      console.error("Error updating goal:", error);
    }
  };

  const getGoalProgress = (goal: ThemeGoal) => {
    const current = completionCounts[goal.id] || 0;
    const percentage = Math.min(100, (current / goal.target_count) * 100);
    return { current, percentage };
  };

  const getGoalTypeLabel = (goal: ThemeGoal) => {
    if (goal.goal_type === "group_completion") {
      const group = groups.find(g => g.id === goal.habit_group_id);
      return group ? `Group: ${group.name}` : "Group Completion";
    }
    return goal.goal_type === "total_completions"
      ? "Total completions"
      : "Unique daily habits";
  };

  if (loading && goals.length === 0) {
    return <div style={{ fontSize: "12px", color: "#999", padding: "8px" }}>Loading goals...</div>;
  }

  return (
    <div style={{ marginTop: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#555" }}>Theme Goals</h4>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            fontSize: "11px",
            padding: "4px 8px",
            background: "#f0f0f0",
            border: "1px solid #ddd",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          {showAddForm ? "Cancel" : "+ Add Goal"}
        </button>
      </div>

      {showAddForm && (
        <div style={{
          background: "#f9f9f9",
          padding: "12px",
          borderRadius: "6px",
          marginBottom: "12px",
          border: "1px solid #e0e0e0"
        }}>
          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "600", marginBottom: "4px", color: "#666" }}>
              Goal Type
            </label>
            <select
              value={goalType}
              onChange={(e) => {
                const val = e.target.value as GoalType;
                setGoalType(val);
                if (val !== "group_completion") setSelectedGroupId("");
              }}
              style={{
                width: "100%",
                padding: "6px",
                fontSize: "12px",
                border: "1px solid #ddd",
                borderRadius: "4px"
              }}
            >
              <option value="total_completions">Total Completions</option>
              <option value="unique_daily_habits">Unique Daily Habits</option>
              {eligibleGroups.length > 0 && (
                <option value="group_completion">Group Completion</option>
              )}
            </select>
          </div>

          {goalType === "group_completion" && (
            <div style={{ marginBottom: "8px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "600", marginBottom: "4px", color: "#666" }}>
                Group
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px",
                  fontSize: "12px",
                  border: "1px solid #ddd",
                  borderRadius: "4px"
                }}
              >
                <option value="">Select a group...</option>
                {eligibleGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "600", marginBottom: "4px", color: "#666" }}>
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
              style={{
                width: "100%",
                padding: "6px",
                fontSize: "12px",
                border: "1px solid #ddd",
                borderRadius: "4px"
              }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "600", marginBottom: "4px", color: "#666" }}>
              Target Count
            </label>
            <input
              type="number"
              min={1}
              value={targetCount}
              onChange={(e) => setTargetCount(parseInt(e.target.value || "1", 10))}
              style={{
                width: "100%",
                padding: "6px",
                fontSize: "12px",
                border: "1px solid #ddd",
                borderRadius: "4px"
              }}
            />
          </div>

          <div style={{ marginBottom: "8px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "600", marginBottom: "4px", color: "#666" }}>
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Complete at least one habit daily"
              style={{
                width: "100%",
                padding: "6px",
                fontSize: "12px",
                border: "1px solid #ddd",
                borderRadius: "4px"
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleAddGoal}
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "12px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "500"
            }}
          >
            Save Goal
          </button>
        </div>
      )}

      {goals.length === 0 && !showAddForm && (
        <div style={{ fontSize: "11px", color: "#999", padding: "8px", fontStyle: "italic" }}>
          No goals set for this theme
        </div>
      )}

      {goals.map((goal) => {
        const progress = getGoalProgress(goal);
        const isComplete = progress.current >= goal.target_count;

        return (
          <div
            key={goal.id}
            style={{
              background: isComplete ? "#e8f5e9" : "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: "6px",
              padding: "10px",
              marginBottom: "8px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "6px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "#333", marginBottom: "2px" }}>
                  {getGoalTypeLabel(goal)}
                </div>
                <div style={{ fontSize: "11px", color: "#666" }}>
                  {goal.frequency === "daily" ? "Daily" : "Weekly"} target: {goal.target_count}
                </div>
                {goal.description && (
                  <div style={{ fontSize: "11px", color: "#888", marginTop: "4px", fontStyle: "italic" }}>
                    {goal.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDeleteGoal(goal.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#999",
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "0 4px",
                  lineHeight: 1
                }}
                title="Delete goal"
              >
                x
              </button>
            </div>

            <div style={{ marginTop: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "11px", color: "#666", fontWeight: "500" }}>
                  Progress: {progress.current} / {goal.target_count}
                </span>
                <span style={{
                  fontSize: "11px",
                  color: isComplete ? "#2e7d32" : "#666",
                  fontWeight: "600"
                }}>
                  {Math.round(progress.percentage)}%
                </span>
              </div>
              <div style={{
                width: "100%",
                height: "6px",
                background: "#e0e0e0",
                borderRadius: "3px",
                overflow: "hidden"
              }}>
                <div style={{
                  width: `${progress.percentage}%`,
                  height: "100%",
                  background: isComplete ? "#4caf50" : "#2563eb",
                  transition: "width 0.3s ease"
                }} />
              </div>
            </div>

            <div style={{ marginTop: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "11px" }}>
                <input
                  type="checkbox"
                  checked={goal.is_active}
                  onChange={() => handleToggleActive(goal)}
                  style={{ marginRight: "6px" }}
                />
                <span style={{ color: "#666" }}>Active goal</span>
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
};
