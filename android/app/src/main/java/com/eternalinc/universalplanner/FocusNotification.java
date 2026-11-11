package com.eternalinc.universalplanner;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Locale;

/**
 * The running task or focus session as an ongoing notification: the task name, a countdown and a
 * Done button — Android's counterpart of the iOS Live Activity.
 */
final class FocusNotification {
    static final String CHANNEL = "focus";
    static final int ID = 4711;
    private static final String PREFS = "universal_focus";

    private FocusNotification() {}

    static void show(Context c, String id, String title, long endsAt, String doneLabel) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("id", id).putString("title", title).putLong("endsAt", endsAt).putString("done", doneLabel).apply();
        post(c, endsAt, -1);
    }

    static void pause(Context c, long remainingMs) {
        post(c, 0, remainingMs);
    }

    static void resume(Context c, long endsAt) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("endsAt", endsAt).apply();
        post(c, endsAt, -1);
    }

    static void cancel(Context c) {
        NotificationManagerCompat.from(c).cancel(ID);
    }

    private static void post(Context c, long endsAt, long pausedMs) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = p.getString("id", "");
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.focus_channel), NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        Intent done = new Intent(c, FocusActionReceiver.class).setAction(FocusActionReceiver.ACTION_DONE).putExtra("id", id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_focus)
            .setColor(0xFF2F6BFF)
            .setContentTitle(p.getString("title", ""))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setContentIntent(PendingIntent.getActivity(c, 1, open, flags))
            .addAction(0, p.getString("done", "Done"), PendingIntent.getBroadcast(c, 2, done, flags));
        if (pausedMs >= 0) {
            long s = pausedMs / 1000;
            b.setContentText(String.format(Locale.US, "%d:%02d ⏸", s / 60, s % 60)).setShowWhen(false);
        } else {
            b.setUsesChronometer(true).setChronometerCountDown(true).setWhen(endsAt).setShowWhen(true);
        }
        try {
            NotificationManagerCompat.from(c).notify(ID, b.build());
        } catch (SecurityException ignored) {
            // Notifications aren't allowed; the in-app timer still runs.
        }
    }
}
