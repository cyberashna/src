import React, { useEffect, useRef, useState } from "react";

type Habit = {
  id: string;
  name: string;
  subtasks: Habit[];
};

type HabitGroup = {
  id: string;
  name: string;
};

type Theme = {
  id: string;
  name: string;
  habits: Habit[];
  groups: HabitGroup[];
};

type Props = {
  blockId: string;
  primaryHabitId: string;
  themeId: string | undefined;
  themes: Theme[];
  creditedHabitIds: string[];
  completed: boolean;
  onSave: (blockId: string, creditedHabitIds: string[]) => void;
  onClose: () => void;
};

function flattenHabits(habits: Habit[]): Habit[] {
  return habits.flatMap((h) => [h, ...flattenHabits(h.subtasks)]);
}

const BlockCreditPopover: React.FC<Props> = ({
  blockId,
  primaryHabitId,
  themeId,
  themes,
  creditedHabitIds,
  onSave,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const theme = themes.find((t) => t.id === themeId);
  const allThemeHabits = theme ? flattenHabits(theme.habits) : [];
  const otherHabits = allThemeHabits.filter((h) => h.id !== primaryHabitId);

  const [selected, setSelected] = useState<Set<string>>(new Set(creditedHabitIds));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const toggle = (habitId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(habitId)) next.delete(habitId);
      else next.add(habitId);
      return next;
    });
  };

  const handleSave = () => {
    onSave(blockId, Array.from(selected));
    onClose();
  };

  if (!theme || otherHabits.length === 0) {
    return (
      <div ref={ref} style={popoverStyle}>
        <div style={{ fontSize: 12, color: "#666", padding: "4px 0" }}>
          No other habits in this theme.
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ ...btnStyle, background: "#ececf5", color: "#333", marginTop: 6 }}
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={popoverStyle} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontWeight: 600, fontSize: 12, color: "#333", marginBottom: 8 }}>
        Also counts for
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
        {otherHabits.map((h) => (
          <label
            key={h.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              cursor: "pointer",
              padding: "3px 4px",
              borderRadius: 4,
              background: selected.has(h.id) ? "#e7f7ff" : "transparent",
              transition: "background 0.12s ease",
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(h.id)}
              onChange={() => toggle(h.id)}
              style={{ accentColor: "#2563eb" }}
            />
            <span style={{ color: "#222" }}>{h.name}</span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button type="button" onClick={handleSave} style={btnStyle}>
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...btnStyle, background: "#ececf5", color: "#333" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

const popoverStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 4px)",
  left: 0,
  zIndex: 200,
  background: "#fff",
  border: "1px solid #dde3ed",
  borderRadius: 8,
  padding: "10px 12px",
  minWidth: 180,
  maxWidth: 240,
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
};

const btnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  background: "#2563eb",
  color: "#fff",
};

export default BlockCreditPopover;
