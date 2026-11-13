import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';

class DynamicAudioPill extends StatefulWidget {
  final bool isMicMuted;
  final VoidCallback onToggleMic;
  final String statusText;
  final bool isSpeaking;

  const DynamicAudioPill({
    super.key,
    required this.isMicMuted,
    required this.onToggleMic,
    this.statusText = 'Voice Live',
    this.isSpeaking = false,
  });

  @override
  State<DynamicAudioPill> createState() => _DynamicAudioPillState();
}

class _DynamicAudioPillState extends State<DynamicAudioPill> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(top: 8.0),
        child: Align(
          alignment: Alignment.topCenter,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(9999),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E0A1E).withOpacity(0.85),
                  borderRadius: BorderRadius.circular(9999),
                  border: Border.all(
                    color: widget.isSpeaking
                        ? AppTheme.electricPink.withOpacity(0.8)
                        : AppTheme.electricPink.withOpacity(0.35),
                    width: 1.2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: widget.isSpeaking
                          ? AppTheme.electricPink.withOpacity(0.4)
                          : Colors.black.withOpacity(0.5),
                      blurRadius: 16,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Mic button
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        widget.onToggleMic();
                      },
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: widget.isMicMuted
                              ? AppTheme.alertRed.withOpacity(0.25)
                              : AppTheme.emeraldGreen.withOpacity(0.25),
                          border: Border.all(
                            color: widget.isMicMuted
                                ? AppTheme.alertRed.withOpacity(0.5)
                                : AppTheme.emeraldGreen.withOpacity(0.6),
                          ),
                        ),
                        child: Icon(
                          widget.isMicMuted ? Icons.mic_off : Icons.mic,
                          color: widget.isMicMuted ? AppTheme.alertRed : AppTheme.emeraldGreen,
                          size: 15,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Status Text / Waveform
                    Text(
                      widget.statusText,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textMain,
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Hi-Fi Badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.electricPink.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(9999),
                        border: Border.all(
                          color: AppTheme.electricPink.withOpacity(0.5),
                          width: 0.8,
                        ),
                      ),
                      child: const Text(
                        'HI-FI',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          color: AppTheme.lightCherry,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

