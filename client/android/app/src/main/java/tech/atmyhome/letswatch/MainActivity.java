package tech.atmyhome.letswatch;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQ_CODE = 4402;
    private AudioManager audioManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen awake for uninterrupted movie playback
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        // Request runtime audio & bluetooth permissions
        requestRequiredPermissions();

        // Register hardware audio bridge with WebView
        setupAudioBridge();
    }

    private void requestRequiredPermissions() {
        List<String> neededPermissions = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            neededPermissions.add(Manifest.permission.RECORD_AUDIO);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                neededPermissions.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
        }

        if (!neededPermissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, neededPermissions.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    private void setupAudioBridge() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.addJavascriptInterface(new AudioBridge(), "AndroidAudioBridge");

            // Wrap WebChromeClient to auto-grant WebRTC permissions
            final WebChromeClient originalClient = getBridge().getWebView().getWebChromeClient();
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        // Auto-grant all requested resources (audio capture / video capture)
                        request.grant(request.getResources());
                    });
                }
            });
        }
    }

    public class AudioBridge {

        /**
         * Enforces Built-in Phone Mic so connected Bluetooth Earbuds stay in
         * pristine A2DP Stereo mode (320kbps) without dropping into 8kHz SCO Call Mode.
         */
        @JavascriptInterface
        public String forcePhoneMicForA2DP() {
            try {
                if (audioManager == null) return "{\"success\":false,\"error\":\"no_audio_mgr\"}";

                // 1. Explicitly turn off Bluetooth SCO / Hands-Free VoIP telephone mode
                audioManager.setBluetoothScoOn(false);
                audioManager.stopBluetoothSco();

                // 2. Android 12+ (API 31+): Pin communication device to TYPE_BUILTIN_MIC
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    List<AudioDeviceInfo> commDevices = audioManager.getAvailableCommunicationDevices();
                    AudioDeviceInfo builtinMic = null;
                    for (AudioDeviceInfo dev : commDevices) {
                        if (dev.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) {
                            builtinMic = dev;
                            break;
                        }
                    }

                    if (builtinMic != null) {
                        boolean ok = audioManager.setCommunicationDevice(builtinMic);
                        return "{\"success\":true,\"mode\":\"builtin_mic_a2dp_preserved\",\"setCommunicationDevice\":" + ok + "}";
                    }
                }

                // Fallback for older Android versions
                audioManager.setSpeakerphoneOn(false);
                return "{\"success\":true,\"mode\":\"sco_disabled\"}";
            } catch (Exception e) {
                return "{\"success\":false,\"error\":\"" + e.getMessage() + "\"}";
            }
        }

        /**
         * Revert back to default audio routing
         */
        @JavascriptInterface
        public String resetAudioRouting() {
            try {
                if (audioManager == null) return "{\"success\":false}";
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    audioManager.clearCommunicationDevice();
                }
                audioManager.setBluetoothScoOn(false);
                audioManager.stopBluetoothSco();
                return "{\"success\":true,\"mode\":\"default\"}";
            } catch (Exception e) {
                return "{\"success\":false,\"error\":\"" + e.getMessage() + "\"}";
            }
        }

        /**
         * Switch explicitly to Bluetooth microphone (warning: SCO call mode will compress movie audio)
         */
        @JavascriptInterface
        public String forceBluetoothMic() {
            try {
                if (audioManager == null) return "{\"success\":false}";
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    List<AudioDeviceInfo> commDevices = audioManager.getAvailableCommunicationDevices();
                    for (AudioDeviceInfo dev : commDevices) {
                        if (dev.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                            dev.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET) {
                            audioManager.setCommunicationDevice(dev);
                            return "{\"success\":true,\"mode\":\"bluetooth_sco\"}";
                        }
                    }
                }
                audioManager.startBluetoothSco();
                audioManager.setBluetoothScoOn(true);
                return "{\"success\":true,\"mode\":\"bluetooth_sco_legacy\"}";
            } catch (Exception e) {
                return "{\"success\":false,\"error\":\"" + e.getMessage() + "\"}";
            }
        }

        /**
         * Query current audio routing status
         */
        @JavascriptInterface
        public String getAudioStatus() {
            try {
                JSONObject status = new JSONObject();
                if (audioManager == null) {
                    status.put("available", false);
                    return status.toString();
                }

                status.put("isBluetoothScoOn", audioManager.isBluetoothScoOn());
                status.put("isSpeakerphoneOn", audioManager.isSpeakerphoneOn());
                status.put("isMusicActive", audioManager.isMusicActive());
                status.put("sdkInt", Build.VERSION.SDK_INT);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    AudioDeviceInfo cur = audioManager.getCommunicationDevice();
                    if (cur != null) {
                        status.put("commDeviceType", cur.getType());
                        status.put("commDeviceName", cur.getProductName().toString());
                    } else {
                        status.put("commDeviceType", "none");
                    }
                }

                return status.toString();
            } catch (Exception e) {
                return "{\"error\":\"" + e.getMessage() + "\"}";
            }
        }

        @JavascriptInterface
        public void setKeepScreenOn(final boolean keepOn) {
            runOnUiThread(() -> {
                if (keepOn) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }
}
