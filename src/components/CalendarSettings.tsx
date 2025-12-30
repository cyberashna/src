import React, { useState, useEffect } from 'react';
import {
  initGoogleCalendar,
  requestGoogleAuth,
  listCalendars,
  saveCalendarConnection,
  getCalendarConnection,
  updateSyncEnabled,
  disconnectCalendar,
  GoogleCalendar,
} from '../services/googleCalendar';
import type { CalendarConnection } from '../lib/supabase';

type CalendarSettingsProps = {
  userId: string | null;
  onClose: () => void;
};

export const CalendarSettings: React.FC<CalendarSettingsProps> = ({ userId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [gapiReady, setGapiReady] = useState(false);

  useEffect(() => {
    initGoogleCalendar()
      .then(() => setGapiReady(true))
      .catch((err) => {
        console.error('Failed to initialize Google Calendar API:', err);
        setError('Failed to initialize Google Calendar');
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
    } catch (err: any) {
      console.error('Error saving calendar:', err);
      setError(err.message || 'Failed to save calendar');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSync = async () => {
    if (!userId || !connection) return;

    setLoading(true);
    try {
      await updateSyncEnabled(userId, !connection.sync_enabled);
      await loadConnection();
    } catch (err: any) {
      console.error('Error toggling sync:', err);
      setError(err.message || 'Failed to toggle sync');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!userId || !window.confirm('Disconnect Google Calendar? Event mappings will be deleted.')) {
      return;
    }

    setLoading(true);
    try {
      await disconnectCalendar(userId);
      setConnection(null);
      setCalendars([]);
      setSelectedCalendarId('');
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
          <h2>Google Calendar Settings</h2>
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

          {connection ? (
            <div className="connected-state">
              <div className="connection-info">
                <div className="connection-label">Connected Calendar:</div>
                <div className="connection-value">{connection.calendar_name}</div>
              </div>

              <div className="sync-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={connection.sync_enabled}
                    onChange={handleToggleSync}
                    disabled={loading}
                  />
                  <span>Enable automatic sync</span>
                </label>
              </div>

              {connection.last_synced_at && (
                <div className="sync-info">
                  Last synced: {new Date(connection.last_synced_at).toLocaleString()}
                </div>
              )}

              <button
                className="secondary"
                onClick={handleDisconnect}
                disabled={loading}
                style={{ marginTop: 12 }}
              >
                {loading ? 'Disconnecting...' : 'Disconnect Calendar'}
              </button>
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
                Connect your Google Calendar to automatically sync your scheduled
                habit blocks as calendar events.
              </p>
              <button
                onClick={handleConnect}
                disabled={loading || !userId || !gapiReady}
              >
                {loading ? 'Connecting...' : 'Connect Google Calendar'}
              </button>
              {!gapiReady && <p className="small-text">Initializing...</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
