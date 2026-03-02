export type Theme = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  habits?: Habit[];
};

export type HabitGroup = {
  id: string;
  theme_id: string;
  user_id: string;
  name: string;
  group_type: "strength_training" | "custom";
  link_behavior: "adjacent_merge" | "none";
  created_at: string;
  updated_at: string;
};

export type Habit = {
  id: string;
  theme_id: string;
  user_id: string;
  name: string;
  target_per_week: number;
  done_count: number;
  last_done_at: string | null;
  frequency: "daily" | "weekly" | "monthly" | "none";
  habit_group_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Block = {
  id: string;
  user_id: string;
  label: string;
  is_habit_block: boolean;
  habit_id: string | null;
  location_type: "unscheduled" | "slot";
  day_index: number | null;
  time_index: number | null;
  completed: boolean;
  hashtag: string | null;
  week_start_date: string | null;
  linked_block_id: string | null;
  is_linked_group: boolean;
  workout_submitted: boolean;
  session_group_id: string | null;
  is_daily_template: boolean;
  daily_template_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ThemeGoal = {
  id: string;
  theme_id: string;
  user_id: string;
  goal_type: "total_completions" | "unique_daily_habits" | "group_completion";
  target_count: number;
  frequency: "daily" | "weekly";
  description: string | null;
  habit_group_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ThemeGoalCompletion = {
  id: string;
  theme_goal_id: string;
  user_id: string;
  habit_id: string;
  completed_date: string;
  completed_at: string;
  created_at: string;
};

export type WorkoutData = {
  id: string;
  block_id: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  unit: "lbs" | "kg" | null;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type SessionGroup = {
  id: string;
  user_id: string;
  week_start_date: string;
  session_number: number;
  custom_name: string | null;
  accent_color: string;
  created_at: string;
};

export type HabitNote = {
  id: string;
  habit_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type WorkoutHistoryEntry = {
  id: string;
  habit_id: string;
  user_id: string;
  block_id: string | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  unit: "lbs" | "kg" | null;
  completed_date: string;
  created_at: string;
};

export type BlockLocation =
  | { type: 'unscheduled' }
  | { type: 'slot'; day_index: number; time_index: number };

export type ViewMode = 'hourly' | 'buckets';
