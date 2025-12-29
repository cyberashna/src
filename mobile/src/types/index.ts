export type Habit = {
  id: string;
  theme_id: string;
  user_id: string;
  name: string;
  target_per_week: number;
  done_count: number;
  last_done_at?: string;
  frequency: 'weekly' | 'monthly' | 'none';
  created_at: string;
  updated_at: string;
};

export type Theme = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  habits?: Habit[];
};

export type BlockLocation =
  | { type: 'unscheduled' }
  | { type: 'slot'; day_index: number; time_index: number };

export type Block = {
  id: string;
  user_id: string;
  label: string;
  is_habit_block: boolean;
  habit_id?: string;
  location_type: 'unscheduled' | 'slot';
  day_index?: number;
  time_index?: number;
  completed: boolean;
  hashtag?: string;
  created_at: string;
  updated_at: string;
};

export type ViewMode = 'hourly' | 'buckets';
