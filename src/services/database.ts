import { supabase } from "../lib/supabase";

export type Theme = {
  id: string;
  user_id: string;
  name: string;
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
  frequency: "weekly" | "monthly" | "none";
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
  created_at: string;
  updated_at: string;
};

export const database = {
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
      frequency: "weekly" | "monthly" | "none"
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
};
