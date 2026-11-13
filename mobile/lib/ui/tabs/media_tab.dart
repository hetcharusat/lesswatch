import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';
import '../../data/models/media_item.dart';
import '../../data/models/user_profile.dart';
import '../../data/services/api_service.dart';
import '../screens/player_screen.dart';
import '../widgets/glass_card.dart';

class MediaTab extends StatefulWidget {
  final UserProfile currentProfile;
  final String token;

  const MediaTab({
    super.key,
    required this.currentProfile,
    required this.token,
  });

  @override
  State<MediaTab> createState() => _MediaTabState();
}

class _MediaTabState extends State<MediaTab> {
  final ApiService _apiService = ApiService();

  String _currentFolder = '';
  List<MediaItem> _files = [];
  List<String> _folders = [];
  List<Map<String, dynamic>> _activeJobs = [];
  bool _isLoading = true;

  // In-memory cache for instant 0ms folder navigation
  final Map<String, Map<String, dynamic>> _folderCache = {};

  String? _editingRelPath;
  final TextEditingController _renameController = TextEditingController();

  @override
  void dispose() {
    _renameController.dispose();
    super.dispose();
  }

  void _startRename(MediaItem file) {
    HapticFeedback.selectionClick();
    setState(() {
      _editingRelPath = file.relativePath.isNotEmpty ? file.relativePath : file.filename;
      _renameController.text = file.filename;
    });
  }

  void _cancelRename() {
    setState(() {
      _editingRelPath = null;
      _renameController.clear();
    });
  }

