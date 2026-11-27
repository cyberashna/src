import type { OutlineNode } from './planningOutliner';

export type GridOutlineChoice = { kind: 'task' | 'note' | 'habit'; parentId: string; target: number; frequency: OutlineNode['frequency'] };
type Entry = { node: OutlineNode; path: OutlineNode[]; inTrash: boolean };
const entries = (nodes: OutlineNode[], path: OutlineNode[] = [], inTrash = false): Entry[] => nodes.flatMap(node => {
  const next = [...path, node];
  const trashed = inTrash || !!node.trashedAt;
  return [{ node, path: next, inTrash: trashed }, ...entries(node.children, next, trashed)];
});
export const findGridOutlineEntry = (nodes: OutlineNode[], block: { id: string; habitId?: string }) => {
  const all = entries(nodes);
  return all.find(entry => entry.node.linked?.blockId === block.id ||
    entry.node.plans?.some(plan => plan.scheduledBlockIds.includes(block.id) || plan.occurrenceBlockId === block.id)) ??
    (block.habitId ? all.find(entry => entry.node.linked?.habitId === block.habitId) : undefined);
};
export const gridOutlineDestinations = (nodes: OutlineNode[]) => entries(nodes).filter(entry => !entry.inTrash).map(({ node, path }) => ({
  id: node.id, label: path.map(item => item.text || 'Untitled').join(' / '),
  themeId: [...path].reverse().find(item => item.linked?.themeId && !item.linked?.habitId && !item.linked?.blockId && !item.linked?.routineId)?.linked?.themeId,
  parentHabitId: [...path].reverse().find(item => item.linked?.habitId)?.linked?.habitId,
}));
export const gridHabitCreditChoices = (nodes: OutlineNode[]) => entries(nodes)
  .filter(entry => !entry.inTrash && entry.node.linked?.habitId)
  .map(({ node, path }) => ({ id: node.linked!.habitId!, label: path.map(item => item.text || 'Untitled').join(' / ') }));

// A copied occurrence note is independent of the source item and its calendar link.
export function placeOccurrenceNote(nodes: OutlineNode[], draft: OutlineNode, parentId: string): OutlineNode[] {
  if (!draft.text.trim() || !draft.draftNote.trim()) throw new Error('Give the note a title and some text.');
  if (draft.tag !== 'note' || draft.linked || draft.isGroup || draft.children.length || draft.plans.length || draft.planDate) throw new Error('An occurrence note must be a separate, unplanned note.');
  const previous = entries(nodes).find(entry => entry.node.id === draft.id);
  if (previous?.inTrash) throw new Error('This note is in Outline Trash. Restore it there before retrying.');
  // Retry the same saved snapshot without duplicating it or overwriting later edits.
  if (previous) return nodes;
  return insertGridOutlineEntry(nodes, draft, parentId);
}
export const insertGridOutlineEntry = (nodes: OutlineNode[], node: OutlineNode, parentId: string): OutlineNode[] => {
  if (node.linked?.blockId && findGridOutlineEntry(nodes, { id: node.linked.blockId })) return nodes;
  if (!parentId) return [...nodes, node];
  if (!gridOutlineDestinations(nodes).some(parent => parent.id === parentId)) throw new Error('That destination is no longer available. Choose another place.');
  const visit = (items: OutlineNode[]): OutlineNode[] => items.map(item => item.id === parentId
    ? { ...item, collapsed: false, children: [...item.children, node] }
    : { ...item, children: visit(item.children) });
  return visit(nodes);
};

// Reconcile an optimistic capture with canonical habit sync before placing it.
export const placeGridOutlineEntry = (nodes: OutlineNode[], draft: OutlineNode, parentId: string, newHabit = false) => {
  const all = entries(nodes);
  const source = all.find(entry => entry.node.linked?.blockId === draft.linked?.blockId && draft.linked?.blockId);
  const habit = all.find(entry => entry.node.linked?.habitId === draft.linked?.habitId && draft.linked?.habitId);
  if (source?.inTrash || habit?.inTrash) throw new Error("This item is in Outline's Trash. Restore it there first.");
  const existing = habit ?? source;
  const base = existing?.node ?? draft;
  const keepHabit = !!habit && !newHabit;
  const note = draft.draftNote && base.draftNote && draft.draftNote !== base.draftNote && !base.draftNote.endsWith(`\n\n${draft.draftNote}`)
    ? `${base.draftNote}\n\n${draft.draftNote}` : base.draftNote || draft.draftNote;
  const node: OutlineNode = { ...base, ...(!keepHabit ? { tag: draft.tag, taskDone: draft.taskDone, target: draft.target, frequency: draft.frequency } : {}),
    draftNote: note, linked: { ...base.linked, ...draft.linked, label: base.linked?.label ?? draft.linked?.label ?? base.text, blockId: base.linked?.blockId ?? draft.linked?.blockId },
    children: [...base.children, ...(source && source.node.id !== base.id ? source.node.children : [])],
  };
  const redundant = source && source.node.id !== base.id ? source.node.id : null;
  if (keepHabit) {
    const visit = (items: OutlineNode[]): OutlineNode[] => items.filter(item => item.id !== redundant).map(item => item.id === node.id ? node : { ...item, children: visit(item.children) });
    return { nodes: visit(nodes), node };
  }
  if (parentId === node.id || entries(node.children).some(entry => entry.node.id === parentId)) throw new Error('Choose a place outside this item.');
  const detach = (items: OutlineNode[]): OutlineNode[] => items.filter(item => item.id !== node.id && item.id !== redundant).map(item => ({ ...item, children: detach(item.children) }));
  return { nodes: insertGridOutlineEntry(detach(nodes), node, parentId), node };
};
