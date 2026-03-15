import React from "react";

export type Suggestion = {
  label: string;
  hashtag: string;
  category: "physical" | "routine";
};

export const EVENT_SUGGESTIONS: Suggestion[] = [
  { label: "Morning Run", hashtag: "fitness", category: "physical" },
  { label: "Gym Workout", hashtag: "fitness", category: "physical" },
  { label: "Yoga", hashtag: "fitness", category: "physical" },
  { label: "Walk", hashtag: "fitness", category: "physical" },
  { label: "Swim", hashtag: "fitness", category: "physical" },
  { label: "Journaling", hashtag: "mindset", category: "routine" },
  { label: "Meditation", hashtag: "mindset", category: "routine" },
  { label: "Read", hashtag: "learning", category: "routine" },
  { label: "Plan Day", hashtag: "productivity", category: "routine" },
  { label: "Deep Work", hashtag: "productivity", category: "routine" },
  { label: "Email / Inbox", hashtag: "productivity", category: "routine" },
  { label: "Language Practice", hashtag: "learning", category: "routine" },
  { label: "Meal Prep", hashtag: "health", category: "routine" },
  { label: "Clean / Tidy", hashtag: "home", category: "routine" },
  { label: "Study", hashtag: "learning", category: "routine" },
  { label: "Side Project", hashtag: "productivity", category: "routine" },
  { label: "Stretch / Mobility", hashtag: "health", category: "routine" },
  { label: "Gratitude", hashtag: "mindset", category: "routine" },
  { label: "Evening Wind-Down", hashtag: "mindset", category: "routine" },
  { label: "Budget / Finance Review", hashtag: "finance", category: "routine" },
];

const CATEGORY_ICONS: Record<Suggestion["category"], string> = {
  physical: "🏃",
  routine: "📋",
};

type Props = {
  filter: string;
  onSelect: (suggestion: Suggestion) => void;
};

const EventSuggestions: React.FC<Props> = ({ filter, onSelect }) => {
  const lower = filter.toLowerCase();
  const filtered = filter
    ? EVENT_SUGGESTIONS.filter((s) => s.label.toLowerCase().includes(lower))
    : EVENT_SUGGESTIONS;

  if (filtered.length === 0) return null;

  const physical = filtered.filter((s) => s.category === "physical");
  const routine = filtered.filter((s) => s.category === "routine");

  return (
    <div className="event-suggestions">
      {physical.length > 0 && (
        <div className="suggestions-group">
          <div className="suggestions-group-label">
            {CATEGORY_ICONS.physical} Physical
          </div>
          <div className="suggestions-chips">
            {physical.map((s) => (
              <button
                key={s.label}
                type="button"
                className="suggestion-chip"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(s);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {routine.length > 0 && (
        <div className="suggestions-group">
          <div className="suggestions-group-label">
            {CATEGORY_ICONS.routine} Routine
          </div>
          <div className="suggestions-chips">
            {routine.map((s) => (
              <button
                key={s.label}
                type="button"
                className="suggestion-chip"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(s);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventSuggestions;
