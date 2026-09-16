# Android Native Wrapper

This project now has a Capacitor Android wrapper around the existing React/Vite planner.

The web app remains the main app. The Android project is the native shell that gives us a place to add Android-only features like widgets, lock screen widgets on supported Pixel/Android versions, richer notifications, and a future charging screensaver mode.

## What Is Included

- `capacitor.config.ts` defines the native app:
  - App name: `Habit Care Planner`
  - Android package ID: `com.cyberashna.habitplanner`
  - Web build folder: `dist`
- `android/` contains the generated native Android project.
- A first native widget is registered as `Planner Today`.
  - It shows a simple Today card with the next open block and waiting count.
  - Tapping `Open Today` opens the planner.
  - Tapping `Quick Note` opens the planner and primes quick note capture.
  - It advertises support for both home screen and keyguard/lock screen widget hosts.
- A small native bridge lets the React app publish a `widgetSnapshot` into Android local storage.

## Commands

From the project root:

```bash
npm run android:sync
```

Builds the web app and copies it into the Android project.

```bash
npm run android:open
```

Builds/syncs the web app, then opens the Android project in Android Studio.

```bash
npm run android:run
```

Builds/syncs the web app, then runs the Android app on a connected Android device or emulator.

## Local Requirements

To compile and install the Android app, the laptop needs:

- Android Studio
- Android SDK installed through Android Studio
- A Java runtime available to Gradle, usually Android Studio's bundled JDK/JBR
- USB debugging enabled on the phone if running directly on a device

## How The Widget Data Works

When the planner runs inside the Android wrapper, React sends Android:

- `Today`
- the next open block, or a simple empty/done state
- the waiting count
- last updated time

Android stores that snapshot locally and refreshes the widget. The widget will be blank/default until the Android app has been opened at least once.

## Lock Screen Notes

Pixel lock screen widgets depend on the phone's Android version and settings. On supported Pixel builds, enable them from:

Settings > Display & touch > Lock screen > Widgets on lock screen

Then go to the lock screen and swipe left to the widget page. Add the `Habit Care Planner` widget from there.

Anything shown in a lock screen widget may be visible before unlocking, so the widget should stay glanceable and avoid sensitive note text.

## Next Native Step

The next useful pass is adding richer native behavior:

1. Add a routine preview line.
2. Add native reminders for pesky/regular reminders.
3. Add a charging screensaver mode through Android `DreamService`.
4. Add a smaller lock-screen-specific layout if the normal widget feels too busy there.
