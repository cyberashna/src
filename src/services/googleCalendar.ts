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
  if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
    throw new Error(
      'Google Calendar credentials missing. Please add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY to your .env file. See GOOGLE_CALENDAR_SETUP.md for setup instructions.'
    );
  }

  return new Promise((resolve, reject) => {
    const script1 = document.createElement('script');
    script1.src = 'https://apis.google.com/js/api.js';
    script1.onerror = () => reject(new Error('Failed to load Google API script'));
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
    script2.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
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

export const getCalendarEvents = async (
  calendarId: string,
  startDate: Date,
  endDate: Date
): Promise<GoogleEvent[]> => {
  try {
    const response = await window.gapi.client.calendar.events.list({
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    return response.result.items || [];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
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

export const updateLastSynced = async (userId: string) => {
  const { error } = await supabase
    .from('calendar_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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


declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}
