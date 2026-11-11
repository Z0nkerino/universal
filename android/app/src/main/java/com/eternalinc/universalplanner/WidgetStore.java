package com.eternalinc.universalplanner;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The snapshot of today's tasks the web app writes for the widget (see src/lib/widgets.ts),
 * plus check-offs made in the widget, which the app applies when it's next active.
 */
final class WidgetStore {
    private static final String PREFS = "universal_widgets";
    private static final String SNAPSHOT = "snapshot";
    private static final String ACTIONS = "pendingActions";

    static final class Task {
        String id;
        String title;
        String day;
        long start;
        boolean done;
        int priority;
    }

    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject snapshot(Context c) {
        try {
            return new JSONObject(prefs(c).getString(SNAPSHOT, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** From the app. Check-offs it hasn't applied yet stay visible on top. */
    static void saveSnapshot(Context c, String json) {
        try {
            JSONObject s = new JSONObject(json);
            JSONArray tasks = s.optJSONArray("tasks");
            JSONArray actions = actions(c);
            if (tasks != null) {
                for (int i = 0; i < actions.length(); i++) {
                    JSONObject a = actions.getJSONObject(i);
                    for (int j = 0; j < tasks.length(); j++) {
                        JSONObject t = tasks.getJSONObject(j);
                        if (t.optString("id").equals(a.optString("id"))) t.put("done", "complete".equals(a.optString("type")));
                    }
                }
            }
            prefs(c).edit().putString(SNAPSHOT, s.toString()).apply();
        } catch (JSONException ignored) {
            // A bad snapshot leaves the last good one in place.
        }
    }

    static String string(Context c, String key, String fallback) {
        JSONObject strings = snapshot(c).optJSONObject("strings");
        return strings != null ? strings.optString(key, fallback) : fallback;
    }

    static boolean clock24(Context c) {
        return snapshot(c).optBoolean("clock24", false);
    }

    static String todayKey() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /** Today's tasks (overdue open ones included): timed ones by time, then the rest by priority. */
    static List<Task> today(Context c) {
        List<Task> out = new ArrayList<>();
        JSONArray tasks = snapshot(c).optJSONArray("tasks");
        if (tasks == null) return out;
        String today = todayKey();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject o = tasks.optJSONObject(i);
            if (o == null) continue;
            Task t = new Task();
            t.id = o.optString("id");
            t.title = o.optString("title");
            t.day = o.optString("day");
            t.start = o.has("start") && !o.isNull("start") ? o.optLong("start") : 0;
            t.done = o.optBoolean("done");
            t.priority = o.optInt("priority");
            if (t.day.equals(today) || (t.day.compareTo(today) < 0 && !t.done)) out.add(t);
        }
        Collections.sort(out, (a, b) -> {
            if (a.start != 0 && b.start != 0) return Long.compare(a.start, b.start);
            if (a.start != 0) return -1;
            if (b.start != 0) return 1;
            return Integer.compare(b.priority, a.priority);
        });
        return out;
    }

    /** From the widget: checks a task off (or on) now and queues the change for the app. */
    static void setDone(Context c, String id, boolean done) {
        try {
            JSONObject s = snapshot(c);
            JSONArray tasks = s.optJSONArray("tasks");
            if (tasks != null) {
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject t = tasks.getJSONObject(i);
                    if (t.optString("id").equals(id)) t.put("done", done);
                }
            }
            JSONArray old = actions(c);
            JSONArray actions = new JSONArray();
            for (int i = 0; i < old.length(); i++) if (!old.getJSONObject(i).optString("id").equals(id)) actions.put(old.get(i));
            actions.put(new JSONObject().put("type", done ? "complete" : "uncomplete").put("id", id).put("at", System.currentTimeMillis()));
            prefs(c).edit().putString(SNAPSHOT, s.toString()).putString(ACTIONS, actions.toString()).apply();
        } catch (JSONException ignored) {
            // Nothing to queue.
        }
    }

    static JSONArray actions(Context c) {
        try {
            return new JSONArray(prefs(c).getString(ACTIONS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static JSONArray takeActions(Context c) {
        JSONArray a = actions(c);
        prefs(c).edit().remove(ACTIONS).apply();
        return a;
    }
}
