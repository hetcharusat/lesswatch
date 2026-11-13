import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../data/models/user_profile.dart';
import '../../data/services/api_service.dart';
import '../../data/services/socket_service.dart';
import '../../data/services/voice_service.dart';

class SubtitleCue {
  final Duration start;
  final Duration end;
  final String text;

  const SubtitleCue({
    required this.start,
    required this.end,
    required this.text,
  });
}

class PlayerScreen extends StatefulWidget {
  final UserProfile currentProfile;
  final String? initialMediaUrl;
  final String? initialMediaTitle;
  final double? initialCurrentTime;
  final bool isLiveRoomJoin;

  const PlayerScreen({
    super.key,
    required this.currentProfile,
    this.initialMediaUrl,
    this.initialMediaTitle,
    this.initialCurrentTime,
    this.isLiveRoomJoin = false,
  });

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  final SocketService _socketService = SocketService();
  final VoiceService _voiceService = VoiceService();
  final ApiService _apiService = ApiService();

  VideoPlayerController? _videoController;
  WebViewController? _webViewController;

  String? _currentMediaUrl;
  String? _currentMediaTitle;
  String _currentMediaType = 'direct';

  bool _showControls = true;
  Timer? _hideControlsTimer;
  bool _isScreenLocked = false;

  bool _isDraggingScrubber = false;
  double _scrubProgress = 0.0;
  bool _isRemoteSyncing = false;
  DateTime? _lastLocalUserSeek;
  double? _pendingInitialSeek;

  bool _isMicMuted = true;
  bool _isPttActive = false;

  int? _doubleTapFeedbackSeconds;
  Timer? _doubleTapFeedbackTimer;
  String? _toastMessage;
  Timer? _toastTimer;

  // Audio Tracks & Subtitles
  List<dynamic> _audioTracks = [];
  int _activeAudioIndex = 0;
  List<dynamic> _subtitleTracks = [];
  int _activeSubtitleIndex = -1;
  List<SubtitleCue> _subCues = [];
  String _currentSubtitleText = '';

  // Floating Overlays & Modals
  bool _isSubtitleModalOpen = false;
  bool _isSettingsModalOpen = false;
  bool _isChatDrawerOpen = false;
  final TextEditingController _chatTextController = TextEditingController();
  final ScrollController _chatScrollController = ScrollController();
  Color _subTextColor = Colors.white;
  double _subFontSize = 14.0;
  double _subStrokeWidth = 2.0;
  String _aspectRatio = 'Auto';
  int _subTab = 0; // 0: Tracks, 1: Style
  int _lastReadMessageCount = 0;

  @override
  void initState() {
    super.initState();
    // 1. Force landscape for room
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

    final initialSec = widget.initialCurrentTime ?? (widget.isLiveRoomJoin ? _socketService.currentTime : 0.0);
    if (initialSec > 0.5) {
      _pendingInitialSeek = initialSec;
    }

    // 2. Setup Sync Callbacks FIRST
    _setupSyncListeners();

    // 3. Connect to room over socket
    _socketService.connect(
      roomId: AppConstants.defaultRoomId,
      profile: widget.currentProfile,
    );

    // 4. Initial Media Loading
    if (widget.initialMediaUrl != null && widget.initialMediaUrl!.isNotEmpty) {
      _loadMedia(
        widget.initialMediaUrl!,
        widget.initialMediaTitle ?? 'Now Playing',
        'direct',
        initialSec: initialSec,
        autoPlay: widget.isLiveRoomJoin ? _socketService.isPlaying : true,
        broadcastChange: !widget.isLiveRoomJoin,
      );
    } else if (_socketService.currentMediaUrl != null && _socketService.currentMediaUrl!.isNotEmpty) {
      _loadMedia(
        _socketService.currentMediaUrl!,
        _socketService.currentMediaTitle ?? 'Now Playing',
        _socketService.currentMediaType,
        initialSec: _socketService.currentTime,
        autoPlay: _socketService.isPlaying,
        broadcastChange: false,
      );
    }

    // 5. Initialize WebRTC Voice Mesh
    _voiceService.initialize(_socketService);
    _voiceService.joinVoice();

    _resetHideControlsTimer();
  }

  void _setupSyncListeners() {
    // 1. Initial State Handshake
    _socketService.onInitialState = (url, title, type, authTime, isPlaying) {
      if (url.isEmpty) return;
      if (_currentMediaUrl != url) {
        _loadMedia(url, title, type, initialSec: authTime, autoPlay: isPlaying, broadcastChange: false);
      } else {
        _syncPlaybackTime(authTime, isPlaying);
      }
    };

    // 2. Remote Play
    _socketService.onRemotePlay = (authTime, sender) {
      if (_currentMediaType == 'neko') return;
      if (_videoController == null || !_videoController!.value.isInitialized) return;
      _isRemoteSyncing = true;
      final localSec = _videoController!.value.position.inMilliseconds / 1000.0;
      if ((localSec - authTime).abs() > 0.6) {
        _videoController!.seekTo(Duration(milliseconds: (authTime * 1000).toInt()));
      }
      _videoController!.play();
      Future.delayed(const Duration(milliseconds: 250), () {
        if (mounted) _isRemoteSyncing = false;
      });
    };

    // 3. Remote Pause
    _socketService.onRemotePause = (authTime, sender) {
      if (_currentMediaType == 'neko') return;
      if (_videoController == null || !_videoController!.value.isInitialized) return;
      _isRemoteSyncing = true;
      _videoController!.pause();
      final localSec = _videoController!.value.position.inMilliseconds / 1000.0;
      if ((localSec - authTime).abs() > 0.6) {
        _videoController!.seekTo(Duration(milliseconds: (authTime * 1000).toInt()));
      }
      Future.delayed(const Duration(milliseconds: 250), () {
        if (mounted) _isRemoteSyncing = false;
      });
    };

    // 4. Remote Seek
    _socketService.onRemoteSeek = (authTime, isPlaying, sender) {
      if (_currentMediaType == 'neko') return;
      if (_videoController == null || !_videoController!.value.isInitialized) return;
      _isRemoteSyncing = true;
      _videoController!.seekTo(Duration(milliseconds: (authTime * 1000).toInt())).then((_) {
        if (isPlaying) {
          _videoController!.play();
        } else {
          _videoController!.pause();
        }
        Future.delayed(const Duration(milliseconds: 250), () {
          if (mounted) _isRemoteSyncing = false;
        });
      });
    };

    // 5. Periodic Heartbeat Sync
    _socketService.onSyncHeartbeat = (authTime, isPlaying, rate) {
      if (_currentMediaType == 'neko' || _isDraggingScrubber) return;
      _syncPlaybackTime(authTime, isPlaying);
    };

    // 6. Force Sync Broadcast
    _socketService.onSyncForced = (authTime, isPlaying, rate) {
      if (_currentMediaType == 'neko' || _isDraggingScrubber) return;
      _syncPlaybackTime(authTime, isPlaying, forceSeek: true);
    };

    // 7. Remote Media Change
    _socketService.onRemoteMediaChange = (url, title, type) {
      if (_currentMediaUrl != url) {
        _loadMedia(url, title, type, initialSec: 0.0, autoPlay: true, broadcastChange: false);
      }
    };

    // 8. Synchronized Audio Track Changed
    _socketService.onAudioTrackChanged = (trackIndex, authTime, isPlaying) {
      if (_activeAudioIndex != trackIndex) {
        setState(() => _activeAudioIndex = trackIndex);
        _applyAudioTrack(trackIndex, authTime, isPlaying);
      }
    };
  }