  Future<void> _submitRename(MediaItem file) async {
    final newName = _renameController.text.trim();
    if (newName.isEmpty) return;
    HapticFeedback.mediumImpact();

    final targetPath = file.relativePath.isNotEmpty ? file.relativePath : file.filename;
    final success = await _apiService.renameMediaFile(targetPath, newName, widget.token);

    if (mounted) {
      if (success) {
        setState(() {
          _editingRelPath = null;
          _renameController.clear();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('✓ Renamed file to "$newName"'),
            backgroundColor: AppTheme.emeraldGreen,
          ),
        );
        _loadData(folder: _currentFolder);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to rename file'),
            backgroundColor: AppTheme.alertRed,
          ),
        );
      }
    }
  }

  Future<void> _confirmDeleteMedia(MediaItem file) async {
    HapticFeedback.heavyImpact();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF160E1F),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Colors.redAccent, width: 1.5),
        ),
        title: const Text('Delete File?', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
        content: Text(
          'Are you sure you want to permanently delete "${file.filename}" from the server storage?',
          style: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.alertRed,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Delete', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final targetPath = file.relativePath.isNotEmpty ? file.relativePath : file.filename;
      final ok = await _apiService.deleteMediaFile(targetPath, widget.token);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ok ? '🗑️ Deleted "${file.filename}"' : 'Failed to delete file'),
            backgroundColor: ok ? AppTheme.emeraldGreen : AppTheme.alertRed,
          ),
        );
        if (ok) _loadData(folder: _currentFolder);
      }
    }
  }

  void _navigateBack() {
    HapticFeedback.lightImpact();
    if (_currentFolder.isEmpty) return;
    final parts = _currentFolder.split('/');
    parts.removeLast();
    _loadData(folder: parts.join('/'));
  }

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({String folder = '', bool forceRefresh = false}) async {
    // If cached, show immediately with 0 delay
    if (!forceRefresh && _folderCache.containsKey(folder)) {
      final cached = _folderCache[folder]!;
      setState(() {
        _files = cached['files'] as List<MediaItem>;
        _folders = cached['folders'] as List<String>;
        _currentFolder = cached['currentFolder'] ?? folder;
        _isLoading = false;
      });
    } else {
      setState(() => _isLoading = true);
    }

    try {
      final lib = await _apiService.fetchMediaLibrary(folder: folder, token: widget.token);
      List<Map<String, dynamic>> jobs = [];
      if (widget.currentProfile.isAdmin) {
        jobs = await _apiService.getTranscodeJobs();
      }

      _folderCache[folder] = lib;

      if (mounted) {
        setState(() {
          _files = lib['files'] as List<MediaItem>;
          _folders = lib['folders'] as List<String>;
          _currentFolder = lib['currentFolder'] ?? '';
          _activeJobs = jobs;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
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

  void _triggerProcessAudio(MediaItem file) async {
    HapticFeedback.selectionClick();
    final ok = await _apiService.triggerAudioProcess(file.relativePath.isNotEmpty ? file.relativePath : file.filename);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? '⚡ Audio processing started for "${file.filename}"' : 'Processing request failed'),
          backgroundColor: ok ? AppTheme.emeraldGreen : AppTheme.alertRed,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _currentFolder.isEmpty,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && _currentFolder.isNotEmpty) {
          _navigateBack();
        }
      },
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text(_currentFolder.isEmpty ? 'Media Storage' : '📁 /$_currentFolder'),
          leading: _currentFolder.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.arrow_back_ios_rounded, color: AppTheme.lightCherry),
                  onPressed: _navigateBack,
                )
              : null,
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator(color: AppTheme.electricPink))
            : RefreshIndicator(
                color: AppTheme.electricPink,
                onRefresh: () => _loadData(folder: _currentFolder, forceRefresh: true),
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                children: [
                  // Active Transcoding Jobs (Admin only)
                  if (widget.currentProfile.isAdmin && _activeJobs.isNotEmpty) ...[
                    const Text('⚡ Active Video Processing Queue', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppTheme.electricPink)),
                    const SizedBox(height: 8),
                    for (final job in _activeJobs) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8.0),
                        child: GlassCard(
                          borderRadius: 16,
                          padding: const EdgeInsets.all(12),
                          borderColor: AppTheme.emeraldGreen,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(job['filename']?.toString() ?? 'Transcoding...', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppTheme.textMain)),
                              const SizedBox(height: 6),
                              LinearProgressIndicator(
                                value: ((job['progress'] as num?)?.toDouble() ?? 0) / 100.0,
                                backgroundColor: const Color(0x1FEB4899),
                                color: AppTheme.emeraldGreen,
                              ),
                              const SizedBox(height: 4),
                              Text('${job['progress']}% • Speed: ${job['speed']} • FPS: ${job['fps']}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                            ],
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                  ],

                  // Folders
                  if (_folders.isNotEmpty) ...[
                    const Text('Folders', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppTheme.textMain)),
                    const SizedBox(height: 8),
                    for (final folder in _folders) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8.0),
                        child: GlassCard(
                          borderRadius: 16,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          onTap: () {
                            final next = _currentFolder.isEmpty ? folder : '$_currentFolder/$folder';
                            _loadData(folder: next);
                          },
                          child: Row(
                            children: [
                              const Text('📁', style: TextStyle(fontSize: 20)),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(folder, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppTheme.textMain)),
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
                  const Text('Movies & Episodes', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppTheme.textMain)),
                  const SizedBox(height: 8),

                  if (_files.isEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      alignment: Alignment.center,
                      child: const Text('No media in this folder', style: TextStyle(color: AppTheme.textMuted)),
                    )
                  else
                    for (final file in _files) ...[
                      Builder(builder: (context) {
                        final fileKey = file.relativePath.isNotEmpty ? file.relativePath : file.filename;
                        final isEditing = _editingRelPath == fileKey;
                        final ext = file.filename.contains('.') ? file.filename.split('.').last.toUpperCase() : 'MEDIA';

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12.0),
                          child: GlassCard(
                            borderRadius: 20,
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Top Badges: Format & File Size
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: ext == 'MKV'
                                            ? AppTheme.electricPink.withOpacity(0.15)
                                            : Colors.teal.withOpacity(0.15),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: ext == 'MKV' ? const Color(0x66EC4899) : Colors.teal.shade300,
                                          width: 1,
                                        ),
                                      ),
                                      child: Text(
                                        ext,
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w900,
                                          color: ext == 'MKV' ? AppTheme.deepMagenta : Colors.teal.shade800,
                                        ),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: const Color(0x3DF472B6)),
                                      ),
                                      child: Text(
                                        file.sizeFormatted,
                                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.textMuted),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),

                                // File Title or Inline Rename Input
                                if (isEditing) ...[
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Container(
                                          height: 40,
                                          decoration: BoxDecoration(
                                            color: Colors.white,
                                            borderRadius: BorderRadius.circular(10),
                                            border: Border.all(color: AppTheme.electricPink, width: 2),
                                          ),
                                          child: TextField(
                                            controller: _renameController,
                                            autofocus: true,
                                            style: const TextStyle(
                                              color: Color(0xFF831843),
                                              fontSize: 13,
                                              fontWeight: FontWeight.w700,
                                            ),
                                            decoration: const InputDecoration(
                                              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                                              border: InputBorder.none,
                                              isDense: true,
                                            ),
                                            onSubmitted: (_) => _submitRename(file),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      InkWell(
                                        onTap: () => _submitRename(file),
                                        borderRadius: BorderRadius.circular(10),
                                        child: Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            color: AppTheme.emeraldGreen,
                                            borderRadius: BorderRadius.circular(10),
                                            boxShadow: [
                                              BoxShadow(color: AppTheme.emeraldGreen.withOpacity(0.4), blurRadius: 6),
                                            ],
                                          ),
                                          child: const Icon(Icons.check_rounded, color: Colors.white, size: 20),
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      InkWell(
                                        onTap: _cancelRename,
                                        borderRadius: BorderRadius.circular(10),
                                        child: Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            color: AppTheme.alertRed,
                                            borderRadius: BorderRadius.circular(10),
                                            boxShadow: [
                                              BoxShadow(color: AppTheme.alertRed.withOpacity(0.4), blurRadius: 6),
                                            ],
                                          ),
                                          child: const Icon(Icons.close_rounded, color: Colors.white, size: 20),
                                        ),
                                      ),
                                    ],
                                  ),
                                ] else ...[
                                  Text(
                                    file.filename,
                                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppTheme.textMain, height: 1.25),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                                const SizedBox(height: 8),

                                // Tech Badges: Multi-audio & Subtitles
                                Row(
                                  children: [
                                    if (file.audioTracks.isNotEmpty)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        margin: const EdgeInsets.only(right: 8),
                                        decoration: BoxDecoration(
                                          color: AppTheme.electricPink.withOpacity(0.12),
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(color: AppTheme.electricPink.withOpacity(0.35)),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Text('🎧 ⚡ ', style: TextStyle(fontSize: 11)),
                                            Text(
                                              '${file.audioTracks.length} Audio Tracks',
                                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.deepMagenta),
                                            ),
                                          ],
                                        ),
                                      ),
                                    if (file.subtitles.isNotEmpty)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(color: const Color(0x3DF472B6)),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Text('🗈 ', style: TextStyle(fontSize: 11)),
                                            Text(
                                              '${file.subtitles.length} Subtitles',
                                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textMuted),
                                            ),
                                          ],
                                        ),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 12),

                                // Actions Deck: Play in Lounge, Process Audio, Rename, Delete
                                Row(
                                  children: [
                                    Expanded(
                                      child: SizedBox(
                                        height: 42,
                                        child: ElevatedButton.icon(
                                          onPressed: () => _playMedia(file),
                                          icon: const Icon(Icons.play_circle_fill_rounded, size: 20),
                                          label: const Text('Play in Lounge', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: AppTheme.electricPink,
                                            foregroundColor: Colors.white,
                                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                            elevation: 4,
                                          ),
                                        ),
                                      ),
                                    ),
                                    if (widget.currentProfile.isAdmin) ...[
                                      const SizedBox(width: 8),
                                      InkWell(
                                        onTap: () => _triggerProcessAudio(file),
                                        borderRadius: BorderRadius.circular(10),
                                        child: Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            color: Colors.purple.withOpacity(0.18),
                                            borderRadius: BorderRadius.circular(10),
                                            border: Border.all(color: Colors.purpleAccent.withOpacity(0.4)),
                                          ),
                                          child: const Icon(Icons.bolt_rounded, color: Colors.purpleAccent, size: 20),
                                        ),
                                      ),
                                      if (!isEditing) ...[
                                        const SizedBox(width: 6),
                                        InkWell(
                                          onTap: () => _startRename(file),
                                          borderRadius: BorderRadius.circular(10),
                                          child: Container(
                                            width: 38,
                                            height: 38,
                                            decoration: BoxDecoration(
                                              color: Colors.white.withOpacity(0.08),
                                              borderRadius: BorderRadius.circular(10),
                                              border: Border.all(color: Colors.amber.withOpacity(0.4)),
                                            ),
                                            child: const Icon(Icons.edit_rounded, color: Colors.amber, size: 18),
                                          ),
                                        ),
                                      ],
                                      const SizedBox(width: 6),
                                      InkWell(
                                        onTap: () => _confirmDeleteMedia(file),
                                        borderRadius: BorderRadius.circular(10),
                                        child: Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            color: Colors.redAccent.withOpacity(0.12),
                                            borderRadius: BorderRadius.circular(10),
                                            border: Border.all(color: Colors.redAccent.withOpacity(0.4)),
                                          ),
                                          child: const Icon(Icons.delete_outline_rounded, color: Colors.redAccent, size: 18),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                    ],
                ],
              ),
            ),
      ),
    );
  }
}
