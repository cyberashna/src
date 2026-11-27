import { supabase } from '../lib/supabase';

export interface BlockPattern {
  id: string;
  block_label: string;
  preferred_day_index: number;
  preferred_time_index: number;
  occurrence_count: number;
  last_seen_week: string;
  confidence_score: number;
  is_dismissed: boolean;
}

export interface GhostBlock {
  label: string;
  day_index: number;
  time_index: number;
  pattern_id: string;
  confidence_score: number;
  is_suggested: true;
}

type PatternBlockCandidate = {
  id: string;
  label: string;
  day_index: number | null;
  time_index: number | null;
  week_start_date: string;
  completed: boolean | null;
  is_habit_block: boolean | null;
  habit_id: string | null;
  is_standing?: boolean | null;
  standing_block_id?: string | null;
};

type PatternBlockTask = {
  block_id: string;
  completed: boolean | null;
};

function getTwoWeeksAgo(currentWeekStart: string): string {
  const date = new Date(currentWeekStart);
  date.setDate(date.getDate() - 14);
  return date.toISOString().split('T')[0];
}

function isRecurringBlockCandidate(block: PatternBlockCandidate): boolean {
  return Boolean(block.is_habit_block || block.habit_id || block.is_standing || block.standing_block_id);
}

function normalizeOneTimeLabel(label: string): string {
  return label.replace(/^(Task|Note|Block):\s*/i, '').trim().toLowerCase();
}

function hasSpecificDateText(label: string): boolean {
  const normalized = label.toLowerCase();
  return (
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+\d{1,2}\b/.test(normalized) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(normalized)
  );
}

function isDatedOneTimeTask(block: PatternBlockCandidate): boolean {
  return /^Task:\s*/i.test(block.label) && !isRecurringBlockCandidate(block) && hasSpecificDateText(block.label);
}

function isOneTimeTaskBlock(block: PatternBlockCandidate): boolean {
  return /^Task:\s*/i.test(block.label) && !isRecurringBlockCandidate(block);
}

function isCompletedOneTimeBlock(block: PatternBlockCandidate, blockTasks: PatternBlockTask[] = []): boolean {
  return (
    !isRecurringBlockCandidate(block) &&
    (block.completed === true || (blockTasks.length > 0 && blockTasks.every((task) => task.completed === true)))
  );
}

