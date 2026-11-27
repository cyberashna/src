import type { Block } from './database';
import type { OutlineNode, OutlinePlan } from './planningOutliner';
import { isThemeRow, normalizeOutlinePlans, outlineBranchItems } from './outlineModel';
import { planningDate } from './planningDate';

export type SoftPlanDestination =
  | { kind: 'week'; date: string }
  | { kind: 'day'; date: string }
  | { kind: 'time'; date: string; timeIndex: number }
  | { kind: 'unplanned' };

export type PlanningBlock = Pick<Block, 'id' | 'completed' | 'location_type' | 'week_start_date' | 'day_index' | 'time_index'>;
type BlockTiming = Pick<PlanningBlock, 'location_type' | 'week_start_date' | 'day_index' | 'time_index'>;
export type SoftPlanBlockChange = { id: string; create: boolean; timing: BlockTiming };
export type SoftPlanChange = { nodes: OutlineNode[]; nodeId: string; planId: string; blockChanges: SoftPlanBlockChange[] };
export type SoftPlanRequest = {
  nodeId: string;
  planId: string;
  destination: SoftPlanDestination;
  // Allocate once per scheduling action; retain this ID across failed saves/retries.
  newBlockId?: string;
  parentPlanId?: string;
  targetCount?: number;
};

export const isRepeatingPlanNode = (node: OutlineNode) => node.tag === 'habit' || !!node.linked?.habitId || !!node.linked?.routineId;
export const defaultWeeklyTarget = (node: OutlineNode) => node.tag === 'habit' && node.frequency === 'weekly' && Number.isSafeInteger(node.target) && node.target > 0 ? node.target : 1;
export const weeklyPlanId = (nodeId: string, date: string) => `week:${nodeId}:${planningDate(date).weekStartDate}`;

export function recurringPlanProgress(node: OutlineNode, parent: OutlinePlan, blocks: readonly PlanningBlock[]) {
  const sessions = normalizeOutlinePlans(node.plans, node.id, node.planDate).filter(plan => plan.parentPlanId === parent.id && plan.scope === 'day' && planningDate(plan.date).weekStartDate === parent.date);
  const ids = new Set(sessions.flatMap(plan => plan.scheduledBlockIds));
  const available = new Map(blocks.map(block => [block.id, block]));
  const timed = [...ids].filter(id => { const block = available.get(id); return block?.location_type === 'slot' && block.week_start_date === parent.date; });
  return { placed: sessions.filter(plan => !plan.scheduledBlockIds.length).length + timed.length,
    completed: timed.filter(id => available.get(id)?.completed).length, target: parent.targetCount ?? defaultWeeklyTarget(node) };
}

const nonEmptyId = (id: unknown): id is string => typeof id === 'string' && !!id.trim();
const allRows = (nodes: OutlineNode[]): OutlineNode[] => nodes.flatMap(node => [node, ...allRows(node.children)]);
const replaceRow = (nodes: OutlineNode[], replacement: OutlineNode): OutlineNode[] => nodes.map(node =>
  node.id === replacement.id ? replacement : { ...node, children: replaceRow(node.children, replacement) });
const sameTiming = (block: PlanningBlock, timing: BlockTiming) =>
  block.location_type === timing.location_type && block.week_start_date === timing.week_start_date &&
  block.day_index === timing.day_index && block.time_index === timing.time_index;

/**
 * Prepare Outline timing changes without writing data or altering content/history.
 * Callers must provide every referenced block, not just blocks in the visible week.
 * Persist block changes by their stable IDs before saving nodes; new-block writes
 * must be idempotent so a lost response cannot create another calendar occurrence.
 */
