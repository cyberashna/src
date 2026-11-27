import type { OutlineNode } from './planningOutliner';
import type { Block } from './database';

export type OutlineCardType = 'task' | 'note' | 'habit' | 'group' | 'link';
export const outlineCardType = (node: OutlineNode): OutlineCardType => node.isGroup ? 'group' : node.tag;

export function outlineTypeRestriction(node: OutlineNode, kind: OutlineCardType): string | null {
  if (node.linked?.routineId) return 'Routines keep their checklist and run history. Change their steps in the routine editor.';
  if (node.linked?.habitId && kind !== 'habit') return 'This habit has a saved goal and history. Its type is protected; tasks and notes can be added inside it.';
  if (node.linked?.themeId && !node.linked.habitId && !node.linked.blockId) return 'Themes keep their linked habits. Add a subgroup inside this theme instead.';
  const hasPlans = !!node.linked?.blockId || !!node.planDate || !!node.plans?.length;
  if (kind === 'group' && hasPlans) return 'This item has planning links. Review them below before making it a group.';
  if (kind === 'habit' && node.tag !== 'habit' && hasPlans) return 'This item already has calendar plans. Keep its type, or create a new habit in Outline to preserve those plans.';
  if (node.tag === 'habit' && kind !== 'habit' && hasPlans) return 'Remove this habit\'s own plans before changing its type.';
  return null;
}

export function prepareOutlineTypeChange(node: OutlineNode, kind: OutlineCardType): OutlineNode {
  const reason = outlineTypeRestriction(node, kind);
  if (reason) throw new Error(reason);
  return { ...node, tag: kind === 'group' ? 'note' : kind, isGroup: kind === 'group' };
}

export const outlineTypeBlockIds = (node: OutlineNode): string[] => [...new Set([
  ...(node.linked?.blockId ? [node.linked.blockId] : []),
  ...(node.plans ?? []).flatMap(plan => [...plan.scheduledBlockIds, ...(plan.occurrenceBlockId ? [plan.occurrenceBlockId] : [])]),
])];

export function blockTypePatch(label: string, kind: 'task' | 'note' | 'link') {
  const name = label.replace(/^(?:task|note|block|plan|link):\s*/i, '').trim();
  return { label: `${kind === 'task' ? 'Task' : kind === 'link' ? 'Link' : 'Note'}: ${name}`, hashtag: kind };
}

export const hasOutlinePlanningLinks = (node: OutlineNode) => !!node.planDate || !!node.plans?.length || !!node.linked?.blockId;
export const outlinePlanningKey = (node: OutlineNode) => JSON.stringify([node.tag, node.isGroup, node.planDate, node.plans, node.linked]);
export const canUnlinkOutlinePlanning = (node: OutlineNode) => node.tag !== 'habit' && !node.linked?.habitId && !node.linked?.routineId && !(node.linked?.themeId && !node.linked.blockId);

export function withoutOutlinePlanning(node: OutlineNode, makeGroup = false, linkedNote = ''): OutlineNode {
  if (!canUnlinkOutlinePlanning(node)) throw new Error('Habit, theme and routine history is protected.');
  const result = { ...node, plans: [], planDate: null, linked: null,
    draftNote: node.draftNote?.trim() ? node.draftNote : linkedNote || node.draftNote };
  return makeGroup ? prepareOutlineTypeChange(result, 'group') : result;
}

export type OutlinePlanningDetail = { id: string; label: string; detail: string };
export function describeOutlinePlanning(node: OutlineNode, blocks: Pick<Block, 'id' | 'label' | 'completed' | 'location_type' | 'week_start_date' | 'day_index' | 'time_index'>[], slots: string[]): OutlinePlanningDetail[] {
  const dateLabel = (value: string) => {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const details = (node.plans ?? []).map(plan => ({ id: `plan:${plan.id}`,
    label: plan.scope === 'week' ? `Week of ${dateLabel(plan.date)}` : dateLabel(plan.date),
    detail: plan.scheduledBlockIds.length ? 'Calendar plan' : plan.scope === 'week' ? 'Loose weekly plan' : 'Any-time plan',
  }));
  if (node.planDate && !node.plans?.some(plan => plan.date === node.planDate)) details.push({ id: 'day-preference', label: dateLabel(node.planDate), detail: 'Day preference' });
  for (const id of outlineTypeBlockIds(node)) {
    const block = blocks.find(item => item.id === id);
    let detail = 'Linked item no longer exists';
    if (block) {
      detail = 'Waiting - no date or time';
      if (block.location_type === 'slot') {
        const date = block.week_start_date ? new Date(`${block.week_start_date}T12:00:00`) : null;
        if (date && block.day_index !== null) date.setDate(date.getDate() + block.day_index);
        detail = `Calendar - ${date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'date unavailable'}${block.time_index !== null && slots[block.time_index] ? `, ${slots[block.time_index]}` : ''}`;
      }
      if (block.completed) detail += ' - completed';
    }
    details.push({ id: `block:${id}`, label: block?.label || node.linked?.label || node.text || 'Calendar link', detail });
  }
  return details;
}
