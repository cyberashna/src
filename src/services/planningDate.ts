export function planningDate(date: string, reference = new Date()) {
  const target = new Date(`${date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(target.getTime())) throw new Error('Choose a valid day.');
  const key = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  if (key(target) !== date) throw new Error('Choose a valid day.');
  const dayIndex = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayIndex);
  const current = new Date(reference);
  current.setHours(12, 0, 0, 0);
  current.setDate(current.getDate() - (current.getDay() + 6) % 7);
  return { dayIndex, weekStartDate: key(target), weekOffset: Math.round((target.getTime() - current.getTime()) / 604800000) };
}
