import React, { useState, useEffect } from 'react';
import {
  initGoogleCalendar,
  requestGoogleAuth,
  listCalendars,
  saveCalendarConnection,
  getCalendarConnection,
  updateLastSynced,
  disconnectCalendar,
  GoogleCalendar,
} from '../services/googleCalendar';
import { importCalendarEvents } from '../services/calendarSync';
import type { CalendarConnection } from '../lib/supabase';
import type { Block } from '../App';

type CalendarSettingsProps = {
  userId: string | null;
  onClose: () => void;
  onImportEvents: (blocks: Block[]) => void;
};

const hourlySlots = [
  "6:00 AM",
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
  "9:00 PM",
  "10:00 PM",
];

export const CalendarSettings: React.FC<CalendarSettingsProps> = ({
  userId,
  onClose,
  onImportEvents
}) => {
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [gapiReady, setGapiReady] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  useEffect(() => {
    initGoogleCalendar()
      .then(() => setGapiReady(true))
      .catch((err) => {
        console.error('Failed to initialize Google Calendar API:', err);
        setError(err.message || 'Failed to initialize Google Calendar');
      });

    if (userId) {
      loadConnection();
    }
  }, [userId]);

  const loadConnection = async () => {
    if (!userId) return;

    try {
      const data = await getCalendarConnection(userId);
      if (data) {
        setConnection(data);
        setSelectedCalendarId(data.selected_calendar_id || '');
      }
    } catch (err) {
      console.error('Error loading calendar connection:', err);
    }
  };

  const handleConnect = async () => {
    if (!userId || !gapiReady) {
      setError('Please sign in first and wait for initialization');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await requestGoogleAuth();
      const calendarList = await listCalendars();
      setCalendars(calendarList);
    } catch (err: any) {
      console.error('Error connecting to Google Calendar:', err);
      setError(err.message || 'Failed to connect to Google Calendar');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCalendar = async () => {
    if (!userId || !selectedCalendarId) return;

    setLoading(true);
    setError('');

    try {
      const selectedCalendar = calendars.find((cal) => cal.id === selectedCalendarId);
      if (!selectedCalendar) {
        throw new Error('Calendar not found');
      }

      await saveCalendarConnection(
        userId,
        selectedCalendarId,
        selectedCalendar.summary,
        'token_placeholder'
      );

      await loadConnection();
      setCalendars([]);
      setSuccessMessage('Calendar connected successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      console.error('Error saving calendar:', err);
      setError(err.message || 'Failed to save calendar');
    } finally {
      setLoading(false);
    }
  };

  const handleImportEvents = async () => {
    if (!userId || !connection?.selected_calendar_id) return;

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const now = new Date();
      const startOfWeek = new Date(now);
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startOfWeek.setDate(now.getDate() - diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      endOfWeek.setHours(23, 59, 59, 999);

      const importedBlocks = await importCalendarEvents(
        connection.selected_calendar_id,
        startOfWeek,
        endOfWeek,
        hourlySlots
      );

      onImportEvents(importedBlocks);
      await updateLastSynced(userId);
      await loadConnection();

      setSuccessMessage(`Successfully imported ${importedBlocks.length} events from this week!`);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      console.error('Error importing events:', err);
      setError(err.message || 'Failed to import events');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!userId || !window.confirm('Disconnect Google Calendar?')) {
      return;
    }

    setLoading(true);
    try {
      await disconnectCalendar(userId);
      setConnection(null);
      setCalendars([]);
      setSelectedCalendarId('');
      setSuccessMessage('');
    } catch (err: any) {
      console.error('Error disconnecting calendar:', err);
      setError(err.message || 'Failed to disconnect calendar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Google Calendar Import</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {!userId && (
            <div className="info-message">
              Please sign in to connect your Google Calendar
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
          {successMessage && <div className="success-message">{successMessage}</div>}

          {connection ? (
            <div className="connected-state">
              <div className="connection-info">
                <div className="connection-label">Connected Calendar:</div>
                <div className="connection-value">{connection.calendar_name}</div>
              </div>

              {connection.last_synced_at && (
                <div className="sync-info">
                  Last imported: {new Date(connection.last_synced_at).toLocaleString()}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <button
                  onClick={handleImportEvents}
                  disabled={loading}
                >
                  {loading ? 'Importing...' : 'Import This Week\'s Events'}
                </button>
                <button
                  className="secondary"
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  {loading ? 'Disconnecting...' : 'Disconnect Calendar'}
                </button>
              </div>

              <p className="small-text" style={{ marginTop: 8 }}>
                Events from your Google Calendar will be imported as blocks in your weekly planner.
              </p>
            </div>
          ) : calendars.length > 0 ? (
            <div className="calendar-selection">
              <label>Select a calendar:</label>
              <select
                value={selectedCalendarId}
                onChange={(e) => setSelectedCalendarId(e.target.value)}
                disabled={loading}
              >
                <option value="">Choose a calendar</option>
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.summary} {cal.primary ? '(Primary)' : ''}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={handleSelectCalendar}
                  disabled={!selectedCalendarId || loading}
                >
                  {loading ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  className="secondary"
                  onClick={() => setCalendars([])}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="connect-state">
              <p>
                Connect your Google Calendar to import events from your calendar
                into your weekly habit planner.
              </p>
              <button
                onClick={handleConnect}
                disabled={loading || !userId || !gapiReady}
              >
                {loading ? 'Connecting...' : 'Connect Google Calendar'}
              </button>
              {!gapiReady && !error && <p className="small-text">Initializing...</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
