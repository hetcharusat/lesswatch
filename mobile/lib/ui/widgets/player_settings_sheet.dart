import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';

class PlayerSettingsSheet extends StatefulWidget {
  final double currentSpeed;
  final Function(double speed) onSpeedChanged;
  final VoidCallback onForceResync;
  final List<dynamic> audioTracks;
  final int currentAudioTrack;
  final Function(int trackIndex) onSelectAudioTrack;
  final List<dynamic> subtitleTracks;
  final int currentSubtitleTrack;
  final Function(int subtitleIndex) onSelectSubtitleTrack;

  const PlayerSettingsSheet({
    super.key,
    required this.currentSpeed,
    required this.onSpeedChanged,
    required this.onForceResync,
    this.audioTracks = const [],
    this.currentAudioTrack = 0,
    required this.onSelectAudioTrack,
    this.subtitleTracks = const [],
    this.currentSubtitleTrack = -1,
    required this.onSelectSubtitleTrack,
  });

  @override
  State<PlayerSettingsSheet> createState() => _PlayerSettingsSheetState();
}

class _PlayerSettingsSheetState extends State<PlayerSettingsSheet> {
  late int _selectedAudioTrack;
  late int _selectedSubtitleTrack;

  // Mic & Audio Filter States
  String _noiseSuppression = 'High'; // Off, Low, High
  double _noiseGateThreshold = -32.0; // -50 to -15 dB
  double _micBoost = 1.25; // 1.0 to 2.0x (125%)
  bool _lowLatencyAudio = true;

  final List<double> _speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  @override
  void initState() {
    super.initState();
    _selectedAudioTrack = widget.currentAudioTrack;
    _selectedSubtitleTrack = widget.currentSubtitleTrack;
  }

