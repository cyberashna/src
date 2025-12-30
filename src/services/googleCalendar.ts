import { supabase } from '../lib/supabase';

export type GoogleCalendar = {
  id: string;
  summary: string;
  primary?: boolean;
};

export type GoogleEvent = {
  id: string;
  summary: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const initGoogleCalendar = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script1 = document.createElement('script');
    script1.src = 'https://apis.google.com/js/api.js';
    script1.onload = () => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
          });
          gapiInited = true;
          if (gisInited) resolve();
        } catch (error) {
          reject(error);
        }
      });
    };
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://accounts.google.com/gsi/client';
    script2.onload = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: '',
      });
      gisInited = true;
      if (gapiInited) resolve();
    };
    document.body.appendChild(script2);
  });
};

export const requestGoogleAuth = async (): Promise<string> => {
  return new Promise((resolve, reject) => {
    tokenClient.callback = async (response: any) => {
      if (response.error) {
        reject(response);
        return;
      }
      resolve(response.access_token);
    };

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

export const listCalendars = async (): Promise<GoogleCalendar[]> => {
  try {
    const response = await window.gapi.client.calendar.calendarList.list();
    return response.result.items || [];
  } catch (error) {
    console.error('Error fetching calendars:', error);
    throw error;
  }
};

export const createCalendarEvent = async (
  calendarId: string,
  summary: string,
  startDateTime: string,
  endDateTime: string,
  description?: string
): Promise<GoogleEvent> => {
  try {
    const event = {
      summary,
      description,
      start: {
        dateTime: startDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    const response = await window.gapi.client.calendar.events.insert({
      calendarId,
      resource: event,
    });

    return response.result;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
};

export const updateCalendarEvent = async (
  calendarId: string,
  eventId: string,
  summary: string,
  startDateTime: string,
  endDateTime: string,
  description?: string
): Promise<GoogleEvent> => {
  try {
    const event = {
      summary,
      description,
      start: {
        dateTime: startDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    const response = await window.gapi.client.calendar.events.update({
      calendarId,
      eventId,
      resource: event,
    });

    return response.result;
  } catch (error) {
    console.error('Error updating calendar event:', error);
    throw error;
  }
};

export const deleteCalendarEvent = async (
  calendarId: string,
  eventId: string
): Promise<void> => {
  try {
    await window.gapi.client.calendar.events.delete({
      calendarId,
      eventId,
    });
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    throw error;
  }
};

export const saveCalendarConnection = async (
  userId: string,
  calendarId: string,
  calendarName: string,
  accessToken: string
) => {
  const { data, error } = await supabase
    .from('calendar_connections')
    .upsert({
      user_id: userId,
      selected_calendar_id: calendarId,
      calendar_name: calendarName,
      google_refresh_token: accessToken,
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const getCalendarConnection = async (userId: string) => {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const updateSyncEnabled = async (userId: string, enabled: boolean) => {
  const { error } = await supabase
    .from('calendar_connections')
    .update({ sync_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) throw error;
};

export const disconnectCalendar = async (userId: string) => {
  const { error } = await supabase
    .from('calendar_connections')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
};

export const saveEventMapping = async (
  userId: string,
  blockId: string,
  googleEventId: string,
  calendarId: string
) => {
  const { data, error } = await supabase
    .from('calendar_event_mappings')
    .upsert({
      user_id: userId,
      block_id: blockId,
      google_event_id: googleEventId,
      calendar_id: calendarId,
      last_synced_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const getEventMapping = async (userId: string, blockId: string) => {
  const { data, error } = await supabase
    .from('calendar_event_mappings')
    .select('*')
    .eq('user_id', userId)
    .eq('block_id', blockId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const deleteEventMapping = async (userId: string, blockId: string) => {
  const { error } = await supabase
    .from('calendar_event_mappings')
    .delete()
    .eq('user_id', userId)
    .eq('block_id', blockId);

  if (error) throw error;
};

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}
