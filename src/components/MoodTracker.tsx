import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

type MoodEntry = {
  date: string;
  mood: string;
};

type Props = {
  userId: string;
  weekStartDate: string;
  days: string[];
  todayDayIndex: number;
};

const MOOD_OPTIONS = [
  { emoji: "😄", label: "Great" },
  { emoji: "🙂", label: "Good" },
  { emoji: "😐", label: "Okay" },
  { emoji: "😔", label: "Low" },
  { emoji: "😤", label: "Stressed" },
  { emoji: "😴", label: "Tired" },
];

function getDateForDay(weekStartDate: string, dayIndex: number): string {
  const d = new Date(weekStartDate + "T00:00:00");
  d.setDate(d.getDate() + dayIndex);
  return d.toISOString().split("T")[0];
}

const MoodTracker: React.FC<Props> = ({ userId, weekStartDate, days, todayDayIndex }) => {
  const [moods, setMoods] = useState<Map<string, string>>(new Map());
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  const loadMoods = useCallback(async () => {
    const dates = days.map((_, i) => getDateForDay(weekStartDate, i));
    const { data } = await supabase
      .from("daily_moods")
      .select("*")
      .eq("user_id", userId)
      .in("date", dates);

    const map = new Map<string, string>();
    if (data) {
      data.forEach((m: MoodEntry) => {
        map.set(m.date, m.mood);
      });
    }
    setMoods(map);
  }, [userId, weekStartDate, days]);

  useEffect(() => {
    loadMoods();
  }, [loadMoods]);

  useEffect(() => {
    if (openPicker === null) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".mood-picker-popup") && !target.closest(".mood-cell-btn")) {
        setOpenPicker(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openPicker]);

  async function selectMood(dayIndex: number, emoji: string) {
    const date = getDateForDay(weekStartDate, dayIndex);
    const current = moods.get(date);

    if (current === emoji) {
      setMoods((prev) => {
        const m = new Map(prev);
        m.delete(date);
        return m;
      });
      await supabase
        .from("daily_moods")
        .delete()
        .eq("user_id", userId)
        .eq("date", date);
    } else {
      setMoods((prev) => {
        const m = new Map(prev);
        m.set(date, emoji);
        return m;
      });
      await supabase
        .from("daily_moods")
        .upsert(
          {
            user_id: userId,
            date,
            mood: emoji,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,date" }
        );
    }

    setOpenPicker(null);
  }

  return (
    <tr className="mood-row">
      <th className="time-col mood-label">
        <span className="mood-label-text">Mood</span>
      </th>
      {days.map((_, dayIndex) => {
        const date = getDateForDay(weekStartDate, dayIndex);
        const mood = moods.get(date);
        const isOpen = openPicker === dayIndex;
        return (
          <td
            key={dayIndex}
            className={`slot mood-cell${dayIndex === todayDayIndex ? " today-col" : ""}`}
          >
            <button
              className={`mood-cell-btn${mood ? " has-mood" : ""}`}
              onClick={() => setOpenPicker(isOpen ? null : dayIndex)}
            >
              {mood || (
                <span className="mood-placeholder">+</span>
              )}
            </button>
            {isOpen && (
              <div className="mood-picker-popup">
                {MOOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.emoji}
                    className={`mood-option${mood === opt.emoji ? " selected" : ""}`}
                    onClick={() => selectMood(dayIndex, opt.emoji)}
                    title={opt.label}
                  >
                    {opt.emoji}
                  </button>
                ))}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
};

export default MoodTracker;
