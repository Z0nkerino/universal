package com.eternalinc.universalplanner;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONException;

/** Bridge between the web app and the home screen widget / focus notification (src/lib/widgets.ts). */
@CapacitorPlugin(name = "UniversalWidgets", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class UniversalWidgetsPlugin extends Plugin {

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("Missing json");
            return;
        }
        WidgetStore.saveSnapshot(getContext(), json);
        TodayWidgetProvider.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takePendingActions(PluginCall call) {
        JSONArray actions = WidgetStore.takeActions(getContext());
        JSObject ret = new JSObject();
        try {
            ret.put("actions", new JSArray(actions.toString()));
        } catch (JSONException e) {
            ret.put("actions", new JSArray());
        }
        call.resolve(ret);
    }

    /** Android's counterpart of a Live Activity: an ongoing notification with a countdown and Done. */
    @PluginMethod
    public void startActivity(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "startAfterPermission");
            return;
        }
        showFocus(call);
    }

    @PermissionCallback
    private void startAfterPermission(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) showFocus(call);
        else call.resolve(new JSObject().put("started", false));
    }

    private void showFocus(PluginCall call) {
        FocusNotification.show(getContext(), call.getString("id", ""), call.getString("title", ""), call.getDouble("endsAt", 0d).longValue(), call.getString("doneLabel", "Done"));
        call.resolve(new JSObject().put("started", true));
    }

    @PluginMethod
    public void updateActivity(PluginCall call) {
        if (Boolean.TRUE.equals(call.getBoolean("paused", false))) FocusNotification.pause(getContext(), call.getDouble("remainingMs", 0d).longValue());
        else FocusNotification.resume(getContext(), call.getDouble("endsAt", 0d).longValue());
        call.resolve();
    }

    @PluginMethod
    public void endActivity(PluginCall call) {
        FocusNotification.cancel(getContext());
        call.resolve();
    }
}
