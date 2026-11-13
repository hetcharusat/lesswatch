import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';
import '../../data/models/user_profile.dart';
import '../../data/services/api_service.dart';
import '../screens/player_screen.dart';
import '../widgets/glass_card.dart';

class RoomsTab extends StatefulWidget {
  final UserProfile currentProfile;
  final String token;

  const RoomsTab({
    super.key,
    required this.currentProfile,
    required this.token,
  });

  @override
  State<RoomsTab> createState() => _RoomsTabState();
}

class _RoomsTabState extends State<RoomsTab> {
  final ApiService _apiService = ApiService();
  List<Map<String, dynamic>> _rooms = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchRooms();
  }

  Future<void> _fetchRooms() async {
    final list = await _apiService.getRooms();
    if (mounted) {
      setState(() {
        _rooms = list;
        _isLoading = false;
      });
    }
  }

  void _openCreateRoomDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surfaceContainer,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: AppTheme.electricPink.withOpacity(0.4)),
        ),
        title: const Text('Create Private Room', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
        content: TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'e.g. Anime Night, Jojo Watch...',
            hintStyle: const TextStyle(color: AppTheme.textMuted),
            filled: true,
            fillColor: Colors.white.withOpacity(0.08),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            onPressed: () {
              final name = controller.text.trim();
              if (name.isNotEmpty) {
                Navigator.of(ctx).pop();
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => PlayerScreen(
                      currentProfile: widget.currentProfile,
                    ),
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.electricPink),
            child: const Text('Create & Enter', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateRoomDialog,
        backgroundColor: AppTheme.electricPink,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('New Room', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.electricPink))
          : RefreshIndicator(
              color: AppTheme.electricPink,
              onRefresh: _fetchRooms,
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                children: [
                  const Text(
                    'Available Watch Rooms',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppTheme.textMain),
                  ),
                  const SizedBox(height: 12),

                  // Common Lounge Room
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12.0),
                    child: GlassCard(
                      borderRadius: 20,
                      borderColor: AppTheme.electricPink,
                      padding: const EdgeInsets.all(16),
                      onTap: () {
                        HapticFeedback.lightImpact();
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => PlayerScreen(currentProfile: widget.currentProfile),
                          ),
                        );
                      },
                      child: Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(colors: [AppTheme.electricPink, AppTheme.deepMagenta]),
                            ),
                            child: const Center(child: Text('🍿', style: TextStyle(fontSize: 22))),
                          ),
                          const SizedBox(width: 14),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Common Screen Lounge', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
                                SizedBox(height: 2),
                                Text('Shared synchronized room for Het & Ria', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                              ],
                            ),
                          ),
                          const Icon(Icons.arrow_forward_ios_rounded, color: AppTheme.lightCherry, size: 16),
                        ],
                      ),
                    ),
                  ),

                  for (final r in _rooms) ...[
                    if (r['id'] != 'lounge') ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10.0),
                        child: GlassCard(
                          borderRadius: 18,
                          padding: const EdgeInsets.all(14),
                          onTap: () {
                            HapticFeedback.lightImpact();
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => PlayerScreen(
                                  currentProfile: widget.currentProfile,
                                  initialMediaUrl: r['media']?['url']?.toString(),
                                  initialMediaTitle: r['media']?['title']?.toString(),
                                ),
                              ),
                            );
                          },
                          child: Row(
                            children: [
                              const Text('🚪', style: TextStyle(fontSize: 24)),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(r['name']?.toString() ?? r['id'].toString(), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Colors.white)),
                                    const SizedBox(height: 2),
                                    Text('${r['userCount'] ?? 0} members inside', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                                  ],
                                ),
                              ),
                              const Icon(Icons.play_arrow_rounded, color: AppTheme.lightCherry, size: 24),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),
    );
  }
}

