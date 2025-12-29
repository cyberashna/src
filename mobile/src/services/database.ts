import { supabase } from '../lib/supabase';
import { Theme, Habit, Block } from '../types';

export const databaseService = {
  async fetchThemes(userId: string): Promise<Theme[]> {
    const { data, error } = await supabase
      .from('themes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async fetchHabits(userId: string): Promise<Habit[]> {
    const { data, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async fetchBlocks(userId: string): Promise<Block[]> {
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createTheme(userId: string, name: string): Promise<Theme> {
    const { data, error } = await supabase
      .from('themes')
      .insert([{ user_id: userId, name }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async createHabit(
    userId: string,
    themeId: string,
    name: string,
    targetPerWeek: number,
    frequency: 'weekly' | 'monthly' | 'none'
  ): Promise<Habit> {
    const { data, error } = await supabase
      .from('habits')
      .insert([
        {
          user_id: userId,
          theme_id: themeId,
          name,
          target_per_week: targetPerWeek,
          frequency,
          done_count: 0,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateHabit(habitId: string, updates: Partial<Habit>): Promise<void> {
    const { error } = await supabase
      .from('habits')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', habitId);

    if (error) throw error;
  },

  async deleteHabit(habitId: string): Promise<void> {
    const { error } = await supabase.from('habits').delete().eq('id', habitId);

    if (error) throw error;
  },

  async createBlock(
    userId: string,
    label: string,
    isHabitBlock: boolean,
    habitId?: string,
    hashtag?: string
  ): Promise<Block> {
    const { data, error } = await supabase
      .from('blocks')
      .insert([
        {
          user_id: userId,
          label,
          is_habit_block: isHabitBlock,
          habit_id: habitId,
          location_type: 'unscheduled',
          completed: false,
          hashtag,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateBlock(blockId: string, updates: Partial<Block>): Promise<void> {
    const { error } = await supabase
      .from('blocks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', blockId);

    if (error) throw error;
  },

  async deleteBlock(blockId: string): Promise<void> {
    const { error } = await supabase.from('blocks').delete().eq('id', blockId);

    if (error) throw error;
  },

  async resetHabitsForNewWeek(userId: string): Promise<void> {
    const { error: habitsError } = await supabase
      .from('habits')
      .update({ done_count: 0, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (habitsError) throw habitsError;

    const { error: blocksError } = await supabase
      .from('blocks')
      .update({ completed: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (blocksError) throw blocksError;
  },
};
