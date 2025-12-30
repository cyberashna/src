import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarConnection,
  saveEventMapping,
  getEventMapping,
  deleteEventMapping,
} from './googleCalendar';
import type { Block } from '../App';

const getDateTimeForBlock = (
  dayIndex: number,
  timeIndex: number,
  hourlySlots: string[]
): { start: string; end: string } => {
  const now = new Date();
  const currentDay = now.getDay();

  const dayOffset = dayIndex - (currentDay === 0 ? 6 : currentDay - 1);
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + dayOffset);

  const timeStr = hourlySlots[timeIndex];
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  const startDate = new Date(targetDate);
  startDate.setHours(hours, minutes, 0, 0);

  const endDate = new Date(startDate);
  endDate.setHours(hours + 1, minutes, 0, 0);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
};

export const syncBlockToCalendar = async (
  userId: string,
  block: Block,
  dayIndex: number,
  timeIndex: number,
  habitName?: string,
  hourlySlots: string[] = []
): Promise<void> => {
  try {
    const connection = await getCalendarConnection(userId);

    if (!connection || !connection.sync_enabled || !connection.selected_calendar_id) {
      return;
    }

    const existingMapping = await getEventMapping(userId, block.id);
    const { start, end } = getDateTimeForBlock(dayIndex, timeIndex, hourlySlots);

    const eventTitle = block.isHabitBlock && habitName
      ? `Habit: ${habitName}`
      : block.label;

    const eventDescription = block.hashtag
      ? `#${block.hashtag}`
      : undefined;

    if (existingMapping) {
      await updateCalendarEvent(
        connection.selected_calendar_id,
        existingMapping.google_event_id,
        eventTitle,
        start,
        end,
        eventDescription
      );
    } else {
      const event = await createCalendarEvent(
        connection.selected_calendar_id,
        eventTitle,
        start,
        end,
        eventDescription
      );

      await saveEventMapping(
        userId,
        block.id,
        event.id,
        connection.selected_calendar_id
      );
    }
  } catch (error) {
    console.error('Error syncing block to calendar:', error);
    throw error;
  }
};

export const deleteBlockFromCalendar = async (
  userId: string,
  blockId: string
): Promise<void> => {
  try {
    const connection = await getCalendarConnection(userId);

    if (!connection || !connection.selected_calendar_id) {
      return;
    }

    const mapping = await getEventMapping(userId, blockId);

    if (mapping) {
      await deleteCalendarEvent(
        connection.selected_calendar_id,
        mapping.google_event_id
      );

      await deleteEventMapping(userId, blockId);
    }
  } catch (error) {
    console.error('Error deleting block from calendar:', error);
  }
};