export function prepareSoftPlanChange(
  nodes: OutlineNode[], request: SoftPlanRequest,
  context: { blocks: readonly PlanningBlock[]; slotCount: number },
): SoftPlanChange {
  if (!nonEmptyId(request.planId)) throw new Error('A stable plan ID is required.');
  const node = outlineBranchItems(nodes).find(item => item.id === request.nodeId);
  if (!node) throw new Error('This Outline item is missing or in Trash.');
  if (isThemeRow(node) || node.isGroup) throw new Error('Choose a task or note, not a theme or group.');
  const repeating = isRepeatingPlanNode(node);
  const { destination } = request;
  if (destination.kind !== 'unplanned' && (node.tag === 'task' || node.tag === 'link') && node.taskDone) {
    throw new Error('Reopen this completed task before planning it.');
  }
  const target = destination.kind === 'unplanned' ? null : planningDate(destination.date);
  if (destination.kind === 'time' && (!Number.isSafeInteger(context.slotCount) || context.slotCount < 1 ||
    !Number.isInteger(destination.timeIndex) || destination.timeIndex < 0 || destination.timeIndex >= context.slotCount)) {
    throw new Error('Choose a valid time.');
  }

  let plans = normalizeOutlinePlans(node.plans, node.id, node.planDate);
  const previous = plans.find(plan => plan.id === request.planId);
  let parentPlanId = previous?.parentPlanId ?? request.parentPlanId;
  const weeklyIntent = repeating && !parentPlanId && (previous?.scope === 'week' || (!previous && destination.kind === 'week'));
  if (weeklyIntent) {
    if (destination.kind !== 'week' && destination.kind !== 'unplanned') throw new Error('Choose a session to place, not the whole weekly intention.');
    const count = request.targetCount ?? previous?.targetCount ?? defaultWeeklyTarget(node);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Choose a whole number of sessions, at least 1.');
    if (destination.kind === 'week' && plans.some(plan => plan.id !== request.planId && !plan.parentPlanId && plan.scope === 'week' && plan.date === target!.weekStartDate)) throw new Error('This week already has an intention. Open it to change the session count.');
    const intent: OutlinePlan = { id: request.planId, scope: 'week', date: target?.weekStartDate ?? previous!.date, targetCount: count, scheduledBlockIds: previous?.scheduledBlockIds ?? [] };
    const updated = { ...node, plans: [...plans.filter(plan => plan.id !== request.planId), ...(destination.kind === 'unplanned' ? [] : [intent])] };
    return { nodes: replaceRow(nodes, updated), nodeId: node.id, planId: request.planId, blockChanges: [] };
  }
  if (!repeating && !previous && plans.length) throw new Error('This plan changed. Choose the current plan before moving it.');
  if (repeating) {
    if (destination.kind === 'time' && !node.linked?.habitId && !node.linked?.routineId) throw new Error('Link this habit in Outline before scheduling a session.');
    const week = target?.weekStartDate ?? (previous && planningDate(previous.date).weekStartDate);
    if (!week) throw new Error('Choose a week for this session.');
    const parent = plans.find(plan => plan.id === parentPlanId && plan.scope === 'week' && !plan.parentPlanId && plan.date === week)
      ?? plans.find(plan => plan.scope === 'week' && !plan.parentPlanId && plan.date === week);
    parentPlanId = parent?.id ?? weeklyPlanId(node.id, week);
    if (parentPlanId === request.planId) throw new Error('A session needs its own identity.');
    if (!parent) plans = [...plans, { id: parentPlanId, scope: 'week', date: week, targetCount: defaultWeeklyTarget(node), scheduledBlockIds: [] }];
  }
  if ((previous?.scheduledBlockIds.length ?? 0) > 1) throw new Error('Choose a single calendar occurrence to move.');
  // A prior attempt can create its reserved block before the Outline link saves.
  // Recover it even when the user changes their mind from Time to Week or Day.
  const reservedBlockId = context.blocks.some(block => block.id === request.newBlockId) ? request.newBlockId : undefined;
  const linkedBlockId = previous?.scheduledBlockIds[0] ?? (repeating ? previous?.occurrenceBlockId : node.linked?.blockId) ?? reservedBlockId;
  if (destination.kind === 'time' && !linkedBlockId && !nonEmptyId(request.newBlockId)) {
    throw new Error('A stable calendar item ID is required to schedule this item.');
  }
  const blockId = linkedBlockId ?? (destination.kind === 'time' ? request.newBlockId : undefined);
  const block = context.blocks.find(item => item.id === blockId);
  if (linkedBlockId && !block && destination.kind !== 'unplanned') {
    throw new Error('Load the linked calendar item before changing its timing.');
  }

  const otherOwner = blockId && allRows(nodes).some(item =>
    (item.id !== node.id && item.linked?.blockId === blockId) ||
    normalizeOutlinePlans(item.plans, item.id, item.planDate).some(plan =>
      (item.id !== node.id || plan.id !== request.planId) && (plan.scheduledBlockIds.includes(blockId) || plan.occurrenceBlockId === blockId)));
  if (otherOwner && destination.kind !== 'unplanned') throw new Error('This calendar item belongs to another plan.');
  if (block?.completed && destination.kind !== 'unplanned') throw new Error('Completed calendar history cannot be moved.');
  if (repeating && block?.completed && destination.kind === 'unplanned') return { nodes, nodeId: node.id, planId: request.planId, blockChanges: [] };

  const blockChanges: SoftPlanBlockChange[] = [];
  if (blockId && destination.kind === 'time') {
    const timing: BlockTiming = { location_type: 'slot', week_start_date: target!.weekStartDate, day_index: target!.dayIndex, time_index: destination.timeIndex };
    if (!block || !sameTiming(block, timing)) blockChanges.push({ id: blockId, create: !block, timing });
  } else if (block && !block.completed && !otherOwner && block.location_type === 'slot') {
    blockChanges.push({ id: block.id, create: false, timing: { location_type: 'unscheduled', week_start_date: null, day_index: null, time_index: null } });
  }

  const releaseSession = repeating && destination.kind === 'unplanned';
  const nextPlan: OutlinePlan | null = destination.kind === 'unplanned' && !repeating ? null : {
    id: request.planId,
    scope: destination.kind === 'week' || releaseSession ? 'week' : 'day',
    date: releaseSession ? planningDate(previous!.date).weekStartDate : destination.kind === 'week' ? target!.weekStartDate : destination.kind !== 'unplanned' ? destination.date : '',
    targetCount: repeating ? null : previous?.targetCount ?? null,
    scheduledBlockIds: destination.kind === 'time' ? [blockId!] : [],
    ...(repeating ? { parentPlanId, ...(blockId ? { occurrenceBlockId: blockId } : {}), ...(previous?.sessionInitialized ? { sessionInitialized: true as const } : {}) } : {}),
  };
  const nextPlans = previous
    ? plans.flatMap(plan => plan.id === previous.id ? nextPlan ? [nextPlan] : [] : [plan])
    : nextPlan ? [...plans, nextPlan] : plans;
  // Once a legacy day is edited here, the plan owns timing instead of planDate.
  const ownsLegacyDate = previous?.legacyPlanDate || (previous?.scope === 'day' && previous.date === node.planDate);
  const updated: OutlineNode = { ...node, plans: nextPlans,
    planDate: ownsLegacyDate ? null : node.planDate,
    linked: !repeating && (destination.kind === 'time' || (blockId && !node.linked?.blockId && !otherOwner))
      ? { ...node.linked, blockId, label: node.linked?.label ?? node.text } : node.linked,
  };
  return { nodes: replaceRow(nodes, updated), nodeId: node.id, planId: request.planId, blockChanges };
}

export type WeekPlanEntry = { node: OutlineNode; plan: OutlinePlan; path: string[]; placement: 'week' | 'day' | 'scheduled'; progress?: { placed: number; completed: number; target: number } };

/** Resolve the selected week from its date, never from today's date or the UI offset. */
export function getSoftPlansForWeek(nodes: OutlineNode[], date: string): WeekPlanEntry[] {
  const weekStart = planningDate(date).weekStartDate;
  const visit = (items: OutlineNode[], path: string[]): WeekPlanEntry[] => items.flatMap(node => {
    if (node.trashedAt) return [];
    const nextPath = [...path, node.text];
    const plans = isThemeRow(node) || node.isGroup || ((node.tag === 'task' || node.tag === 'link') && node.taskDone) ? [] : normalizeOutlinePlans(node.plans, node.id, node.planDate);
    return [
      ...plans.filter(plan => !(plan.parentPlanId && plan.scope === 'week') && planningDate(plan.date).weekStartDate === weekStart).map((plan): WeekPlanEntry => ({
        node, plan, path: nextPath,
        placement: plan.scheduledBlockIds.length ? 'scheduled' : plan.scope,
      })),
      ...visit(node.children, nextPath),
    ];
  });
  return visit(nodes, []);
}
