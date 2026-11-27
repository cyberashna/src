package com.cyberashna.habitplanner;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.stream.Collectors;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlannerWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // Run from the APK even when an old service worker supplies the HTML/JS.
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                getAssets().open("native-cache-reset.js"), StandardCharsets.UTF_8))) {
            final String cacheReset = reader.lines().collect(Collectors.joining("\n"));
            bridge.addWebViewListener(new WebViewListener() {
                private boolean checked = false;

                @Override
                public void onPageLoaded(WebView webView) {
                    String url = webView.getUrl();
                    if (checked || url == null || (!bridge.getLocalUrl().equals(url) &&
                            !url.startsWith(bridge.getLocalUrl() + "/"))) return;
                    checked = true;
                    webView.evaluateJavascript(cacheReset, null);
                }
            });
        } catch (Exception error) {
            Log.e("HabitPlanner", "Could not prepare native cache migration", error);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
