package com.cyberashna.habitplanner;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PlannerWidget")
public class PlannerWidgetPlugin extends Plugin {
    @PluginMethod
    public void updateSnapshot(PluginCall call) {
        String title = call.getString("title", getContext().getString(R.string.widget_title));
        String status = call.getString("status", getContext().getString(R.string.widget_status_placeholder));
        String waitingLabel = call.getString(
            "waitingLabel",
            getContext().getString(R.string.widget_waiting_placeholder)
        );

        SharedPreferences prefs = getContext().getSharedPreferences(
            PlannerWidgetProvider.PREFS_NAME,
            Context.MODE_PRIVATE
        );
        prefs.edit()
            .putString(PlannerWidgetProvider.KEY_TITLE, title)
            .putString(PlannerWidgetProvider.KEY_STATUS, status)
            .putString(PlannerWidgetProvider.KEY_WAITING_LABEL, waitingLabel)
            .apply();

        PlannerWidgetProvider.updateAllWidgets(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getLaunchTarget(PluginCall call) {
        Intent intent = getActivity().getIntent();
        String target = intent != null ? intent.getStringExtra("planner_source") : null;

        JSObject result = new JSObject();
        result.put("target", target);
        call.resolve(result);
    }
}
