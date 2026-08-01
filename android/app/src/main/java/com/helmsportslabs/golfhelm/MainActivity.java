package com.helmsportslabs.golfhelm;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Must match:
     *   - the {@code com.google.firebase.messaging.default_notification_channel_id}
     *     meta-data in AndroidManifest.xml, and
     *   - the {@code channelId} default in supabase/functions/send-fcm-push.
     *
     * Change it in all three or nowhere.
     */
    public static final String DEFAULT_CHANNEL_ID = "helm_default";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createDefaultNotificationChannel();
    }

    /**
     * On API 26+ a notification posted to a channel that does not exist is
     * dropped by the system — silently. No exception, no logcat entry, nothing
     * server-side to observe: FCM reports the send as successful because it
     * *was* delivered; Android then discards it on the device. That failure
     * mode is invisible from both ends, so the channel is created here on every
     * launch rather than relying on the FCM SDK's implicit fallback channel.
     *
     * createNotificationChannel is idempotent — re-creating an existing channel
     * is a no-op, and notably it will NOT override importance the user has
     * since changed. That is the desired behaviour.
     */
    private void createDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return; // Pre-26 has no channels; notifications post directly.
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                DEFAULT_CHANNEL_ID,
                "Team updates",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Round results, schedule changes, messages and coach alerts.");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
