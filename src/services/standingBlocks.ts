import { supabase } from '../lib/supabase';

export interface StandingBlock {
  id: string;
  user_id: string;
  source_block_id: string;
  block_label: string;
  day_index: number;
  time_index: number;
  recurrence_enabled: boolean;
  paused_at: string | null;
}

export async function createStandingBlock(
  userId: string,
  blockId: string,
  label: string,
  dayIndex: number,
  timeIndex: number
): Promise<StandingBlock | null> {
  const { data, error } = await supabase
    .from('standing_blocks')
    .insert({
      user_id: userId,
      source_block_id: blockId,
      block_label: label,
      day_index: dayIndex,
      time_index: timeIndex,
      recurrence_enabled: true
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating standing block:', error);
    return null;
  }

  await supabase
    .from('blocks')
    .update({ is_standing: true, standing_block_id: data.id })
    .eq('id', blockId);

  return data;
}

export async function removeStandingBlock(standingBlockId: string): Promise<void> {
  await supabase
    .from('blocks')
    .update({ is_standing: false, standing_block_id: null })
    .eq('standing_block_id', standingBlockId);

  await supabase
    .from('standing_blocks')
    .delete()
    .eq('id', standingBlockId);
}

export async function pauseStandingBlock(standingBlockId: string): Promise<void> {
  await supabase
    .from('standing_blocks')
    .update({
      recurrence_enabled: false,
      paused_at: new Date().toISOString()
    })
    .eq('id', standingBlockId);
}

export async function resumeStandingBlock(standingBlockId: string): Promise<void> {
  await supabase
    .from('standing_blocks')
    .update({
      recurrence_enabled: true,
      paused_at: null
    })
    .eq('id', standingBlockId);
}

export async function getActiveStandingBlocks(userId: string): Promise<StandingBlock[]> {
  const { data, error } = await supabase
    .from('standing_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('recurrence_enabled', true)
    .order('created_at');

  if (error) {
    console.error('Error fetching standing blocks:', error);
    return [];
  }

  return data || [];
}

export async function getAllStandingBlocks(userId: string): Promise<StandingBlock[]> {
  const { data, error } = await supabase
    .from('standing_blocks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at');

  if (error) {
    console.error('Error fetching all standing blocks:', error);
    return [];
  }

  return data || [];
}

export async function generateStandingBlocksForWeek(
  userId: string,
  weekStartDate: string,
  habitId: string,
  existingBlocks: Array<{ day_index: number | null; time_index: number | null }>
): Promise<string[]> {
  const standingBlocks = await getActiveStandingBlocks(userId);

  const occupiedSlots = new Set(
    existingBlocks
      .filter(b => b.day_index !== null && b.time_index !== null)
      .map(b => `${b.day_index}-${b.time_index}`)
  );

  const createdBlockIds: string[] = [];

  for (const standing of standingBlocks) {
    const slotKey = `${standing.day_index}-${standing.time_index}`;

    if (!occupiedSlots.has(slotKey)) {
      const { data, error } = await supabase
        .from('blocks')
        .insert({
          user_id: userId,
          habit_id: habitId,
          label: standing.block_label,
          day_index: standing.day_index,
          time_index: standing.time_index,
          week_start_date: weekStartDate,
          is_standing: true,
          standing_block_id: standing.id,
          completed: false
        })
        .select()
        .single();

      if (data) {
        createdBlockIds.push(data.id);
      } else if (error) {
        console.error('Error creating standing block instance:', error);
      }
    }
  }

  return createdBlockIds;
}
