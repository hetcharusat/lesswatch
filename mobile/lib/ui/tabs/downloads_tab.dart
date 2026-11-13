import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../data/models/user_profile.dart';
import '../../data/services/api_service.dart';
import '../widgets/glass_card.dart';

class DownloadsTab extends StatefulWidget {
  final UserProfile currentProfile;
  final String token;

  const DownloadsTab({
    super.key,
    required this.currentProfile,
    required this.token,
  });

  @override
  State<DownloadsTab> createState() => _DownloadsTabState();
}

class _DownloadsTabState extends State<DownloadsTab> {
  final ApiService _apiService = ApiService();
  final TextEditingController _urlController = TextEditingController();

  List<dynamic> _active = [];
  List<dynamic> _stopped = [];
  bool _isLoading = true;
  bool _isAdding = false;

  @override
  void initState() {
    super.initState();
    _fetchDownloads();
  }

  Future<void> _fetchDownloads() async {
    final res = await _apiService.getDownloads(widget.token);
    if (mounted) {
      setState(() {
        _active = [
          ...(res['active'] as List<dynamic>? ?? []),
          ...(res['waiting'] as List<dynamic>? ?? []),
        ];
        _stopped = res['stopped'] as List<dynamic>? ?? [];
        _isLoading = false;
      });
    }
  }

  void _addDownload() async {
    final url = _urlController.text.trim();
    if (url.isEmpty) return;

    setState(() => _isAdding = true);
    final ok = await _apiService.addDownload(widget.token, url);
    setState(() => _isAdding = false);

    if (mounted) {
      if (ok) {
        _urlController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('⚡ Torrent / Link added to server!'), backgroundColor: AppTheme.emeraldGreen),
        );
        _fetchDownloads();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to add download link'), backgroundColor: AppTheme.alertRed),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Server Downloader (Aria2)'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.electricPink))
          : RefreshIndicator(
              color: AppTheme.electricPink,
              onRefresh: _fetchDownloads,
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                children: [
                  // Add Download Card
                  GlassCard(
                    borderRadius: 20,
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Add Torrent or Magnet Link',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppTheme.textSub),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _urlController,
                                style: const TextStyle(color: AppTheme.textMain, fontSize: 13),
                                decoration: InputDecoration(
                                  hintText: 'magnet:?xt=urn:btih:... or http://...',
                                  hintStyle: const TextStyle(color: AppTheme.textMuted),
                                  filled: true,
                                  fillColor: AppTheme.pinkBackground,
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide(color: AppTheme.softBlossom.withOpacity(0.3)),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide(color: AppTheme.softBlossom.withOpacity(0.3)),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(color: AppTheme.electricPink, width: 1.5),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton(
                              onPressed: _isAdding ? null : _addDownload,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.electricPink,
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              child: _isAdding
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                  : const Text('Download', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Active Downloads
                  const Text('Active Downloads', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppTheme.textMain)),
                  const SizedBox(height: 8),

                  if (_active.isEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      alignment: Alignment.center,
                      child: const Text('No active torrent downloads', style: TextStyle(color: AppTheme.textMuted)),
                    )
                  else
                    for (final item in _active) ...[
                      Builder(builder: (context) {
                        final files = item['files'] as List<dynamic>? ?? [];
                        final name = files.isNotEmpty ? (files[0]['path']?.toString().split('/').last ?? 'Torrent') : 'Torrent Download';
                        final completed = (int.tryParse(item['completedLength']?.toString() ?? '0') ?? 0);
                        final total = (int.tryParse(item['totalLength']?.toString() ?? '0') ?? 1);
                        final progress = total > 0 ? (completed / total).clamp(0.0, 1.0) : 0.0;
                        final speed = (int.tryParse(item['downloadSpeed']?.toString() ?? '0') ?? 0) / (1024 * 1024);

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10.0),
                          child: GlassCard(
                            borderRadius: 18,
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppTheme.textMain), maxLines: 1, overflow: TextOverflow.ellipsis),
                                const SizedBox(height: 8),
                                LinearProgressIndicator(
                                  value: progress,
                                  backgroundColor: Colors.white12,
                                  color: AppTheme.electricPink,
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text('${(progress * 100).toStringAsFixed(1)}% completed', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                                    Text('${speed.toStringAsFixed(2)} MB/s', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppTheme.emeraldGreen)),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                    ],

                  const SizedBox(height: 16),
                  if (_stopped.isNotEmpty) ...[
                    const Text('Completed / Stopped', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppTheme.textMuted)),
                    const SizedBox(height: 8),
                    for (final item in _stopped.take(5)) ...[
                      Builder(builder: (context) {
                        final files = item['files'] as List<dynamic>? ?? [];
                        final name = files.isNotEmpty ? (files[0]['path']?.toString().split('/').last ?? 'File') : 'Download';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 6.0),
                          child: GlassCard(
                            borderRadius: 12,
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            child: Row(
                              children: [
                                const Icon(Icons.check_circle_rounded, color: AppTheme.emeraldGreen, size: 18),
                                const SizedBox(width: 10),
                                Expanded(child: Text(name, style: const TextStyle(fontSize: 12, color: Colors.white70), maxLines: 1, overflow: TextOverflow.ellipsis)),
                              ],
                            ),
                          ),
                        );
                      }),
                    ],
                  ],
                ],
              ),
            ),
    );
  }
}