export async function analyzePatterns(userId: string, currentWeekStart: string): Promise<BlockPattern[]> {
  const twoWeeksAgo = getTwoWeeksAgo(currentWeekStart);

  const { data: blocks, error } = await supabase
    .from('blocks')
    .select('id, label, day_index, time_index, week_start_date, completed, is_habit_block, habit_id, is_standing, standing_block_id')
    .eq('user_id', userId)
    .eq('location_type', 'slot')
    .gte('week_start_date', twoWeeksAgo)
    .lt('week_start_date', currentWeekStart)
    .not('day_index', 'is', null)
    .not('time_index', 'is', null);

  if (error || !blocks) {
    console.error('Error fetching blocks for pattern analysis:', error);
    return [];
  }

  const blockIds = (blocks as PatternBlockCandidate[]).map((block) => block.id);
  const { data: blockTasks, error: blockTasksError } = blockIds.length > 0
    ? await supabase
      .from('block_tasks')
      .select('block_id, completed')
      .in('block_id', blockIds)
    : { data: [], error: null };

  if (blockTasksError) {
    console.error('Error fetching block tasks for pattern analysis:', blockTasksError);
  }

  const tasksByBlock = new Map<string, PatternBlockTask[]>();
  ((blockTasks ?? []) as PatternBlockTask[]).forEach((task) => {
    const existing = tasksByBlock.get(task.block_id) ?? [];
    existing.push(task);
    tasksByBlock.set(task.block_id, existing);
  });

  const completedOneTimeLabels = new Set(
    (blocks as PatternBlockCandidate[])
      .filter((block) => isCompletedOneTimeBlock(block, tasksByBlock.get(block.id) ?? []) || isDatedOneTimeTask(block))
      .map((block) => normalizeOneTimeLabel(block.label))
      .filter(Boolean)
  );

  const patternMap = new Map<string, {
    label: string;
    day_index: number;
    time_index: number;
    weeks: Set<string>;
  }>();

  (blocks as PatternBlockCandidate[]).forEach(block => {
    if (
      isOneTimeTaskBlock(block) ||
      isCompletedOneTimeBlock(block, tasksByBlock.get(block.id) ?? []) ||
      isDatedOneTimeTask(block) ||
      (!isRecurringBlockCandidate(block) && completedOneTimeLabels.has(normalizeOneTimeLabel(block.label))) ||
      block.day_index === null ||
      block.time_index === null
    ) {
      return;
    }

    const key = `${block.label}-${block.day_index}-${block.time_index}`;

    if (!patternMap.has(key)) {
      patternMap.set(key, {
        label: block.label,
        day_index: block.day_index,
        time_index: block.time_index,
        weeks: new Set()
      });
    }

    patternMap.get(key)!.weeks.add(block.week_start_date);
  });

  const patterns: BlockPattern[] = [];

  for (const [, pattern] of patternMap) {
    const occurrenceCount = pattern.weeks.size;

    if (occurrenceCount >= 1) {
      const confidenceScore = Math.round((occurrenceCount / 2) * 100);

      const { data: existingPattern } = await supabase
        .from('block_patterns')
        .select('*')
        .eq('user_id', userId)
        .eq('block_label', pattern.label)
        .eq('preferred_day_index', pattern.day_index)
        .eq('preferred_time_index', pattern.time_index)
        .maybeSingle();

      if (existingPattern) {
        const { data: updated } = await supabase
          .from('block_patterns')
          .update({
            occurrence_count: occurrenceCount,
            last_seen_week: currentWeekStart,
            confidence_score: confidenceScore,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPattern.id)
          .select()
          .single();

        if (updated) {
          patterns.push(updated);
        }
      } else {
        const { data: newPattern } = await supabase
          .from('block_patterns')
          .insert({
            user_id: userId,
            block_label: pattern.label,
            preferred_day_index: pattern.day_index,
            preferred_time_index: pattern.time_index,
            occurrence_count: occurrenceCount,
            last_seen_week: currentWeekStart,
            confidence_score: confidenceScore,
            is_dismissed: false
          })
          .select()
          .single();

        if (newPattern) {
          patterns.push(newPattern);
        }
      }
    }
  }

  return patterns.filter(p => !p.is_dismissed && p.confidence_score >= 50);
}

export async function generateGhostBlocks(
  userId: string,
  currentWeekStart: string,
  existingBlocks: Array<{ day_index: number | null; time_index: number | null }>
): Promise<GhostBlock[]> {
  const patterns = await analyzePatterns(userId, currentWeekStart);

  const occupiedSlots = new Set(
    existingBlocks
      .filter(b => b.day_index !== null && b.time_index !== null)
      .map(b => `${b.day_index}-${b.time_index}`)
  );

  const ghostBlocks: GhostBlock[] = patterns
    .filter(pattern => {
      const slotKey = `${pattern.preferred_day_index}-${pattern.preferred_time_index}`;
      return !occupiedSlots.has(slotKey);
    })
    .map(pattern => ({
      label: pattern.block_label,
      day_index: pattern.preferred_day_index,
      time_index: pattern.preferred_time_index,
      pattern_id: pattern.id,
      confidence_score: pattern.confidence_score,
      is_suggested: true as const
    }));

  return ghostBlocks;
}

export async function dismissPattern(patternId: string): Promise<void> {
  await supabase
    .from('block_patterns')
    .update({ is_dismissed: true })
    .eq('id', patternId);
}

export async function acceptGhostBlock(
  userId: string,
  ghostBlock: GhostBlock,
  weekStartDate: string,
  habit: { id: string; name: string; hashtag?: string; themeId?: string }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('blocks')
    .insert({
      user_id: userId,
      habit_id: habit.id,
      label: `Habit: ${habit.name}`,
      is_habit_block: true,
      day_index: ghostBlock.day_index,
      time_index: ghostBlock.time_index,
      week_start_date: weekStartDate,
      location_type: 'slot',
      hashtag: habit.hashtag ?? null,
      theme_id: habit.themeId ?? null,
      pattern_id: ghostBlock.pattern_id,
      is_suggested: false,
      completed: false,
      linked_block_id: null,
      is_linked_group: false,
      workout_submitted: false,
      session_group_id: null,
      is_daily_template: false,
      daily_template_id: null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error accepting ghost block:', error);
    return null;
  }

  return data.id;
}

export async function getActivePatterns(userId: string): Promise<BlockPattern[]> {
  const { data, error } = await supabase
    .from('block_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .order('confidence_score', { ascending: false });

  if (error) {
    console.error('Error fetching patterns:', error);
    return [];
  }

  return data || [];
}
