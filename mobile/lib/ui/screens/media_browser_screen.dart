import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';
import '../../data/models/media_item.dart';
import '../../data/models/user_profile.dart';
import '../../data/services/api_service.dart';
import '../widgets/glass_card.dart';
import 'player_screen.dart';

class MediaBrowserScreen extends StatefulWidget {
  final UserProfile currentProfile;

  const MediaBrowserScreen({
    super.key,
    required this.currentProfile,
  });

  @override
  State<MediaBrowserScreen> createState() => _MediaBrowserScreenState();
}

class _MediaBrowserScreenState extends State<MediaBrowserScreen> {
  final ApiService _apiService = ApiService();
  String _currentFolder = '';
  List<MediaItem> _files = [];
  List<String> _folders = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadMedia();
  }

  Future<void> _loadMedia({String folder = ''}) async {
    setState(() => _isLoading = true);
    try {
      final res = await _apiService.fetchMediaLibrary(folder: folder);
      setState(() {
        _files = res['files'] as List<MediaItem>;
        _folders = res['folders'] as List<String>;
        _currentFolder = res['currentFolder'] ?? '';
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading files: $e')),
        );
      }
    }
  }

  void _playMedia(MediaItem file) {
    HapticFeedback.mediumImpact();
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PlayerScreen(
          currentProfile: widget.currentProfile,
          initialMediaUrl: file.streamUrl,
          initialMediaTitle: file.filename,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Media Library'),
        leading: _currentFolder.isNotEmpty
            ? IconButton(
                icon: const Icon(Icons.arrow_back_ios_rounded, color: AppTheme.lightCherry),
                onPressed: () {
                  final parts = _currentFolder.split('/');
                  parts.removeLast();
                  _loadMedia(folder: parts.join('/'));
                },
              )
            : null,
        actions: [
          // Quick Jump to Cinema Room
          TextButton.icon(
            onPressed: () {
              HapticFeedback.lightImpact();
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => PlayerScreen(
                    currentProfile: widget.currentProfile,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.play_circle_fill_rounded, color: AppTheme.electricPink, size: 18),
            label: const Text(
              'Lounge',
              style: TextStyle(color: AppTheme.lightCherry, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.electricPink),
            )
          : RefreshIndicator(
              color: AppTheme.electricPink,
              onRefresh: () => _loadMedia(folder: _currentFolder),
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                children: [
                  // Current Path
                  if (_currentFolder.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12.0),
                      child: Text(
                        '📁 /$_currentFolder',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.lightCherry,
                        ),
                      ),
                    ),

                  // Folders
                  if (_folders.isNotEmpty) ...[
                    const Text(
                      'Folders',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.textMuted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    for (final folder in _folders) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8.0),
                        child: GlassCard(
                          borderRadius: 16,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          onTap: () {
                            HapticFeedback.selectionClick();
                            final next = _currentFolder.isEmpty ? folder : '$_currentFolder/$folder';
                            _loadMedia(folder: next);
                          },
                          child: Row(
                            children: [
                              const Text('📁', style: TextStyle(fontSize: 20)),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  folder,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                    color: AppTheme.textMain,
                                  ),
                                ),
                              ),
                              const Icon(Icons.arrow_forward_ios_rounded, color: AppTheme.textMuted, size: 14),
                            ],
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                  ],

                  // Files
                  const Text(
                    'Movies & Episodes',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.textMuted,
                    ),
                  ),
                  const SizedBox(height: 8),

                  if (_files.isEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      alignment: Alignment.center,
                      child: const Column(
                        children: [
                          Icon(Icons.movie_outlined, size: 40, color: AppTheme.textMuted),
                          SizedBox(height: 8),
                          Text('No media files here yet', style: TextStyle(color: AppTheme.textMuted)),
                        ],
                      ),
                    )
                  else
                    for (final file in _files) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10.0),
                        child: GlassCard(
                          borderRadius: 18,
                          padding: const EdgeInsets.all(14),
                          onTap: () => _playMedia(file),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: AppTheme.electricPink.withOpacity(0.2),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: AppTheme.electricPink.withOpacity(0.4)),
                                    ),
                                    child: const Text(
                                      'MKV',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w800,
                                        color: AppTheme.deepMagenta,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    file.sizeFormatted,
                                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                                  ),
                                  const Spacer(),
                                  const Icon(Icons.play_circle_fill_rounded, color: AppTheme.electricPink, size: 28),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                file.filename,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: AppTheme.textMain,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  if (file.audioTracks.isNotEmpty)
                                    Text(
                                      '🎧 ${file.audioTracks.length} Audio Tracks   ',
                                      style: const TextStyle(fontSize: 11, color: AppTheme.textSub),
                                    ),
                                  if (file.subtitles.isNotEmpty)
                                    Text(
                                      '💬 ${file.subtitles.length} Subtitles',
                                      style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                ],
              ),
            ),
    );
  }
}
