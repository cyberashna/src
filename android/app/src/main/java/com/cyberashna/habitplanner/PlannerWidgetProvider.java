package com.cyberashna.habitplanner;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class PlannerWidgetProvider extends AppWidgetProvider {
    static final String PREFS_NAME = "planner_widget";
    static final String KEY_TITLE = "title";
    static final String KEY_STATUS = "status";
    static final String KEY_WAITING_LABEL = "waiting_label";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName componentName = new ComponentName(context, PlannerWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String title = prefs.getString(KEY_TITLE, context.getString(R.string.widget_title));
        String status = prefs.getString(KEY_STATUS, context.getString(R.string.widget_status_placeholder));
        String waitingLabel = prefs.getString(KEY_WAITING_LABEL, context.getString(R.string.widget_waiting_placeholder));

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.planner_widget);
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_status, status);
        views.setTextViewText(R.id.widget_waiting_count, waitingLabel);
        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context, "widget"));
        views.setOnClickPendingIntent(R.id.widget_open_button, openAppIntent(context, "today"));
        views.setOnClickPendingIntent(R.id.widget_note_button, openAppIntent(context, "quick-note"));
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static PendingIntent openAppIntent(Context context, String source) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.putExtra("planner_source", source);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int requestCode = Math.abs(source.hashCode());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }
}
