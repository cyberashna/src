import { getCalendarEvents } from './googleCalendar';
import type { Block } from '../App';

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const getSlotFromDateTime = (
  dateTime: string,
  hourlySlots: string[]
): { dayIndex: number; timeIndex: number } | null => {
  const date = new Date(dateTime);
  const dayOfWeek = date.getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const hours = date.getHours();
  const minutes = date.getMinutes();

  for (let i = 0; i < hourlySlots.length; i++) {
    const timeStr = hourlySlots[i];
    const [time, period] = timeStr.split(' ');
    let [slotHours, slotMinutes] = time.split(':').map(Number);

    if (period === 'PM' && slotHours !== 12) {
      slotHours += 12;
    } else if (period === 'AM' && slotHours === 12) {
      slotHours = 0;
    }

    if (hours === slotHours && Math.abs(minutes - slotMinutes) < 30) {
      return { dayIndex, timeIndex: i };
    }
  }

  return null;
};

export const importCalendarEvents = async (
  calendarId: string,
  startDate: Date,
  endDate: Date,
  hourlySlots: string[]
): Promise<Block[]> => {
  try {
    const events = await getCalendarEvents(calendarId, startDate, endDate);
    const blocks: Block[] = [];

    for (const event of events) {
      if (!event.start.dateTime) continue;

      const slot = getSlotFromDateTime(event.start.dateTime, hourlySlots);

      if (slot) {
        blocks.push({
          id: makeId('b'),
          label: event.summary || 'Imported Event',
          isHabitBlock: false,
          location: { type: 'slot', dayIndex: slot.dayIndex, timeIndex: slot.timeIndex },
          completed: false,
          hashtag: 'imported',
        });
      }
    }

    return blocks;
  } catch (error) {
    console.error('Error importing calendar events:', error);
    throw error;
  }
};