  void _syncPlaybackTime(double authTime, bool isPlaying, {bool forceSeek = false}) {
    if (_lastLocalUserSeek != null &&
        DateTime.now().difference(_lastLocalUserSeek!).inMilliseconds < 2500) {
      return;
    }

    if (_videoController == null || !_videoController!.value.isInitialized) {
      _pendingInitialSeek = authTime;
      return;
    }

    final localSec = _videoController!.value.position.inMilliseconds / 1000.0;
    final drift = (localSec - authTime).abs();

    if (forceSeek || drift > 1.2) {
      _isRemoteSyncing = true;
      _videoController!.seekTo(Duration(milliseconds: (authTime * 1000).toInt())).then((_) {
        if (mounted) _isRemoteSyncing = false;
      });
    }

    if (isPlaying && !_videoController!.value.isPlaying) {
      _videoController!.play();
    } else if (!isPlaying && _videoController!.value.isPlaying) {
      _videoController!.pause();
    }
  }

  Future<void> _loadMedia(
    String rawUrl,
    String title,
    String type, {
    double initialSec = 0.0,
    bool autoPlay = true,
    bool broadcastChange = false,
  }) async {
    setState(() {
      _currentMediaUrl = rawUrl;
      _currentMediaTitle = title;
      _currentMediaType = type;
    });

    if (broadcastChange) {
      _socketService.emitMediaChange(rawUrl, title, type: type);
    }

    // A. NEKO BROWSER
    if (type == 'neko' || rawUrl.contains('/neko')) {
      if (_videoController != null) {
        final old = _videoController!;
        _videoController = null;
        old.removeListener(_videoPlayerListener);
        try {
          await old.dispose();
        } catch (_) {}
      }
      _initNekoBrowser();
      return;
    }

    // B. DIRECT VIDEO / HLS
    final fullUrl = rawUrl.startsWith('http') ? rawUrl : '${AppConstants.serverBaseUrl}$rawUrl';

    // Safely unmount previous controller before initializing new one
    if (_videoController != null) {
      final old = _videoController!;
      _videoController = null;
      old.removeListener(_videoPlayerListener);
      if (mounted) setState(() {});
      try {
        await old.pause();
        await old.dispose();
      } catch (e) {
        debugPrint('Safe dispose error: $e');
      }
    }

    Uri videoUri;
    try {
      videoUri = Uri.parse(fullUrl);
    } catch (_) {
      videoUri = Uri.parse(Uri.encodeFull(fullUrl));
    }

    final controller = VideoPlayerController.networkUrl(
      videoUri,
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );

    try {
      await controller.initialize();
      controller.addListener(_videoPlayerListener);

      if (mounted) {
        setState(() {
          _videoController = controller;
        });
      }

      final seekTarget = _pendingInitialSeek ?? initialSec;
      if (seekTarget > 0.5) {
        await controller.seekTo(Duration(milliseconds: (seekTarget * 1000).toInt()));
      }
      _pendingInitialSeek = null;

      if (autoPlay) {
        controller.play();
      }

      _fetchMediaTracks(rawUrl);
    } catch (e) {
      debugPrint('VideoPlayer primary stream error: $e. Retrying with universal HLS engine...');
      try {
        final hlsUrl = fullUrl.contains('?') ? '$fullUrl&hls=1' : '$fullUrl?hls=1';
        final fallbackController = VideoPlayerController.networkUrl(
          Uri.parse(hlsUrl),
          videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
        );
        await fallbackController.initialize();
        fallbackController.addListener(_videoPlayerListener);

        if (mounted) {
          setState(() {
            _videoController = fallbackController;
          });
        }

        final seekTarget = _pendingInitialSeek ?? initialSec;
        if (seekTarget > 0.5) {
          await fallbackController.seekTo(Duration(milliseconds: (seekTarget * 1000).toInt()));
        }
        _pendingInitialSeek = null;

        if (autoPlay) {
          fallbackController.play();
        }

        _fetchMediaTracks(rawUrl);
      } catch (fallbackErr) {
        debugPrint('VideoPlayer fallback HLS failed: $fallbackErr');
        _showToast('Failed to load video stream ⚠️');
      }
    }
  }

