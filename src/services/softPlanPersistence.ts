import { database, type BlockTask } from './database';
import type { OutlineNode } from './planningOutliner';
import { outlineBranchItems, normalizeOutlinePlans } from './outlineModel';
import { gridOutlineDestinations } from './gridOutline';
import { prepareSoftPlanChange, isRepeatingPlanNode, type SoftPlanRequest } from './softPlanning';
import type { RoutineTab } from './routineNotes';

export async function routineSessionTaskId(blockId: string, sourceId: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([blockId, sourceId])))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function persistSoftPlan(userId: string, request: SoftPlanRequest, slotCount: number, outline: {
  current: () => OutlineNode[]; save: (nodes: OutlineNode[]) => Promise<void>; routine?: RoutineTab;
}) {
  const source = () => outlineBranchItems(outline.current()).find(node => node.id === request.nodeId);
  const linkedIds = () => {
    const node = source();
    return [...new Set([request.newBlockId, node && !isRepeatingPlanNode(node) ? node.linked?.blockId : undefined,
      ...normalizeOutlinePlans(node?.plans, request.nodeId, node?.planDate).flatMap(plan => [...plan.scheduledBlockIds, plan.occurrenceBlockId]),
    ].filter((id): id is string => !!id))];
  };
  const blocks = await database.blocks.getByIds(userId, linkedIds());
  const prepared = prepareSoftPlanChange(outline.current(), request, { blocks, slotCount });
  const node = source()!;
  const repeating = isRepeatingPlanNode(node);
  const routine = outline.routine;
  if (node.linked?.routineId && request.destination.kind === 'time' && routine?.id !== node.linked.routineId) throw new Error('This routine is not available on this device yet.');
  const themeId = gridOutlineDestinations(outline.current()).find(parent => parent.id === node.id)?.themeId;
  for (const change of prepared.blockChanges) {
    if (change.create) {
      await database.blocks.ensureWithId(userId, change.id, {
        ...change.timing, label: `${node.linked?.routineId ? 'Routine' : node.linked?.habitId ? 'Habit' : node.tag === 'task' ? 'Task' : node.tag === 'link' ? 'Link' : 'Note'}: ${node.text}`, hashtag: node.linked?.routineId ? 'routine' : node.tag,
        theme_id: themeId ?? node.linked?.themeId ?? null, is_habit_block: !!node.linked?.habitId, habit_id: node.linked?.habitId ?? null, completed: false,
        linked_block_id: null, is_linked_group: false, workout_submitted: false,
        session_group_id: null, is_daily_template: false, daily_template_id: null,
      });
    } else await database.blocks.update(change.id, change.timing);
  }
  // Finish initial note capture even if the preceding attempt stopped after creating the block.
  const updated = outlineBranchItems(prepared.nodes).find(item => item.id === node.id);
  const scheduledId = repeating ? updated?.plans.find(plan => plan.id === request.planId)?.scheduledBlockIds[0] : updated?.linked?.blockId;
  const content = routine?.notes || node.draftNote;
  const initializing = repeating ? !node.plans.find(plan => plan.id === request.planId)?.sessionInitialized : scheduledId === request.newBlockId;
  if (request.destination.kind === 'time' && scheduledId && initializing && content) {
    const existing = await database.blockNotes.getByBlock(scheduledId!);
    if (!existing) await database.blockNotes.upsert(userId, scheduledId!, content);
  }
  if (request.destination.kind === 'time' && scheduledId && initializing && routine) {
    await database.blockTasks.ensureWithIds(userId, scheduledId!, await Promise.all(routine.items.map(async (item, index) => ({ id: await routineSessionTaskId(scheduledId!, item.id), label: item.label, sort_order: index }))));
  }
  const tasks: BlockTask[] = scheduledId && routine ? await database.blockTasks.getByBlock(scheduledId) : [];
  const note = scheduledId ? await database.blockNotes.getByBlock(scheduledId) : null;
  const currentBlocks = await database.blocks.getByIds(userId, linkedIds());
  // Rebase on the latest Outline so a concurrent rename or note edit is preserved.
  const latest = prepareSoftPlanChange(outline.current(), request, { blocks: currentBlocks, slotCount });
  if (latest.blockChanges.length) throw new Error('The calendar item changed while saving. Please retry.');
  if (repeating && request.destination.kind === 'time') {
    const mark = (nodes: OutlineNode[]): OutlineNode[] => nodes.map(item => item.id === node.id
      ? { ...item, plans: item.plans.map(plan => plan.id === request.planId ? { ...plan, sessionInitialized: true } : plan) }
      : { ...item, children: mark(item.children) });
    latest.nodes = mark(latest.nodes);
  }
  await outline.save(latest.nodes);
  return { nodes: latest.nodes, blocks: currentBlocks, tasks, note, scheduledId };
}