  @override
  void didUpdateWidget(covariant PlayerSettingsSheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currentAudioTrack != widget.currentAudioTrack) {
      _selectedAudioTrack = widget.currentAudioTrack;
    }
    if (oldWidget.currentSubtitleTrack != widget.currentSubtitleTrack) {
      _selectedSubtitleTrack = widget.currentSubtitleTrack;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92,
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.96),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            border: Border.all(
              color: AppTheme.softBlossom.withOpacity(0.4),
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: AppTheme.electricPink.withOpacity(0.12),
                blurRadius: 32,
                offset: const Offset(0, -8),
              ),
            ],
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Handle
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppTheme.textMuted.withOpacity(0.25),
                        borderRadius: BorderRadius.circular(9999),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.tune_rounded, color: AppTheme.electricPink, size: 22),
                          SizedBox(width: 8),
                          Text(
                            'Player & Audio Settings',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                              color: AppTheme.textMain,
                              letterSpacing: -0.3,
                            ),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: AppTheme.textSub, size: 22),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Section 1: Room Playback Sync
                  _buildSectionCard(
                    title: 'Authoritative Room Sync',
                    icon: Icons.sync_rounded,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Keep your playback locked in sub-second sync with everyone in the room.',
                          style: TextStyle(fontSize: 12, color: AppTheme.textMuted, height: 1.3),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () {
                              HapticFeedback.mediumImpact();
                              widget.onForceResync();
                              Navigator.of(context).pop();
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('⚡ Resynced with room host!'),
                                  duration: Duration(seconds: 2),
                                  backgroundColor: AppTheme.electricPink,
                                ),
                              );
                            },
                            icon: const Icon(Icons.bolt_rounded, size: 18),
                            label: const Text('Force Re-sync to Room Host', style: TextStyle(fontWeight: FontWeight.w800)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.electricPink,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              elevation: 0,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Section 2: Audio Tracks
                  if (widget.audioTracks.isNotEmpty) ...[
                    _buildSectionCard(
                      title: 'Audio Tracks (${widget.audioTracks.length})',
                      icon: Icons.audiotrack_rounded,
                      child: Column(
                        children: widget.audioTracks.asMap().entries.map((entry) {
                          final idx = entry.key;
                          final track = entry.value;
                          final title = track is Map ? (track['title'] ?? track['name'] ?? track['language'] ?? 'Track ${idx + 1}') : 'Track ${idx + 1}';
                          final lang = track is Map ? (track['language'] ?? '') : '';
                          final isSelected = _selectedAudioTrack == idx;

                          return Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () {
                                HapticFeedback.selectionClick();
                                setState(() {
                                  _selectedAudioTrack = idx;
                                });
                                widget.onSelectAudioTrack(idx);
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                decoration: BoxDecoration(
                                  color: isSelected ? AppTheme.electricPink.withOpacity(0.12) : AppTheme.pinkBackground,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: isSelected ? AppTheme.electricPink : AppTheme.softBlossom.withOpacity(0.2),
                                    width: isSelected ? 1.5 : 1,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      isSelected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                                      color: isSelected ? AppTheme.electricPink : AppTheme.textMuted,
                                      size: 18,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        title.toString(),
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                                          color: isSelected ? AppTheme.deepMagenta : AppTheme.textMain,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    if (lang.toString().isNotEmpty)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: AppTheme.electricPink.withOpacity(0.15),
                                          borderRadius: BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                          lang.toString().toUpperCase(),
                                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppTheme.deepMagenta),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],

                  // Section 3: Subtitles
                  _buildSectionCard(
                    title: 'Subtitles',
                    icon: Icons.subtitles_rounded,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Subtitle Tracks options
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            // Off Option
                            ChoiceChip(
                              label: const Text('Off'),
                              selected: _selectedSubtitleTrack == -1,
                              selectedColor: AppTheme.electricPink,
                              backgroundColor: AppTheme.pinkBackground,
                              labelStyle: TextStyle(
                                fontSize: 12,
                                fontWeight: _selectedSubtitleTrack == -1 ? FontWeight.w800 : FontWeight.w600,
                                color: _selectedSubtitleTrack == -1 ? Colors.white : AppTheme.textMain,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                                side: BorderSide(
                                  color: _selectedSubtitleTrack == -1 ? AppTheme.electricPink : AppTheme.softBlossom.withOpacity(0.3),
                                ),
                              ),
                              onSelected: (_) {
                                HapticFeedback.selectionClick();
                                setState(() {
                                  _selectedSubtitleTrack = -1;
                                });
                                widget.onSelectSubtitleTrack(-1);
                              },
                            ),
                            ...widget.subtitleTracks.asMap().entries.map((entry) {
                              final idx = entry.key;
                              final sub = entry.value;
                              final subTitle = sub is Map ? (sub['title'] ?? sub['language'] ?? 'Sub ${idx + 1}') : 'Sub ${idx + 1}';
                              final isSelected = _selectedSubtitleTrack == idx;

                              return ChoiceChip(
                                label: Text(subTitle.toString()),
                                selected: isSelected,
                                selectedColor: AppTheme.electricPink,
                                backgroundColor: AppTheme.pinkBackground,
                                labelStyle: TextStyle(
                                  fontSize: 12,
                                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                                  color: isSelected ? Colors.white : AppTheme.textMain,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                  side: BorderSide(
                                    color: isSelected ? AppTheme.electricPink : AppTheme.softBlossom.withOpacity(0.3),
                                  ),
                                ),
                                onSelected: (_) {
                                  HapticFeedback.selectionClick();
                                  setState(() {
                                    _selectedSubtitleTrack = idx;
                                  });
                                  widget.onSelectSubtitleTrack(idx);
                                },
                              );
                            }),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Section 4: Playback Speed
                  _buildSectionCard(
                    title: 'Playback Speed',
                    icon: Icons.speed_rounded,
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _speeds.map((s) {
                        final isSelected = (widget.currentSpeed - s).abs() < 0.05;
                        return ChoiceChip(
                          label: Text(
                            s == 1.0 ? 'Normal' : '${s}x',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                              color: isSelected ? Colors.white : AppTheme.textMain,
                            ),
                          ),
                          selected: isSelected,
                          selectedColor: AppTheme.electricPink,
                          backgroundColor: AppTheme.pinkBackground,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                            side: BorderSide(
                              color: isSelected ? AppTheme.electricPink : AppTheme.softBlossom.withOpacity(0.3),
                            ),
                          ),
                          onSelected: (val) {
                            if (val) {
                              HapticFeedback.selectionClick();
                              widget.onSpeedChanged(s);
                            }
                          },
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Section 5: Microphone Noise Suppression & Gate
                  _buildSectionCard(
                    title: 'Microphone & Noise Gate',
                    icon: Icons.mic_rounded,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Background noise suppression level:',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.textMain),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: ['Off', 'Low', 'High'].map((lvl) {
                            final isSel = _noiseSuppression == lvl;
                            return Expanded(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 4),
                                child: GestureDetector(
                                  onTap: () {
                                    HapticFeedback.selectionClick();
                                    setState(() => _noiseSuppression = lvl);
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 8),
                                    decoration: BoxDecoration(
                                      color: isSel ? AppTheme.electricPink : AppTheme.pinkBackground,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: isSel ? AppTheme.electricPink : AppTheme.softBlossom.withOpacity(0.3),
                                      ),
                                    ),
                                    child: Center(
                                      child: Text(
                                        lvl,
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w800,
                                          color: isSel ? Colors.white : AppTheme.textMain,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 14),

                        // Noise Gate Slider
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Noise Gate Threshold',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textMain),
                            ),
                            Text(
                              '${_noiseGateThreshold.toInt()} dB',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppTheme.deepMagenta),
                            ),
                          ],
                        ),
                        SliderTheme(
                          data: SliderTheme.of(context).copyWith(
                            activeTrackColor: AppTheme.electricPink,
                            inactiveTrackColor: AppTheme.pinkBackground,
                            thumbColor: AppTheme.deepMagenta,
                            trackHeight: 3,
                          ),
                          child: Slider(
                            value: _noiseGateThreshold,
                            min: -50.0,
                            max: -15.0,
                            onChanged: (val) {
                              setState(() => _noiseGateThreshold = val);
                            },
                          ),
                        ),

                        // Mic Boost Slider
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Mic Input Boost (Whisper Mode)',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textMain),
                            ),
                            Text(
                              '${(_micBoost * 100).toInt()}%',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppTheme.deepMagenta),
                            ),
                          ],
                        ),
                        SliderTheme(
                          data: SliderTheme.of(context).copyWith(
                            activeTrackColor: AppTheme.electricPink,
                            inactiveTrackColor: AppTheme.pinkBackground,
                            thumbColor: AppTheme.deepMagenta,
                            trackHeight: 3,
                          ),
                          child: Slider(
                            value: _micBoost,
                            min: 1.0,
                            max: 2.0,
                            onChanged: (val) {
                              setState(() => _micBoost = val);
                            },
                          ),
                        ),
                        const SizedBox(height: 6),

                        // Low Latency Toggle
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text(
                            'Earbuds Call Compression Bypass',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.textMain),
                          ),
                          subtitle: const Text(
                            'Bypasses SCO Bluetooth call compression for crisp movie audio while on voice.',
                            style: TextStyle(fontSize: 11, color: AppTheme.textMuted),
                          ),
                          thumbColor: WidgetStateProperty.all(AppTheme.electricPink),
                          value: _lowLatencyAudio,
                          onChanged: (val) {
                            HapticFeedback.lightImpact();
                            setState(() => _lowLatencyAudio = val);
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surfaceGlass,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.softBlossom.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: AppTheme.electricPink, size: 17),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.textMain,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}
