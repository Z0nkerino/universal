package com.eternalinc.universalplanner;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Feeds the home screen widget and the focus notification.
        registerPlugin(UniversalWidgetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
