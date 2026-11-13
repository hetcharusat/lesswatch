import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';
import '../../data/models/user_profile.dart';
import '../../data/services/api_service.dart';
import '../screens/player_screen.dart';
import '../widgets/glass_card.dart';

class LoungeTab extends StatefulWidget {
  final UserProfile currentProfile;
  final String token;

  const LoungeTab({
    super.key,
    required this.currentProfile,
    required this.token,
  });

  @override
  State<LoungeTab> createState() => _LoungeTabState();
}

class _LoungeTabState extends State<LoungeTab> {
  final ApiService _apiService = ApiService();
  Map<String, dynamic>? _liveStatus;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchStatus();
  }

  Future<void> _fetchStatus() async {
    final status = await _apiService.getLiveStatus();
    if (mounted) {
      setState(() {
        _liveStatus = status;
        _isLoading = false;
      });
    }
  }

  void _joinCommonRoom([String? mediaUrl, String? title]) {
    HapticFeedback.mediumImpact();
    String? effectiveUrl = mediaUrl;
    String? effectiveTitle = title;
    double initialPlaybackTime = 0.0;

    if (_liveStatus != null) {
      if (effectiveUrl == null && _liveStatus!['media'] is Map) {
        effectiveUrl = _liveStatus!['media']['url']?.toString();
      }
      if (effectiveTitle == null) {
        if (_liveStatus!['media'] is Map) {
          effectiveTitle = _liveStatus!['media']['title']?.toString();
        } else if (_liveStatus!['isWatching'] == true) {
          effectiveTitle = _liveStatus!['activeTitle']?.toString();
        }
      }
      if (_liveStatus!['playback'] is Map) {
        initialPlaybackTime = (_liveStatus!['playback']['currentTime'] as num?)?.toDouble() ?? 0.0;
      }
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PlayerScreen(
          currentProfile: widget.currentProfile,
          initialMediaUrl: effectiveUrl,
          initialMediaTitle: effectiveTitle,
          initialCurrentTime: initialPlaybackTime,
          isLiveRoomJoin: true,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppTheme.electricPink));
    }

    final isWatching = _liveStatus?['isWatching'] == true;
    final activeTitle = isWatching
        ? (_liveStatus?['activeTitle'] ?? 'Playing in Common Room')
        : 'Common Room is Idle';
    final totalUsers = _liveStatus?['totalUsers'] ?? 0;
    final watchers = (_liveStatus?['watchers'] as List<dynamic>? ?? []);
    final media = _liveStatus?['media'] as Map<String, dynamic>?;

    return RefreshIndicator(
      color: AppTheme.electricPink,
      onRefresh: _fetchStatus,
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        children: [
          // 1. Common Room Hero Glass Card
          GlassCard(
            borderRadius: 26,
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: isWatching
                            ? AppTheme.emeraldGreen.withOpacity(0.12)
                            : Colors.grey.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(9999),
                        border: Border.all(
                          color: isWatching
                              ? AppTheme.emeraldGreen.withOpacity(0.4)
                              : Colors.grey.withOpacity(0.2),
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isWatching ? AppTheme.emeraldGreen : AppTheme.textMuted,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            isWatching ? 'LIVE IN COMMON ROOM' : 'COMMON ROOM IDLE',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              color: isWatching ? AppTheme.emeraldGreen : AppTheme.textMuted,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.electricPink.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(9999),
                        border: Border.all(color: AppTheme.electricPink.withOpacity(0.25)),
                      ),
                      child: Text(
                        '$totalUsers Watching',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.electricPink,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                Text(
                  activeTitle,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                    color: AppTheme.textMain,
                    height: 1.25,
                    letterSpacing: -0.3,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 10),

                if (watchers.isNotEmpty) ...[
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 4, right: 4),
                        child: Text(
                          'Watching now:',
                          style: TextStyle(fontSize: 12, color: AppTheme.textMuted, fontWeight: FontWeight.w600),
                        ),
                      ),
                      for (final w in watchers) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(9999),
                            border: Border.all(color: const Color(0x3DF472B6)),
                            boxShadow: const [
                              BoxShadow(color: Color(0x0A000000), blurRadius: 4, offset: Offset(0, 1)),
                            ],
                          ),
                          child: Text(
                            w['name']?.toString() ?? 'Friend',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: AppTheme.textMain,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 18),
                ] else
                  const SizedBox(height: 12),

                // Giant Join Button
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: () => _joinCommonRoom(media?['url']?.toString(), media?['title']?.toString()),
                    icon: const Icon(Icons.play_arrow_rounded, size: 24),
                    label: Text(
                      isWatching ? 'Join Watch Party' : 'Open Common Lounge',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.electricPink,
                      foregroundColor: Colors.white,
                      elevation: 6,
                      shadowColor: const Color(0x59EC4899),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