  void _initNekoBrowser() {
    final username = widget.currentProfile.name;
    final nekoUri = Uri.parse('${AppConstants.serverBaseUrl}/neko/?room=${AppConstants.defaultRoomId}&usr=$username');
    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            if (mounted) setState(() {});
          },
        ),
      )
      ..loadRequest(nekoUri);
  }

  void _videoPlayerListener() {
    if (!mounted || _videoController == null) return;

    // Check subtitle cues
    final pos = _videoController!.value.position;
    if (_subCues.isNotEmpty) {
      SubtitleCue? activeCue;
      for (final cue in _subCues) {
        if (pos >= cue.start && pos <= cue.end) {
          activeCue = cue;
          break;
        }
      }
      final newText = activeCue?.text ?? '';
      if (newText != _currentSubtitleText) {
        setState(() => _currentSubtitleText = newText);
      }
    }

    // ONLY rebuild if controls are visible and chat drawer is NOT open
    // This protects keyboard from unfocusing/closing during playback
    if (_showControls && !_isDraggingScrubber && !_isChatDrawerOpen) {
      setState(() {});
    }
  }

  Future<void> _fetchMediaTracks(String url) async {
    final info = await _apiService.fetchMediaInfo(url);
    if (!mounted) return;

    setState(() {
      _audioTracks = (info['audioTracks'] as List<dynamic>? ?? []);
      _subtitleTracks = (info['subtitles'] as List<dynamic>? ?? []);
    });

    if (_subtitleTracks.isNotEmpty && _activeSubtitleIndex < 0) {
      _selectSubtitleTrack(0);
    }
  }

  Future<void> _selectAudioTrack(int trackIdx) async {
    if (_videoController == null || trackIdx == _activeAudioIndex) return;
    setState(() => _activeAudioIndex = trackIdx);
    final curTime = _videoController!.value.position.inMilliseconds / 1000.0;
    final isPlaying = _videoController!.value.isPlaying;
    _socketService.emitAudioTrackChange(trackIdx, curTime, isPlaying);
    await _applyAudioTrack(trackIdx, curTime, isPlaying);
    final trackName = trackIdx < _audioTracks.length
        ? (_audioTracks[trackIdx]['title'] ?? _audioTracks[trackIdx]['name'] ?? 'Track ${trackIdx + 1}')
        : 'Track ${trackIdx + 1}';
    _showToast('🔊 Audio: $trackName');
  }

  Future<void> _applyAudioTrack(int trackIdx, double curTime, bool isPlaying) async {
    if (_currentMediaUrl == null) return;
    final base = _currentMediaUrl!.split('?')[0];
    final newUrl = trackIdx > 0 ? '$base?hls=1&audio=$trackIdx' : base;
    await _loadMedia(newUrl, _currentMediaTitle ?? 'Movie', _currentMediaType,
        initialSec: curTime, autoPlay: isPlaying, broadcastChange: false);
  }

  Future<void> _selectSubtitleTrack(int subIdx) async {
    setState(() {
      _activeSubtitleIndex = subIdx;
      _subCues = [];
      _currentSubtitleText = '';
    });

    if (subIdx < 0 || subIdx >= _subtitleTracks.length) {
      _showToast('💬 Subtitles: Off');
      return;
    }

    final sub = _subtitleTracks[subIdx];
    final subTitle = sub['title'] ?? sub['language'] ?? 'Sub ${subIdx + 1}';
    _showToast('💬 Subtitles: $subTitle');
    final subUrl = sub['url']?.toString();
    if (subUrl == null) return;

    final fullSubUrl = subUrl.startsWith('http') ? subUrl : '${AppConstants.serverBaseUrl}$subUrl';

    try {
      final res = await http.get(Uri.parse(fullSubUrl));
      if (res.statusCode == 200) {
        final parsed = _parseWebVTT(res.body);
        if (mounted) {
          setState(() {
            _subCues = parsed;
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading subtitle: $e');
    }
  }

  List<SubtitleCue> _parseWebVTT(String vttData) {
    final cues = <SubtitleCue>[];
    final blocks = vttData.replaceAll('\r\n', '\n').split('\n\n');

    for (final block in blocks) {
      final lines = block.trim().split('\n');
      for (int i = 0; i < lines.length; i++) {
        if (lines[i].contains('-->')) {
          final parts = lines[i].split('-->');
          if (parts.length == 2) {
            final start = _parseVttTimestamp(parts[0].trim());
            final end = _parseVttTimestamp(parts[1].trim().split(' ')[0]);
            final text = lines.sublist(i + 1).join('\n').replaceAll(RegExp(r'<[^>]*>'), '').trim();
            if (start != null && end != null && text.isNotEmpty) {
              cues.add(SubtitleCue(start: start, end: end, text: text));
            }
          }
          break;
        }
      }
    }
    return cues;
  }

  Duration? _parseVttTimestamp(String ts) {
    try {
      final clean = ts.replaceAll(',', '.');
      final parts = clean.split(':');
      if (parts.length == 3) {
        final hours = int.parse(parts[0]);
        final minutes = int.parse(parts[1]);
        final secParts = parts[2].split('.');
        final seconds = int.parse(secParts[0]);
        final millis = secParts.length > 1 ? int.parse(secParts[1].padRight(3, '0').substring(0, 3)) : 0;
        return Duration(hours: hours, minutes: minutes, seconds: seconds, milliseconds: millis);
      } else if (parts.length == 2) {
        final minutes = int.parse(parts[0]);
        final secParts = parts[1].split('.');
        final seconds = int.parse(secParts[0]);
        final millis = secParts.length > 1 ? int.parse(secParts[1].padRight(3, '0').substring(0, 3)) : 0;
        return Duration(minutes: minutes, seconds: seconds, milliseconds: millis);
      }
    } catch (_) {}
    return null;
  }

  void _resetHideControlsTimer() {
    _hideControlsTimer?.cancel();
    if (_isScreenLocked || _isChatDrawerOpen || _isSubtitleModalOpen || _isSettingsModalOpen) {
      return;
    }

    _hideControlsTimer = Timer(const Duration(seconds: 4), () {
      if (mounted && _videoController != null && _videoController!.value.isPlaying && !_isDraggingScrubber) {
        if (!_isChatDrawerOpen && !_isSubtitleModalOpen && !_isSettingsModalOpen) {
          setState(() => _showControls = false);
        }
      }
    });
  }

  void _togglePlayPause() {
    HapticFeedback.lightImpact();
    if (_videoController == null || !_videoController!.value.isInitialized) return;

    final isPlaying = _videoController!.value.isPlaying;
    final curTime = _videoController!.value.position.inMilliseconds / 1000.0;

    if (isPlaying) {
      _videoController!.pause();
      if (!_isRemoteSyncing) _socketService.emitPause(curTime);
    } else {
      _videoController!.play();
      if (!_isRemoteSyncing) _socketService.emitPlay(curTime);
    }
    _resetHideControlsTimer();
  }

  void _seekRelative(int seconds) {
    HapticFeedback.lightImpact();
    if (_videoController == null || !_videoController!.value.isInitialized) return;

    final cur = _videoController!.value.position;
    final dur = _videoController!.value.duration;
    final target = cur + Duration(seconds: seconds);
    final clamped = target < Duration.zero ? Duration.zero : (target > dur ? dur : target);

    _lastLocalUserSeek = DateTime.now();
    _videoController!.seekTo(clamped);
    final targetSec = clamped.inMilliseconds / 1000.0;
    _socketService.currentTime = targetSec;
    if (!_isRemoteSyncing) {
      _socketService.emitSeek(targetSec);
    }
    _showDoubleTapFeedback(seconds);
    _resetHideControlsTimer();
  }

  void _showDoubleTapFeedback(int seconds) {
    _doubleTapFeedbackTimer?.cancel();
    setState(() => _doubleTapFeedbackSeconds = seconds);
    _doubleTapFeedbackTimer = Timer(const Duration(milliseconds: 700), () {
      if (mounted) setState(() => _doubleTapFeedbackSeconds = null);
    });
  }

  void _showToast(String message) {
    _toastTimer?.cancel();
    setState(() => _toastMessage = message);
    _toastTimer = Timer(const Duration(milliseconds: 2000), () {
      if (mounted) setState(() => _toastMessage = null);
    });
  }

  void _openChatDrawer() {
    setState(() {
      _isChatDrawerOpen = true;
      _isSubtitleModalOpen = false;
      _isSettingsModalOpen = false;
      _showControls = false;
      _lastReadMessageCount = _socketService.chatMessages.length;
    });
    _hideControlsTimer?.cancel();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScrollController.hasClients) {
        _chatScrollController.jumpTo(_chatScrollController.position.maxScrollExtent);
      }
    });
  }

  @override
  void dispose() {
    _voiceService.leaveVoice();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

    _hideControlsTimer?.cancel();
    _doubleTapFeedbackTimer?.cancel();
    _toastTimer?.cancel();
    _videoController?.removeListener(_videoPlayerListener);
    _videoController?.dispose();
    _chatTextController.dispose();
    _chatScrollController.dispose();
    _socketService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isInitialized = _videoController != null && _videoController!.value.isInitialized;
    final position = isInitialized ? _videoController!.value.position : Duration.zero;
    final duration = isInitialized ? _videoController!.value.duration : Duration.zero;
    final isNeko = _currentMediaType == 'neko' || (_currentMediaUrl?.contains('/neko') == true);

    return Scaffold(
      backgroundColor: Colors.black,
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          // 1. VIDEO OR NEKO BROWSER STAGE WITH GESTURES
          GestureDetector(
            onTap: () {
              if (_isScreenLocked) return;
              if (_isSubtitleModalOpen || _isSettingsModalOpen || _isChatDrawerOpen) {
                setState(() {
                  _isSubtitleModalOpen = false;
                  _isSettingsModalOpen = false;
                  _isChatDrawerOpen = false;
                });
                return;
              }
              setState(() => _showControls = !_showControls);
              if (_showControls) _resetHideControlsTimer();
            },
            onHorizontalDragEnd: (details) {
              // Right-to-Left swipe gesture opens chat drawer
              if (!_isScreenLocked && details.primaryVelocity != null && details.primaryVelocity! < -150) {
                _openChatDrawer();
              }
            },
            onDoubleTapDown: (details) {
              if (_isScreenLocked || isNeko) return;
              final screenWidth = MediaQuery.of(context).size.width;
              if (details.globalPosition.dx < screenWidth / 2) {
                _seekRelative(-10);
              } else {
                _seekRelative(10);
              }
            },
            child: Center(
              child: isNeko
                  ? (_webViewController != null
                      ? WebViewWidget(controller: _webViewController!)
                      : const CircularProgressIndicator(color: AppTheme.electricPink))
                  : (isInitialized
                      ? _buildVideoStage()
                      : const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            CircularProgressIndicator(color: AppTheme.electricPink),
                            SizedBox(height: 12),
                            Text(
                              'Syncing with Common Room...',
                              style: TextStyle(color: Colors.white70, fontSize: 13),
                            ),
                          ],
                        )),
            ),
          ),

          // 2. NATIVE SUBTITLE OVERLAY
          if (_currentSubtitleText.isNotEmpty && !isNeko)
            Positioned(
              bottom: _showControls ? 85 : 30,
              left: 40,
              right: 40,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.78),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white24, width: 0.8),
                  ),
                  child: Text(
                    _currentSubtitleText,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _subTextColor,
                      fontSize: _subFontSize,
                      fontWeight: FontWeight.w700,
                      shadows: [
                        Shadow(color: Colors.black, blurRadius: _subStrokeWidth * 3),
                      ],
                    ),
                  ),
                ),
              ),
            ),

          // 3. DOUBLE TAP FEEDBACK PILL
          if (_doubleTapFeedbackSeconds != null)
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.8),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppTheme.electricPink.withValues(alpha: 0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _doubleTapFeedbackSeconds! < 0 ? Icons.replay_10_rounded : Icons.forward_10_rounded,
                      color: AppTheme.softBlossom,
                      size: 24,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${_doubleTapFeedbackSeconds! > 0 ? "+" : ""}$_doubleTapFeedbackSeconds s',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15),
                    ),
                  ],
                ),
              ),
            ),

          // 4. FLOATING HUD TOAST (Only for actions like mic/audio changes)
          if (_toastMessage != null && !_isScreenLocked)
            Positioned(
              top: 50,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.85),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.electricPink.withValues(alpha: 0.4)),
                  ),
                  child: Text(
                    _toastMessage!,
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ),

          // 5. RIGHT FLOATING RAIL (LOCK & MINIMAL CONTROLS ONLY)
          _buildRightRail(),

          // 6. TOP APP BAR
          if (_showControls && !_isScreenLocked)
            _buildTopBar(),

          // 7. BOTTOM HUD & TRANSPORT CONTROLS
          if (_showControls && !_isScreenLocked)
            _buildBottomControls(position, duration, isInitialized, isNeko),

          // 8. SUBTITLES MODAL
          if (_isSubtitleModalOpen && !_isScreenLocked)
            _buildSubtitleModal(),

          // 9. PLAYER SETTINGS MODAL
          if (_isSettingsModalOpen && !_isScreenLocked)
            _buildSettingsModal(),

          // 10. RIGHT CHAT DRAWER
          if (_isChatDrawerOpen)
            _buildChatDrawer(),
        ],
      ),
    );
  }

  Widget _buildVideoStage() {
    if (_videoController == null || !_videoController!.value.isInitialized) {
      return const CircularProgressIndicator(color: AppTheme.electricPink);
    }

    final videoSize = _videoController!.value.size;

    switch (_aspectRatio) {
      case 'Zoomed Crop':
        // Edge-to-edge crop for Samsung Galaxy S23 (19.5:9 display) without black bars
        return SizedBox.expand(
          child: FittedBox(
            fit: BoxFit.cover,
            clipBehavior: Clip.hardEdge,
            child: SizedBox(
              width: videoSize.width,
              height: videoSize.height,
              child: VideoPlayer(_videoController!),
            ),
          ),
        );
      case 'Fill':
        return SizedBox.expand(
          child: FittedBox(
            fit: BoxFit.fill,
            child: SizedBox(
              width: videoSize.width,
              height: videoSize.height,
              child: VideoPlayer(_videoController!),
            ),
          ),
        );
      case '16:9':
        return AspectRatio(
          aspectRatio: 16 / 9,
          child: VideoPlayer(_videoController!),
        );
      case '4:3':
        return AspectRatio(
          aspectRatio: 4 / 3,
          child: VideoPlayer(_videoController!),
        );
      case 'Auto':
      default:
        return AspectRatio(
          aspectRatio: _videoController!.value.aspectRatio,
          child: VideoPlayer(_videoController!),
        );
    }
  }

  Widget _buildRightRail() {
    // When locked: EXACT match to reference screenshot (media_1793649334999_4e035462.jpg)
    // 1. Top-Right: Circular Lock/Unlock icon button
    // 2. Center-Right: Circular Chat bubble button with pink unread indicator dot
    // 3. Bottom-Left: Circular Mic button with electric pink border
    if (_isScreenLocked) {
      return Stack(
        fit: StackFit.expand,
        children: [
          // 1. Top-Right Unlock Button
          Positioned(
            top: 20,
            right: 20,
            child: GestureDetector(
              onTap: () {
                HapticFeedback.mediumImpact();
                setState(() {
                  _isScreenLocked = false;
                  _showControls = true;
                });
                _resetHideControlsTimer();
              },
              child: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.black.withValues(alpha: 0.55),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.25), width: 1.0),
                ),
                child: const Icon(Icons.lock_outline_rounded, color: Colors.white, size: 18),
              ),
            ),
          ),

          // 2. Center-Right Floating Chat Bubble Button (opens chat drawer directly)
          Positioned(
            right: 20,
            top: 0,
            bottom: 0,
            child: Center(
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  _openChatDrawer();
                },
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.black.withValues(alpha: 0.55),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.25), width: 1.0),
                      ),
                      child: const Icon(Icons.chat_bubble_outline_rounded, color: Colors.white, size: 18),
                    ),
                    if ((_socketService.chatMessages.length - _lastReadMessageCount) > 0 && !_isChatDrawerOpen)
                      Positioned(
                        top: 1,
                        right: 1,
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppTheme.electricPink,
                            boxShadow: [
                              BoxShadow(
                                color: AppTheme.electricPink.withValues(alpha: 0.8),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),

          // 3. Bottom-Left Circular Mic Button with Electric Pink Border
          Positioned(
            bottom: 20,
            left: 20,
            child: GestureDetector(
              onTap: () {
                HapticFeedback.lightImpact();
                setState(() {
                  _isMicMuted = !_isMicMuted;
                  _isPttActive = false;
                });
                _voiceService.setMute(_isMicMuted);
              },
              onLongPressStart: (_) {
                HapticFeedback.heavyImpact();
                setState(() {
                  _isPttActive = true;
                  _isMicMuted = false;
                });
                _voiceService.setMute(false);
              },
              onLongPressEnd: (_) {
                HapticFeedback.lightImpact();
                setState(() {
                  _isPttActive = false;
                  _isMicMuted = true;
                });
                _voiceService.setMute(true);
              },
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.black.withValues(alpha: 0.65),
                  border: Border.all(
                    color: (!_isMicMuted || _isPttActive) ? AppTheme.electricPink : AppTheme.electricPink.withValues(alpha: 0.7),
                    width: 1.5,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.electricPink.withValues(alpha: (!_isMicMuted || _isPttActive) ? 0.6 : 0.25),
                      blurRadius: 10,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: Icon(
                  (!_isMicMuted || _isPttActive) ? Icons.mic_rounded : Icons.mic_none_rounded,
                  color: Colors.white,
                  size: 20,
                ),
              ),
            ),
          ),
        ],
      );
    }

    // When NOT locked: Vertical Rail Capsule matching reference screenshot (media_1793649209069_eec34c07.jpg)
    // Pinned on the right center: [Chat with pink dot, Lock, Mic]
    return Positioned(
      right: 18,
      top: 0,
      bottom: 0,
      child: Center(
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 250),
          opacity: _showControls ? 1.0 : 0.0,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 5),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.65),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white12, width: 0.9),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // 1. Chat button with unread glowing pink dot
                GestureDetector(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    _openChatDrawer();
                  },
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.transparent,
                        ),
                        child: const Icon(Icons.chat_bubble_outline_rounded, color: Colors.white70, size: 18),
                      ),
                      if ((_socketService.chatMessages.length - _lastReadMessageCount) > 0 && !_isChatDrawerOpen)
                        Positioned(
                          top: 2,
                          right: 2,
                          child: Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppTheme.electricPink,
                              boxShadow: [
                                BoxShadow(
                                  color: AppTheme.electricPink.withValues(alpha: 0.8),
                                  blurRadius: 4,
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),

                // 2. Lock button
                GestureDetector(
                  onTap: () {
                    HapticFeedback.mediumImpact();
                    setState(() {
                      _isScreenLocked = true;
                      _showControls = false;
                      _isSubtitleModalOpen = false;
                      _isSettingsModalOpen = false;
                      _isChatDrawerOpen = false;
                    });
                  },
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.transparent,
                    ),
                    child: const Icon(Icons.lock_outline_rounded, color: Colors.white70, size: 18),
                  ),
                ),
                const SizedBox(height: 10),

                // 3. Mic button
                GestureDetector(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    setState(() {
                      _isMicMuted = !_isMicMuted;
                      _isPttActive = false;
                    });
                    _voiceService.setMute(_isMicMuted);
                  },
                  onLongPressStart: (_) {
                    HapticFeedback.heavyImpact();
                    setState(() {
                      _isPttActive = true;
                      _isMicMuted = false;
                    });
                    _voiceService.setMute(false);
                  },
                  onLongPressEnd: (_) {
                    HapticFeedback.lightImpact();
                    setState(() {
                      _isPttActive = false;
                      _isMicMuted = true;
                    });
                    _voiceService.setMute(true);
                  },
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.transparent,
                    ),
                    child: Icon(
                      (!_isMicMuted || _isPttActive) ? Icons.mic_rounded : Icons.mic_none_rounded,
                      color: (!_isMicMuted || _isPttActive) ? AppTheme.electricPink : Colors.white70,
                      size: 18,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: const EdgeInsets.only(top: 12, left: 16, right: 16, bottom: 8),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.black87, Colors.transparent],
          ),
        ),
        child: Row(
          children: [
            GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: const Icon(Icons.arrow_back_rounded, color: Colors.white70, size: 22),
            ),
            const SizedBox(width: 10),
            Container(width: 1, height: 18, color: Colors.white24),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _currentMediaTitle ?? widget.initialMediaTitle ?? 'Now Playing',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Icon(Icons.sensors_rounded, color: AppTheme.electricPink, size: 11),
                      const SizedBox(width: 4),
                      Text(
                        'Direct Stream',
                        style: TextStyle(
                          color: AppTheme.electricPink,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white24, width: 0.8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.people_alt_outlined, color: Colors.white70, size: 13),
                  const SizedBox(width: 4),
                  Text(
                    '${_socketService.connectedUsers.length}',
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomControls(Duration position, Duration duration, bool isInitialized, bool isNeko) {
    return Positioned(
      bottom: 14,
      left: 14,
      right: 14,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(
            begin: Alignment.bottomCenter,
            end: Alignment.topCenter,
            colors: [Colors.black87, Colors.transparent],
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Sync status badge (matching reference screenshot media_1793649209069_eec34c07.jpg)
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.link_rounded, color: AppTheme.electricPink, size: 14),
                    const SizedBox(width: 4),
                    Text(
                      !_socketService.isConnected
                          ? 'OFFLINE'
                          : (_isRemoteSyncing ? 'SYNCING' : 'SYNCED'),
                      style: const TextStyle(
                        color: AppTheme.electricPink,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ],
                ),
              ],
            ),

            // Timeline Scrubber
            if (!isNeko)
              SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  activeTrackColor: AppTheme.electricPink,
                  inactiveTrackColor: Colors.white24,
                  thumbColor: AppTheme.softBlossom,
                  thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
                  trackHeight: 2.5,
                  overlayColor: AppTheme.electricPink.withValues(alpha: 0.2),
                ),
                child: Slider(
                  value: _isDraggingScrubber
                      ? _scrubProgress
                      : (duration.inMilliseconds > 0
                          ? (position.inMilliseconds / duration.inMilliseconds).clamp(0.0, 1.0)
                          : 0.0),
                  onChangeStart: (val) {
                    _hideControlsTimer?.cancel();
                    setState(() {
                      _isDraggingScrubber = true;
                      _scrubProgress = val;
                    });
                  },
                  onChanged: (val) {
                    setState(() => _scrubProgress = val);
                  },
                  onChangeEnd: (val) async {
                    if (isInitialized) {
                      final targetMs = (val * duration.inMilliseconds).toInt();
                      _lastLocalUserSeek = DateTime.now();
                      final targetSec = targetMs / 1000.0;
                      await _videoController!.seekTo(Duration(milliseconds: targetMs));
                      _socketService.currentTime = targetSec;
                      _socketService.emitSeek(targetSec);
                    }
                    setState(() => _isDraggingScrubber = false);
                    _resetHideControlsTimer();
                  },
                ),
              ),

            const SizedBox(height: 4),

            // Transport Dock Capsule matching reference screenshot (media_1793649209069_eec34c07.jpg)
            Row(
              children: [
                // 1. Left: Circular Mic Button with Electric Pink border
                GestureDetector(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    setState(() {
                      _isMicMuted = !_isMicMuted;
                      _isPttActive = false;
                    });
                    _voiceService.setMute(_isMicMuted);
                  },
                  onLongPressStart: (_) {
                    HapticFeedback.heavyImpact();
                    setState(() {
                      _isPttActive = true;
                      _isMicMuted = false;
                    });
                    _voiceService.setMute(false);
                  },
                  onLongPressEnd: (_) {
                    HapticFeedback.lightImpact();
                    setState(() {
                      _isPttActive = false;
                      _isMicMuted = true;
                    });
                    _voiceService.setMute(true);
                  },
                  child: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.black.withValues(alpha: 0.6),
                      border: Border.all(
                        color: (!_isMicMuted || _isPttActive) ? AppTheme.electricPink : AppTheme.electricPink.withValues(alpha: 0.8),
                        width: 1.3,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.electricPink.withValues(alpha: (!_isMicMuted || _isPttActive) ? 0.6 : 0.25),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                    child: Icon(
                      (!_isMicMuted || _isPttActive) ? Icons.mic_rounded : Icons.mic_none_rounded,
                      color: Colors.white,
                      size: 17,
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // 2. Left: "Hold to talk ∨" Capsule Pill
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _isMicMuted = !_isMicMuted;
                      _isPttActive = false;
                    });
                    _voiceService.setMute(_isMicMuted);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white24, width: 0.9),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _isPttActive
                              ? 'PTT Live'
                              : (!_isMicMuted ? 'Open Mic' : 'Hold to talk'),
                          style: TextStyle(
                            color: (!_isMicMuted || _isPttActive) ? AppTheme.electricPink : Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white60, size: 14),
                      ],
                    ),
                  ),
                ),

                const Spacer(),

                // 3. Center: Replay 10, Play/Pause Hero, Forward 10
                IconButton(
                  icon: const Icon(Icons.replay_10_rounded, color: Colors.white70, size: 24),
                  onPressed: () => _seekRelative(-10),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _togglePlayPause,
                  child: Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppTheme.electricPink,
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.electricPink.withValues(alpha: 0.6),
                          blurRadius: 16,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: Icon(
                      (_videoController != null && _videoController!.value.isPlaying)
                          ? Icons.pause_rounded
                          : Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 24,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.forward_10_rounded, color: Colors.white70, size: 24),
                  onPressed: () => _seekRelative(10),
                ),

                const Spacer(),

                // 4. Right: Time Readout
                Text(
                  '${_formatDuration(position)} / ${_formatDuration(duration)}',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(width: 8),

                // 5. Right: [CC] Subs Pill
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _isSubtitleModalOpen = !_isSubtitleModalOpen;
                      _isSettingsModalOpen = false;
                      _isChatDrawerOpen = false;
                    });
                    _resetHideControlsTimer();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                    decoration: BoxDecoration(
                      color: _activeSubtitleIndex >= 0
                          ? AppTheme.electricPink.withValues(alpha: 0.25)
                          : Colors.black.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: _activeSubtitleIndex >= 0 ? AppTheme.electricPink : Colors.white24,
                        width: 0.9,
                      ),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.closed_caption_rounded, color: Colors.white, size: 14),
                        SizedBox(width: 4),
                        Text(
                          'Subs',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // 6. Right: Settings Cog
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _isSettingsModalOpen = !_isSettingsModalOpen;
                      _isSubtitleModalOpen = false;
                      _isChatDrawerOpen = false;
                    });
                    _resetHideControlsTimer();
                  },
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _isSettingsModalOpen
                          ? AppTheme.electricPink.withValues(alpha: 0.25)
                          : Colors.black.withValues(alpha: 0.5),
                      border: Border.all(
                        color: _isSettingsModalOpen ? AppTheme.electricPink : Colors.white24,
                        width: 0.9,
                      ),
                    ),
                    child: const Icon(Icons.settings_outlined, color: Colors.white70, size: 16),
                  ),
                ),
                const SizedBox(width: 8),

                // 7. Right: Aspect Ratio / Zoom / Fullscreen Button (replacing extra chat button)
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      if (_aspectRatio == 'Auto') {
                        _aspectRatio = 'Zoomed Crop';
                      } else if (_aspectRatio == 'Zoomed Crop') {
                        _aspectRatio = '16:9';
                      } else if (_aspectRatio == '16:9') {
                        _aspectRatio = 'Fill';
                      } else {
                        _aspectRatio = 'Auto';
                      }
                    });
                    _showToast('Aspect Ratio: $_aspectRatio');
                  },
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.black.withValues(alpha: 0.5),
                      border: Border.all(color: Colors.white24, width: 0.9),
                    ),
                    child: const Icon(Icons.crop_free_rounded, color: Colors.white70, size: 16),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubtitleModal() {
    return Positioned(
      top: 30,
      bottom: 30,
      left: 80,
      right: 80,
      child: Center(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 460, maxHeight: 310),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF13151B).withValues(alpha: 0.92),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 1.0),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header with Segmented Tabs
                  Row(
                    children: [
                      const Text(
                        'Subtitles',
                        style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(width: 14),
                      _subPillTab('Tracks', 0),
                      const SizedBox(width: 6),
                      _subPillTab('Style', 1),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => setState(() => _isSubtitleModalOpen = false),
                        child: const Icon(Icons.close_rounded, color: Colors.white70, size: 18),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Divider(color: Colors.white12, height: 1),
                  const SizedBox(height: 10),

                  // Tab 0: Tracks
                  if (_subTab == 0)
                    Expanded(
                      child: Column(
                        children: [
                          Expanded(
                            child: ListView(
                              children: [
                                _buildSubRadioOption(
                                  title: 'Off',
                                  isSelected: _activeSubtitleIndex == -1,
                                  onTap: () => _selectSubtitleTrack(-1),
                                ),
                                ..._subtitleTracks.asMap().entries.map((entry) {
                                  final idx = entry.key;
                                  final sub = entry.value;
                                  final name = sub['title'] ?? sub['language'] ?? 'Sub ${idx + 1}';
                                  final isExternal = sub['external'] == true;
                                  return _buildSubRadioOption(
                                    title: name,
                                    badge: isExternal ? 'External' : 'Embedded',
                                    isSelected: _activeSubtitleIndex == idx,
                                    onTap: () => _selectSubtitleTrack(idx),
                                  );
                                }),
                              ],
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () => _showToast('Searching SubDL database...'),
                                  icon: const Icon(Icons.download_rounded, size: 14, color: AppTheme.electricPink),
                                  label: const Text('Search SubDL', style: TextStyle(color: Colors.white, fontSize: 11)),
                                  style: OutlinedButton.styleFrom(
                                    side: const BorderSide(color: Colors.white24),
                                    padding: const EdgeInsets.symmetric(vertical: 8),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () => _showToast('Open subtitle picker...'),
                                  icon: const Icon(Icons.folder_open_rounded, size: 14, color: Colors.white70),
                                  label: const Text('Load File', style: TextStyle(color: Colors.white, fontSize: 11)),
                                  style: OutlinedButton.styleFrom(
                                    side: const BorderSide(color: Colors.white24),
                                    padding: const EdgeInsets.symmetric(vertical: 8),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                  // Tab 1: Styling
                  if (_subTab == 1)
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Live Preview Card
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.5),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: Colors.white12),
                            ),
                            child: Center(
                              child: Text(
                                'This is a subtitle preview.',
                                style: TextStyle(
                                  color: _subTextColor,
                                  fontSize: _subFontSize,
                                  fontWeight: FontWeight.w700,
                                  shadows: [
                                    Shadow(color: Colors.black, blurRadius: _subStrokeWidth * 3),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),

                          // Text Size Pills
                          Row(
                            children: [
                              const Text('Size', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                              const SizedBox(width: 14),
                              _sizePill('S', 12.0),
                              const SizedBox(width: 6),
                              _sizePill('M', 14.0),
                              const SizedBox(width: 6),
                              _sizePill('L', 17.0),
                              const SizedBox(width: 6),
                              _sizePill('XL', 20.0),
                            ],
                          ),
                          const SizedBox(height: 12),

                          // Color Swatches
                          Row(
                            children: [
                              const Text('Color', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                              const SizedBox(width: 14),
                              _colorDot(Colors.white),
                              const SizedBox(width: 8),
                              _colorDot(const Color(0xFFFACC15)), // Yellow
                              const SizedBox(width: 8),
                              _colorDot(const Color(0xFF38BDF8)), // Cyan
                              const SizedBox(width: 8),
                              _colorDot(const Color(0xFFC084FC)), // Lavender
                              const SizedBox(width: 8),
                              _colorDot(AppTheme.electricPink),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _subPillTab(String title, int index) {
    final active = _subTab == index;
    return GestureDetector(
      onTap: () => setState(() => _subTab = index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: active ? AppTheme.electricPink.withValues(alpha: 0.25) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? AppTheme.electricPink : Colors.transparent),
        ),
        child: Text(
          title,
          style: TextStyle(
            color: active ? AppTheme.electricPink : Colors.white60,
            fontSize: 11,
            fontWeight: active ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  Widget _sizePill(String label, double size) {
    final active = (_subFontSize - size).abs() < 0.5;
    return GestureDetector(
      onTap: () => setState(() => _subFontSize = size),
      child: Container(
        width: 32,
        height: 26,
        decoration: BoxDecoration(
          color: active ? AppTheme.electricPink : Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              color: active ? Colors.white : Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ),
    );
  }

  Widget _colorDot(Color c) {
    final active = _subTextColor == c;
    return GestureDetector(
      onTap: () => setState(() => _subTextColor = c),
      child: Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: c,
          shape: BoxShape.circle,
          border: Border.all(color: active ? AppTheme.electricPink : Colors.white24, width: active ? 2.5 : 1.0),
        ),
      ),
    );
  }

  Widget _buildSubRadioOption({
    required String title,
    String? badge,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white.withValues(alpha: 0.08) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: isSelected ? AppTheme.electricPink : Colors.white38, width: isSelected ? 4 : 1.5),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  color: isSelected ? Colors.white : Colors.white70,
                  fontSize: 12,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ),
            if (badge != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  badge,
                  style: const TextStyle(color: Colors.white60, fontSize: 9),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingsModal() {
    return Positioned(
      top: 30,
      bottom: 30,
      left: 100,
      right: 100,
      child: Center(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 420, maxHeight: 310),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF13151B).withValues(alpha: 0.92),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 1.0),
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Player Settings',
                          style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                        GestureDetector(
                          onTap: () => setState(() => _isSettingsModalOpen = false),
                          child: const Icon(Icons.close_rounded, color: Colors.white70, size: 18),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // 1. Audio Output Mode
                    const Text('Audio Output', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _pillChoice(
                          icon: Icons.headphones_rounded,
                          label: 'Earbuds (BT)',
                          active: _voiceService.currentAudioOutput != 'speaker',
                          onTap: () {
                            _voiceService.setAudioOutputMode('earbuds');
                            _showToast('🎧 Output: Bluetooth Earbuds');
                          },
                        ),
                        const SizedBox(width: 8),
                        _pillChoice(
                          icon: Icons.volume_up_rounded,
                          label: 'Speaker',
                          active: _voiceService.currentAudioOutput == 'speaker',
                          onTap: () {
                            _voiceService.setAudioOutputMode('speaker');
                            _showToast('🔊 Output: Phone Speaker');
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // 2. Aspect Ratio (Including Zoomed Crop for Galaxy S23)
                    const Text('Aspect Ratio', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _aspectPill('Auto'),
                          const SizedBox(width: 6),
                          _aspectPill('Zoomed Crop'),
                          const SizedBox(width: 6),
                          _aspectPill('16:9'),
                          const SizedBox(width: 6),
                          _aspectPill('Fill'),
                          const SizedBox(width: 6),
                          _aspectPill('4:3'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // 3. Audio Track Selection
                    if (_audioTracks.isNotEmpty) ...[
                      const Text('Audio Track', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: _audioTracks.asMap().entries.map((entry) {
                          final idx = entry.key;
                          final track = entry.value;
                          final name = track['title'] ?? track['language'] ?? 'Track ${idx + 1}';
                          final active = _activeAudioIndex == idx;
                          return GestureDetector(
                            onTap: () => _selectAudioTrack(idx),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: active ? AppTheme.electricPink.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: active ? AppTheme.electricPink : Colors.transparent),
                              ),
                              child: Text(
                                name,
                                style: TextStyle(
                                  color: active ? Colors.white : Colors.white70,
                                  fontSize: 11,
                                  fontWeight: active ? FontWeight.bold : FontWeight.normal,
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _pillChoice({required IconData icon, required String label, required bool active, required VoidCallback onTap}) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: active ? AppTheme.electricPink.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: active ? AppTheme.electricPink : Colors.transparent),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: active ? AppTheme.electricPink : Colors.white70, size: 14),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: active ? Colors.white : Colors.white70,
                  fontSize: 11,
                  fontWeight: active ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _aspectPill(String ratio) {
    final active = _aspectRatio == ratio;
    return GestureDetector(
      onTap: () => setState(() => _aspectRatio = ratio),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: active ? AppTheme.electricPink : Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          ratio,
          style: TextStyle(
            color: active ? Colors.white : Colors.white70,
            fontSize: 11,
            fontWeight: active ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  Widget _buildChatDrawer() {
    return Positioned(
      right: 0,
      top: 0,
      bottom: 0,
      width: 320,
      child: ClipRRect(
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(18),
          bottomLeft: Radius.circular(18),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF13151B).withValues(alpha: 0.94),
              border: Border(
                left: BorderSide(color: Colors.white.withValues(alpha: 0.12), width: 1.0),
              ),
            ),
            child: Column(
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.only(top: 12, left: 16, right: 14, bottom: 8),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Colors.white12)),
                  ),
                  child: Row(
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Chat',
                            style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 3),
                          Container(width: 32, height: 2, color: AppTheme.electricPink),
                        ],
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.people_alt_outlined, color: Colors.white70, size: 12),
                            const SizedBox(width: 4),
                            Text(
                              '${_socketService.connectedUsers.length}',
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () => setState(() => _isChatDrawerOpen = false),
                        child: const Icon(Icons.close_rounded, color: Colors.white70, size: 18),
                      ),
                    ],
                  ),
                ),

                // Message List (using ListenableBuilder for instant real-time auto-refresh without reopening drawer)
                Expanded(
                  child: ListenableBuilder(
                    listenable: _socketService,
                    builder: (context, _) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (_chatScrollController.hasClients) {
                          _chatScrollController.animateTo(
                            _chatScrollController.position.maxScrollExtent,
                            duration: const Duration(milliseconds: 200),
                            curve: Curves.easeOut,
                          );
                        }
                      });
                      return ListView.builder(
                        controller: _chatScrollController,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        itemCount: _socketService.chatMessages.length,
                        itemBuilder: (context, index) {
                          final msg = _socketService.chatMessages[index];
                          final isMe = msg.name == widget.currentProfile.name ||
                              msg.name == widget.currentProfile.username ||
                              msg.username == widget.currentProfile.username ||
                              msg.name == 'You';
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 3),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                CircleAvatar(
                                  radius: 12,
                                  backgroundColor: AppTheme.electricPink.withValues(alpha: 0.25),
                                  child: Text(
                                    msg.name.isNotEmpty ? msg.name[0].toUpperCase() : '?',
                                    style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Text(
                                            isMe ? 'You' : msg.name,
                                            style: TextStyle(
                                              color: isMe ? AppTheme.electricPink : Colors.white,
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                          const SizedBox(width: 5),
                                          Text(
                                            '${msg.timestamp.hour.toString().padLeft(2, '0')}:${msg.timestamp.minute.toString().padLeft(2, '0')}',
                                            style: const TextStyle(color: Colors.white38, fontSize: 9),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 2),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                        decoration: BoxDecoration(
                                          color: isMe ? Colors.white.withValues(alpha: 0.12) : Colors.white.withValues(alpha: 0.06),
                                          borderRadius: BorderRadius.circular(10),
                                          border: Border.all(color: Colors.white10),
                                        ),
                                        child: Text(
                                          msg.text,
                                          style: const TextStyle(color: Colors.white, fontSize: 12),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),

                // Input Bar (Virtual keyboard friendly)
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: Colors.white12)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Container(
                          height: 36,
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: Colors.white12),
                          ),
                          child: TextField(
                            controller: _chatTextController,
                            style: const TextStyle(color: Colors.white, fontSize: 12),
                            decoration: const InputDecoration(
                              hintText: 'Type a message...',
                              hintStyle: TextStyle(color: Colors.white38, fontSize: 12),
                              border: InputBorder.none,
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(vertical: 8),
                            ),
                            onSubmitted: (_) => _sendMessage(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: _sendMessage,
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: const BoxDecoration(
                            color: AppTheme.electricPink,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.send_rounded, color: Colors.white, size: 16),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _sendMessage() {
    final text = _chatTextController.text.trim();
    if (text.isEmpty) return;
    _socketService.sendChatMessage(text);
    _chatTextController.clear();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScrollController.hasClients) {
        _chatScrollController.animateTo(
          _chatScrollController.position.maxScrollExtent + 80,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _formatDuration(Duration d) {
    final hours = d.inHours;
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    if (hours > 0) {
      return '$hours:$minutes:$seconds';
    }
    return '$minutes:$seconds';
  }
}
