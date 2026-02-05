import { supabase } from "../lib/supabase";

export type Theme = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
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

export const database = {
  habitGroups: {
    async getAll(userId: string) {
      const { data, error } = await supabase
        .from("habit_groups")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as HabitGroup[];
    },

    async getByTheme(themeId: string) {
      const { data, error } = await supabase
        .from("habit_groups")
        .select("*")
        .eq("theme_id", themeId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as HabitGroup[];
    },

    async create(
      userId: string,
      themeId: string,
      name: string,
      groupType: "strength_training" | "custom",
      linkBehavior: "adjacent_merge" | "none"
    ) {
      const { data, error } = await supabase
        .from("habit_groups")
        .insert({
          user_id: userId,
          theme_id: themeId,
          name,
          group_type: groupType,
          link_behavior: linkBehavior,
        })
        .select()
        .single();

      if (error) throw error;
      return data as HabitGroup;
    },

    async update(id: string, updates: Partial<HabitGroup>) {
      const { data, error } = await supabase
        .from("habit_groups")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as HabitGroup;
    },

    async delete(id: string) {
      const { error } = await supabase
        .from("habit_groups")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
  },

  themes: {
    async getAll(userId: string) {
      const { data, error } = await supabase
        .from("themes")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Theme[];
    },

    async create(userId: string, name: string) {
      const { data, error } = await supabase
        .from("themes")
        .insert({ user_id: userId, name })
        .select()
        .single();

      if (error) throw error;
      return data as Theme;
    },

    async update(id: string, name: string) {
      const { data, error } = await supabase
        .from("themes")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Theme;
    },

    async delete(id: string) {
      const { error } = await supabase
        .from("themes")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
  },

  habits: {
    async getAll(userId: string) {
      const { data, error } = await supabase
        .from("habits")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Habit[];
    },

    async create(
      userId: string,
      themeId: string,
      name: string,
      targetPerWeek: number,
      frequency: "daily" | "weekly" | "monthly" | "none",
      habitGroupId?: string
    ) {
      const { data, error } = await supabase
        .from("habits")
        .insert({
          user_id: userId,
          theme_id: themeId,
          name,
          target_per_week: targetPerWeek,
          frequency,
          done_count: 0,
          habit_group_id: habitGroupId ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Habit;
    },

    async update(id: string, updates: Partial<Habit>) {
      const { data, error } = await supabase
        .from("habits")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Habit;
    },

    async delete(id: string) {
      const { error } = await supabase
        .from("habits")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },

    async resetAll(userId: string) {
      const { error } = await supabase
        .from("habits")
        .update({
          done_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;
    },

    async clearLastDoneAt(id: string) {
      const { error } = await supabase
        .from("habits")
        .update({
          last_done_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
  },

  blocks: {
    async getAll(userId: string) {
      const { data, error } = await supabase
        .from("blocks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Block[];
    },

    async getForWeek(userId: string, weekStartDate: string) {
      const { data, error } = await supabase
        .from("blocks")
        .select("*")
        .eq("user_id", userId)
        .or(`week_start_date.eq.${weekStartDate},week_start_date.is.null`)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Block[];
    },

    async create(userId: string, block: Omit<Block, "id" | "user_id" | "created_at" | "updated_at">) {
      const { data, error } = await supabase
        .from("blocks")
        .insert({ ...block, user_id: userId })
        .select()
        .single();

      if (error) throw error;
      return data as Block;
    },

    async update(id: string, updates: Partial<Block>) {
      const { data, error } = await supabase
        .from("blocks")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Block;
    },

    async delete(id: string) {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },

    async resetCompletion(userId: string) {
      const { error } = await supabase
        .from("blocks")
        .update({
          completed: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;
    },
  },

  themeGoals: {
    async getAll(userId: string) {
      const { data, error } = await supabase
        .from("theme_goals")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as ThemeGoal[];
    },

    async getByTheme(themeId: string) {
      const { data, error } = await supabase
        .from("theme_goals")
        .select("*")
        .eq("theme_id", themeId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as ThemeGoal[];
    },

    async create(
      userId: string,
      themeId: string,
      goalType: "total_completions" | "unique_daily_habits" | "group_completion",
      targetCount: number,
      frequency: "daily" | "weekly",
      description?: string,
      habitGroupId?: string
    ) {
      const { data, error } = await supabase
        .from("theme_goals")
        .insert({
          user_id: userId,
          theme_id: themeId,
          goal_type: goalType,
          target_count: targetCount,
          frequency: frequency,
          description: description || null,
          habit_group_id: habitGroupId ?? null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ThemeGoal;
    },

    async update(id: string, updates: Partial<ThemeGoal>) {
      const { data, error } = await supabase
        .from("theme_goals")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as ThemeGoal;
    },

    async delete(id: string) {
      const { error } = await supabase.from("theme_goals").delete().eq("id", id);

      if (error) throw error;
    },

    async getCompletionCount(goalId: string, startDate: string) {
      const { data, error } = await supabase
        .from("theme_goal_completions")
        .select("*")
        .eq("theme_goal_id", goalId)
        .gte("completed_date", startDate);

      if (error) throw error;
      return data as ThemeGoalCompletion[];
    },

    async recordCompletion(
      userId: string,
      goalId: string,
      habitId: string,
      completedDate: string
    ) {
      const { data, error } = await supabase
        .from("theme_goal_completions")
        .insert({
          user_id: userId,
          theme_goal_id: goalId,
          habit_id: habitId,
          completed_date: completedDate,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ThemeGoalCompletion;
    },
  },

  workoutData: {
    async getByBlockId(blockId: string) {
      const { data, error } = await supabase
        .from("workout_data")
        .select("*")
        .eq("block_id", blockId)
        .maybeSingle();

      if (error) throw error;
      return data as WorkoutData | null;
    },

    async getByBlockIds(blockIds: string[]) {
      if (blockIds.length === 0) return [];

      const { data, error } = await supabase
        .from("workout_data")
        .select("*")
        .in("block_id", blockIds);

      if (error) throw error;
      return data as WorkoutData[];
    },

    async upsert(
      userId: string,
      blockId: string,
      sets: number | null,
      reps: number | null,
      weight: number | null,
      unit: "lbs" | "kg" | null
    ) {
      const { data, error } = await supabase
        .from("workout_data")
        .upsert(
          {
            block_id: blockId,
            user_id: userId,
            sets,
            reps,
            weight,
            unit,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "block_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return data as WorkoutData;
    },

    async delete(blockId: string) {
      const { error } = await supabase
        .from("workout_data")
        .delete()
        .eq("block_id", blockId);

      if (error) throw error;
    },
  },

  sessionGroups: {
    async getAll(userId: string) {
      const { data, error } = await supabase
        .from("session_groups")
        .select("*")
        .eq("user_id", userId)
        .order("week_start_date", { ascending: false })
        .order("session_number", { ascending: true });

      if (error) throw error;
      return data as SessionGroup[];
    },

    async getForWeek(userId: string, weekStartDate: string) {
      const { data, error } = await supabase
        .from("session_groups")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start_date", weekStartDate)
        .order("session_number", { ascending: true });

      if (error) throw error;
      return data as SessionGroup[];
    },

    async create(
      userId: string,
      weekStartDate: string,
      sessionNumber: number,
      accentColor: string,
      customName?: string
    ) {
      const { data, error } = await supabase
        .from("session_groups")
        .insert({
          user_id: userId,
          week_start_date: weekStartDate,
          session_number: sessionNumber,
          accent_color: accentColor,
          custom_name: customName || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SessionGroup;
    },

    async update(id: string, updates: Partial<SessionGroup>) {
      const { data, error } = await supabase
        .from("session_groups")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as SessionGroup;
    },

    async delete(id: string) {
      const { error } = await supabase
        .from("session_groups")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },

    async getNextSessionNumber(userId: string, weekStartDate: string) {
      const { data, error } = await supabase
        .from("session_groups")
        .select("session_number")
        .eq("user_id", userId)
        .eq("week_start_date", weekStartDate)
        .order("session_number", { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return 1;
      return data[0].session_number + 1;
    },
  },
};
