package com.eternalinc.universalplanner;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Home screen widget. Small: today's ring and the next task. Medium: the next three tasks with
 * checkboxes. Large: today's list with times. Checkboxes work without opening the app.
 */
public class TodayWidgetProvider extends AppWidgetProvider {
    static final String ACTION_TOGGLE = "com.eternalinc.universalplanner.TOGGLE_TASK";
    private static final int[] ROWS = { R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5 };
    private static final int[] CHECKS = { R.id.check0, R.id.check1, R.id.check2, R.id.check3, R.id.check4, R.id.check5 };
    private static final int[] TITLES = { R.id.title0, R.id.title1, R.id.title2, R.id.title3, R.id.title4, R.id.title5 };
    private static final int[] TIMES = { R.id.time0, R.id.time1, R.id.time2, R.id.time3, R.id.time4, R.id.time5 };

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, TodayWidgetProvider.class))) m.updateAppWidget(id, views(c));
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        manager.updateAppWidget(id, views(context));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_TOGGLE.equals(intent.getAction())) {
            WidgetStore.setDone(context, intent.getStringExtra("id"), intent.getBooleanExtra("done", true));
            updateAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    /** One layout per size; the launcher picks the one that fits (Android 12+). */
    private static RemoteViews views(Context c) {
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> sizes = new HashMap<>();
            sizes.put(new SizeF(110f, 110f), small(c));
            sizes.put(new SizeF(250f, 110f), list(c, R.layout.widget_medium, 3, false));
            sizes.put(new SizeF(250f, 260f), list(c, R.layout.widget_large, 6, true));
            return new RemoteViews(sizes);
        }
        return list(c, R.layout.widget_medium, 3, false);
    }

    private static RemoteViews small(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_small);
        List<WidgetStore.Task> today = WidgetStore.today(c);
        int done = countDone(today);
        v.setProgressBar(R.id.ring, Math.max(today.size(), 1), done, false);
        v.setTextViewText(R.id.count, done + "/" + today.size());
        v.setTextViewText(R.id.label, WidgetStore.string(c, "next", "Next").toUpperCase(Locale.getDefault()));
        WidgetStore.Task next = next(today);
        if (next != null) {
            v.setTextViewText(R.id.nextTitle, next.title);
            v.setTextViewText(R.id.nextTime, next.start != 0 ? time(c, next.start) : "");
        } else {
            v.setTextViewText(R.id.nextTitle, WidgetStore.string(c, today.isEmpty() ? "nothingPlanned" : "allDone", today.isEmpty() ? "Nothing planned" : "All done"));
            v.setTextViewText(R.id.nextTime, "");
        }
        v.setOnClickPendingIntent(R.id.root, openApp(c, "universalplanner://today", 10));
        return v;
    }

    private static RemoteViews list(Context c, int layout, int rows, boolean showDone) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        List<WidgetStore.Task> today = WidgetStore.today(c);
        int done = countDone(today);
        v.setProgressBar(R.id.progress, Math.max(today.size(), 1), done, false);
        v.setTextViewText(R.id.count, done + "/" + today.size());
        v.setTextViewText(R.id.header, WidgetStore.string(c, "today", "Today"));
        v.setTextViewText(R.id.add, "+ " + WidgetStore.string(c, "add", "Add"));
        v.setOnClickPendingIntent(R.id.add, openApp(c, "universalplanner://quickadd", 11));
        v.setOnClickPendingIntent(R.id.root, openApp(c, "universalplanner://today", 12));
        int shown = 0;
        for (WidgetStore.Task t : today) {
            if (shown >= rows) break;
            if (t.done && !showDone) continue;
            v.setViewVisibility(ROWS[shown], View.VISIBLE);
            v.setTextViewText(TITLES[shown], t.title);
            v.setTextViewText(TIMES[shown], t.start != 0 ? time(c, t.start) : WidgetStore.string(c, "anytime", "Anytime"));
            v.setImageViewResource(CHECKS[shown], t.done ? R.drawable.widget_check_on : R.drawable.widget_check_off);
            // Done tasks fade (paint flags such as strike-through can't be set on remote views).
            v.setTextColor(TITLES[shown], c.getColor(t.done ? R.color.widget_muted : R.color.widget_fg));
            Intent toggle = new Intent(c, TodayWidgetProvider.class).setAction(ACTION_TOGGLE).putExtra("id", t.id).putExtra("done", !t.done);
            // A distinct data URI per task keeps each row's PendingIntent separate.
            toggle.setData(Uri.parse("universalplanner://toggle/" + Uri.encode(t.id)));
            v.setOnClickPendingIntent(CHECKS[shown], PendingIntent.getBroadcast(c, 100 + shown, toggle, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            shown++;
        }
        for (int i = shown; i < rows; i++) v.setViewVisibility(ROWS[i], View.GONE);
        boolean empty = shown == 0;
        v.setViewVisibility(R.id.empty, empty ? View.VISIBLE : View.GONE);
        if (empty) v.setTextViewText(R.id.empty, WidgetStore.string(c, today.isEmpty() ? "nothingPlanned" : "allDone", today.isEmpty() ? "Nothing planned" : "All done"));
        return v;
    }

    private static int countDone(List<WidgetStore.Task> list) {
        int n = 0;
        for (WidgetStore.Task t : list) if (t.done) n++;
        return n;
    }

    /** The first open task still to come, else the first open one. */
    private static WidgetStore.Task next(List<WidgetStore.Task> list) {
        long now = System.currentTimeMillis();
        WidgetStore.Task firstOpen = null;
        for (WidgetStore.Task t : list) {
            if (t.done) continue;
            if (firstOpen == null) firstOpen = t;
            if (t.start != 0 && t.start >= now - 30 * 60_000L) return t;
        }
        return firstOpen;
    }

    private static String time(Context c, long ms) {
        return new SimpleDateFormat(WidgetStore.clock24(c) ? "HH:mm" : "h:mm a", Locale.getDefault()).format(new Date(ms));
    }

    private static PendingIntent openApp(Context c, String url, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
