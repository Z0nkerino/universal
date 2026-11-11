package com.eternalinc.universalplanner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The Done button on the focus notification: finishes the task (applied by the app later). */
public class FocusActionReceiver extends BroadcastReceiver {
    static final String ACTION_DONE = "com.eternalinc.universalplanner.FOCUS_DONE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_DONE.equals(intent.getAction())) return;
        String id = intent.getStringExtra("id");
        if (id != null && !id.isEmpty()) WidgetStore.setDone(context, id, true);
        FocusNotification.cancel(context);
        TodayWidgetProvider.updateAll(context);
    }
}
