package io.github.sandeshd23.mapsplus;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LockScreenPlugin.class);   // our own small plugin; must be registered before super.onCreate
        super.onCreate(savedInstanceState);
        // Android 13+: ask once to show notifications, so the "Maps+ is navigating" notification
        // (shown while navigating with the screen off) is visible. Navigation still works if refused.
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                   != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1001);
        }
    }
}
