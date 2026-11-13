package tech.atmyhome.watch_together

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "tech.atmyhome.watch_together/audio_routing"
    private var isSpeakerRequested = false

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.addOnModeChangedListener(mainExecutor) { mode ->
                if (!isSpeakerRequested && mode != AudioManager.MODE_NORMAL) {
                    try {
                        if (audioManager.isBluetoothScoOn) {
                            audioManager.stopBluetoothSco()
                            audioManager.isBluetoothScoOn = false
                        }
                        audioManager.clearCommunicationDevice()
                        audioManager.mode = AudioManager.MODE_NORMAL
                        audioManager.isSpeakerphoneOn = false
                    } catch (_: Exception) {}
                }
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "bypassCallMode", "routeToEarbuds" -> {
                    isSpeakerRequested = false
                    try {
                        if (audioManager.isBluetoothScoOn) {
                            audioManager.stopBluetoothSco()
                            audioManager.isBluetoothScoOn = false
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            audioManager.clearCommunicationDevice()
                        }
                        audioManager.mode = AudioManager.MODE_NORMAL
                        audioManager.isSpeakerphoneOn = false
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("AUDIO_ERROR", e.message, null)
                    }
                }

                "routeToSpeaker" -> {
                    isSpeakerRequested = true
                    try {
                        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                        if (audioManager.isBluetoothScoOn) {
                            audioManager.stopBluetoothSco()
                            audioManager.isBluetoothScoOn = false
                        }
                        audioManager.isSpeakerphoneOn = true
                        
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            val devices = audioManager.availableCommunicationDevices
                            val speaker = devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                            if (speaker != null) {
                                audioManager.setCommunicationDevice(speaker)
                            }
                        }
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("AUDIO_ERROR", e.message, null)
                    }
                }

                "resetAudioMode" -> {
                    isSpeakerRequested = false
                    try {
                        if (audioManager.isBluetoothScoOn) {
                            audioManager.stopBluetoothSco()
                            audioManager.isBluetoothScoOn = false
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            audioManager.clearCommunicationDevice()
                        }
                        audioManager.mode = AudioManager.MODE_NORMAL
                        audioManager.isSpeakerphoneOn = false
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("AUDIO_ERROR", e.message, null)
                    }
                }

                "getAudioDevices" -> {
                    try {
                        val deviceList = mutableListOf<Map<String, Any>>()
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            val outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                            for (dev in outputs) {
                                val isBluetooth = dev.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                                        dev.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                                val isSpeaker = dev.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                                val isWired = dev.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                                        dev.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES

                                deviceList.add(mapOf(
                                    "id" to dev.id,
                                    "name" to dev.productName.toString(),
                                    "type" to dev.type,
                                    "isBluetooth" to isBluetooth,
                                    "isSpeaker" to isSpeaker,
                                    "isWired" to isWired
                                ))
                            }
                        }
                        result.success(deviceList)
                    } catch (e: Exception) {
                        result.error("AUDIO_ERROR", e.message, null)
                    }
                }

                else -> result.notImplemented()
            }
        }
    }
}
