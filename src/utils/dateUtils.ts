export const getMondayOfWeek = (weekOffset: number = 0): Date => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

export const getWeekStartDateString = (weekOffset: number = 0): string => {
  const monday = getMondayOfWeek(weekOffset);
  return monday.toISOString().split("T")[0];
};

export const getCurrentWeekRange = (weekOffset: number = 0): string => {
  const monday = getMondayOfWeek(weekOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const formatDate = (date: Date) => {
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const day = date.getDate();
    return `${month} ${day}`;
  };
  return `${formatDate(monday)} - ${formatDate(sunday)}`;
};

export const getTodayDayIndex = (weekOffset: number): number => {
  if (weekOffset !== 0) return -1;
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
};
