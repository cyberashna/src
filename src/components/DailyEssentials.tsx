import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

type Essential = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
};

type Completion = {
  essential_id: string;
  date: string;
  completed: boolean;
};

type Props = {
  userId: string;
  weekStartDate: string;
  days: string[];
  todayDayIndex: number;
};

const DEFAULT_ESSENTIALS = [
  { name: "Medication", icon: "💊", sort_order: 0 },
  { name: "Water", icon: "💧", sort_order: 1 },
  { name: "Meals", icon: "🍽️", sort_order: 2 },
];

function getDateForDay(weekStartDate: string, dayIndex: number): string {
  const d = new Date(weekStartDate + "T00:00:00");
  d.setDate(d.getDate() + dayIndex);
  return d.toISOString().split("T")[0];
}

const DailyEssentials: React.FC<Props> = ({ userId, weekStartDate, days, todayDayIndex }) => {
  const [essentials, setEssentials] = useState<Essential[]>([]);
  const [completions, setCompletions] = useState<Map<string, boolean>>(new Map());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");

  const loadEssentials = useCallback(async () => {
    const { data } = await supabase
      .from("daily_essentials")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order");

    if (data && data.length > 0) {
      setEssentials(data);
    } else if (data && data.length === 0) {
      const inserted = [];
      for (const def of DEFAULT_ESSENTIALS) {
        const { data: row } = await supabase
          .from("daily_essentials")
          .insert({ user_id: userId, ...def })
          .select()
          .single();
        if (row) inserted.push(row);
      }
      setEssentials(inserted);
    }
  }, [userId]);

  const loadCompletions = useCallback(async () => {
    const dates = days.map((_, i) => getDateForDay(weekStartDate, i));
    const { data } = await supabase
      .from("daily_essential_completions")
      .select("*")
      .eq("user_id", userId)
      .in("date", dates);

    const map = new Map<string, boolean>();
    if (data) {
      data.forEach((c: Completion) => {
        map.set(`${c.essential_id}_${c.date}`, c.completed);
      });
    }
    setCompletions(map);
  }, [userId, weekStartDate, days]);

  useEffect(() => {
    loadEssentials();
  }, [loadEssentials]);

  useEffect(() => {
    if (essentials.length > 0) {
      loadCompletions();
    }
  }, [essentials, loadCompletions]);

  async function toggleCompletion(essentialId: string, dayIndex: number) {
    const date = getDateForDay(weekStartDate, dayIndex);
    const key = `${essentialId}_${date}`;
    const current = completions.get(key) || false;
    const next = !current;

    setCompletions((prev) => {
      const m = new Map(prev);
      m.set(key, next);
      return m;
    });

    await supabase
      .from("daily_essential_completions")
      .upsert(
        {
          essential_id: essentialId,
          user_id: userId,
          date,
          completed: next,
        },
        { onConflict: "essential_id,user_id,date" }
      );
  }

  async function addEssential() {
    if (!newName.trim()) return;
    const { data } = await supabase
      .from("daily_essentials")
      .insert({
        user_id: userId,
        name: newName.trim(),
        icon: newIcon.trim() || "✅",
        sort_order: essentials.length,
      })
      .select()
      .single();

    if (data) {
      setEssentials((prev) => [...prev, data]);
    }
    setNewName("");
    setNewIcon("");
    setAdding(false);
  }

  async function removeEssential(id: string) {
    await supabase.from("daily_essentials").delete().eq("id", id);
    setEssentials((prev) => prev.filter((e) => e.id !== id));
  }

  if (essentials.length === 0) return null;

  return (
    <>
      {essentials.map((essential, i) => {
        const isLast = i === essentials.length - 1;
        return (
          <tr key={essential.id} className="essentials-row">
            <th className="time-col essentials-label">
              <div className="essentials-label-inner">
                <span className="essentials-icon">{essential.icon}</span>
                <span className="essentials-name">{essential.name}</span>
                <button
                  className="essentials-remove-btn"
                  onClick={() => removeEssential(essential.id)}
                  title="Remove"
                >
                  &times;
                </button>
                {isLast && !adding && (
                  <button
                    className="essentials-inline-add"
                    onClick={() => setAdding(true)}
                    title="Add essential"
                  >
                    +
                  </button>
                )}
              </div>
            </th>
            {days.map((_, dayIndex) => {
              const date = getDateForDay(weekStartDate, dayIndex);
              const key = `${essential.id}_${date}`;
              const done = completions.get(key) || false;
              return (
                <td
                  key={dayIndex}
                  className={`slot essentials-cell${dayIndex === todayDayIndex ? " today-col" : ""}${done ? " essentials-done" : ""}`}
                  onClick={() => toggleCompletion(essential.id, dayIndex)}
                >
                  <div className="essentials-check">
                    {done ? (
                      <span className="essentials-check-on">✓</span>
                    ) : (
                      <span className="essentials-check-off" />
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        );
      })}
      {adding && (
        <tr className="essentials-row">
          <th className="time-col essentials-label">
            <div className="essentials-label-inner">
              <div className="essentials-add-form">
                <input
                  type="text"
                  placeholder="Icon"
                  value={newIcon}
                  onChange={(e) => setNewIcon(e.target.value)}
                  className="essentials-icon-input"
                  maxLength={2}
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="essentials-name-input"
                  onKeyDown={(e) => e.key === "Enter" && addEssential()}
                />
                <button className="essentials-add-confirm" onClick={addEssential}>+</button>
                <button className="essentials-add-cancel" onClick={() => setAdding(false)}>&times;</button>
              </div>
            </div>
          </th>
          {days.map((_, dayIndex) => (
            <td
              key={dayIndex}
              className={`slot essentials-cell essentials-summary-cell${dayIndex === todayDayIndex ? " today-col" : ""}`}
            />
          ))}
        </tr>
      )}
    </>
  );
};

export default DailyEssentials;
