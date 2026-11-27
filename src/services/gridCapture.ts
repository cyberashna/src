import { database } from './database';

export type GridCaptureDraft = {
  id: string;
  taskId: string;
  text: string;
  mode: 'task' | 'note';
  weekStartDate: string;
  dayIndex: number;
  timeIndex: number;
  creditHabitId: string;
};

// Reserved IDs let retries finish a partial save without making a second tile or task.
export async function persistGridCapture(userId: string, draft: GridCaptureDraft, db = database) {
  if (!draft.text.trim() || !Number.isInteger(draft.dayIndex) || draft.dayIndex < 0 || draft.dayIndex > 6 ||
      !Number.isInteger(draft.timeIndex) || draft.timeIndex < 0) throw new Error('Choose a valid grid slot and enter a task or note.');
  await db.blocks.ensureWithId(userId, draft.id, {
    label: `${draft.mode === 'note' ? 'Note' : 'Task'}: ${draft.text.trim()}`, is_habit_block: false, habit_id: null,
    location_type: 'slot', day_index: draft.dayIndex, time_index: draft.timeIndex, week_start_date: draft.weekStartDate,
    completed: false, hashtag: draft.mode, linked_block_id: null, is_linked_group: false, workout_submitted: false,
    session_group_id: null, is_daily_template: false, daily_template_id: null,
  });
  if (draft.mode === 'note') {
    const saved = await db.blockNotes.getByBlock(draft.id);
    if (!saved) await db.blockNotes.upsert(userId, draft.id, draft.text.trim());
  } else await db.blockTasks.ensureWithIds(userId, draft.id, [{ id: draft.taskId, label: draft.text.trim(), sort_order: 0 }]);
  if (draft.creditHabitId) await db.blockHabitCredits.ensure(userId, draft.id, draft.creditHabitId);
  const [block] = await db.blocks.getByIds(userId, [draft.id]);
  if (!block) throw new Error('Could not read the saved block. Please retry.');
  const note = await db.blockNotes.getByBlock(draft.id);
  const tasks = await db.blockTasks.getByBlock(draft.id);
  const credits = await db.blockHabitCredits.getByBlock(draft.id);
  return { block, note, tasks, credits };
}
