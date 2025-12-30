# Google Calendar Integration Setup

This guide explains how to set up Google Calendar integration for the Habit Planner app to import events from your calendar.

## Prerequisites

- A Google account
- Access to Google Cloud Console

## Step-by-Step Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on "Select a project" dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "Habit Planner")
5. Click "Create"

### 2. Enable Google Calendar API

1. In your project, go to "APIs & Services" > "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

### 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" user type
   - Fill in the required information (app name, user support email, developer email)
   - Add the scope: `https://www.googleapis.com/auth/calendar.readonly`
   - Add test users if needed
   - Save and continue
4. Create OAuth client ID:
   - Application type: "Web application"
   - Name: "Habit Planner Web"
   - Authorized JavaScript origins:
     - `http://localhost:5173` (for development)
     - Your production domain (e.g., `https://yourapp.com`)
   - Authorized redirect URIs:
     - `http://localhost:5173` (for development)
     - Your production domain
5. Click "Create"
6. Copy the **Client ID** (you'll need this)

### 4. Create API Key

1. Still in "Credentials", click "Create Credentials" > "API key"
2. Copy the **API key** (you'll need this)
3. Click "Restrict Key" (recommended):
   - Under "API restrictions", select "Restrict key"
   - Choose "Google Calendar API"
   - Save

### 5. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and add your credentials:
   ```
   VITE_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your_api_key_here
   ```

3. Make sure your Supabase credentials are also set:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### 6. Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open the app in your browser
3. Click the calendar icon (📅) in the bottom-right corner
4. Click "Connect Google Calendar"
5. Sign in with your Google account
6. Grant the requested permissions
7. Select a calendar from the dropdown
8. Click "Connect"
9. Click "Import This Week's Events" to import events

## How It Works

- **One-Way Import**: Events are imported FROM Google Calendar into your planner
- **Manual Import**: Click the import button to fetch events from the current week
- **Event Mapping**: Each calendar event is converted to a block with:
  - Title: The event name
  - Time slot: Matched to the nearest hourly slot
  - Hashtag: Tagged as "imported" for easy identification
- **No Modifications**: Your Google Calendar is never modified by this app

## Troubleshooting

### "Failed to initialize Google Calendar"
- Check that your API key is correct
- Ensure Google Calendar API is enabled in your project
- Check browser console for detailed error messages

### "Failed to connect to Google Calendar"
- Verify your Client ID is correct
- Check that authorized JavaScript origins match your domain
- Clear browser cache and try again

### Events not importing
- Check that you've selected a calendar
- Verify the calendar has events this week
- Events must have specific start times (all-day events are not imported)
- Look for error messages in the browser console

### Events appear in wrong time slots
- The app matches events to the nearest hourly slot (6 AM - 10 PM)
- Events outside this range won't be imported
- Check your timezone settings in Google Calendar

## Security Notes

- Never commit your `.env` file to version control
- Keep your API key and Client ID secure
- Use API restrictions to limit key usage
- The app only requests READ-ONLY access to your calendar
- No data is sent to external servers (except Google)

## Imported Event Management

- Imported events have the hashtag "imported"
- You can move or delete imported blocks like any other block
- Re-importing will create duplicate blocks (remove old ones first)
- Imported blocks are not linked to calendar events

## Support

For issues or questions:
- Check the browser console for error messages
- Review the Supabase logs
- Ensure all environment variables are set correctly
- Verify you have events in your Google Calendar for this week
