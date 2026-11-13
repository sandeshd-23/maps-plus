package io.github.sandeshd23.mapsplus;

import android.app.Activity;
import android.os.Build;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the page show Maps+ over the lock screen while navigating, like Google Maps: press the power button
 * and the map is there. The phone stays locked; going anywhere else still needs the PIN / fingerprint.
 * JS: Capacitor.nativePromise('LockScreen', 'set', { on: true|false })
 */
@CapacitorPlugin(name = "LockScreen")
public class LockScreenPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 27) {
                activity.setShowWhenLocked(on);
            } else if (on) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
            }
            call.resolve();
        });
    }
}
