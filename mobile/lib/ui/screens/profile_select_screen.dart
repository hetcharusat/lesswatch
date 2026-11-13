import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';
import '../../data/models/user_profile.dart';
import '../widgets/glass_card.dart';
import 'media_browser_screen.dart';

class ProfileSelectScreen extends StatelessWidget {
  const ProfileSelectScreen({super.key});

  final List<UserProfile> predefinedProfiles = const [
    UserProfile(
      id: 'het',
      name: 'Het',
      username: 'het',
      avatar: 'josuke',
    ),
    UserProfile(
      id: 'ria',
      name: 'Ria',
      username: 'ria',
      avatar: 'giorno',
    ),
  ];

  void _selectProfile(BuildContext context, UserProfile profile) {
    HapticFeedback.mediumImpact();
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => MediaBrowserScreen(currentProfile: profile),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: AppTheme.pageBackgroundDecoration,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Popcorn / Logo
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      colors: [AppTheme.electricPink, AppTheme.deepMagenta],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.electricPink.withValues(alpha: 0.35),
                        blurRadius: 24,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 36,
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                const Text(
                  "Let's Watch",
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    color: AppTheme.textMain,
                    letterSpacing: -0.6,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Private Cinema Lounge for Het & Ria',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppTheme.textMuted,
                  ),
                ),
                const SizedBox(height: 22),

                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Who is watching today?',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.textSub,
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Profile Cards
                for (final profile in predefinedProfiles) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 14.0),
                    child: GlassCard(
                      borderRadius: 22,
                      padding: const EdgeInsets.all(18),
                      onTap: () => _selectProfile(context, profile),
                      child: Row(
                        children: [
                          Container(
                            width: 50,
                            height: 50,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: LinearGradient(
                                colors: profile.username == 'het'
                                    ? [const Color(0xFF6366F1), const Color(0xFF4F46E5)]
                                    : [AppTheme.electricPink, AppTheme.deepMagenta],
                              ),
                            ),
                            child: Center(
                              child: Text(
                                profile.name[0],
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  profile.name,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: AppTheme.textMain,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '@${profile.username} • Tap to enter Lounge',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppTheme.textMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.arrow_forward_ios_rounded,
                            color: AppTheme.electricPink,
                            size: 16,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
  }
}
