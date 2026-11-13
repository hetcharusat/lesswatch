import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';
import '../../data/models/user_profile.dart';
import '../../data/services/session_service.dart';
import '../tabs/downloads_tab.dart';
import '../tabs/lounge_tab.dart';
import '../tabs/media_tab.dart';
import 'login_screen.dart';

class MainNavigationScreen extends StatefulWidget {
  final UserProfile currentProfile;
  final String token;

  const MainNavigationScreen({
    super.key,
    required this.currentProfile,
    required this.token,
  });

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  void _signOut() {
    HapticFeedback.mediumImpact();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: Color(0x3DF472B6), width: 1.5),
        ),
        title: const Text(
          'Sign Out?',
          style: TextStyle(color: AppTheme.textMain, fontWeight: FontWeight.w900),
        ),
        content: const Text(
          'Are you sure you want to sign out from Watch Together on this device?',
          style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted, fontWeight: FontWeight.w700)),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await SessionService.clearSession();
              if (mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (route) => false,
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.alertRed,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Sign Out', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = widget.currentProfile.isAdmin;

    // Solely One Room (Common Room) + Media Library (+ Downloads for Admin)
    final tabs = [
      LoungeTab(currentProfile: widget.currentProfile, token: widget.token),
      MediaTab(currentProfile: widget.currentProfile, token: widget.token),
      if (isAdmin)
        DownloadsTab(currentProfile: widget.currentProfile, token: widget.token),
    ];

    final navItems = [
      const BottomNavigationBarItem(
        icon: Icon(Icons.live_tv_rounded),
        activeIcon: Icon(Icons.live_tv_rounded, color: AppTheme.electricPink),
        label: 'Common Room',
      ),
      BottomNavigationBarItem(
        icon: const Icon(Icons.video_library_rounded),
        activeIcon: const Icon(Icons.video_library_rounded, color: AppTheme.electricPink),
        label: isAdmin ? 'Media & Queue' : 'Media Library',
      ),
      if (isAdmin)
        const BottomNavigationBarItem(
          icon: Icon(Icons.bolt_rounded),
          activeIcon: Icon(Icons.bolt_rounded, color: AppTheme.electricPink),
          label: 'Downloads',
        ),
    ];

    return Container(
      decoration: AppTheme.pageBackgroundDecoration,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFF472B6), Color(0xFFEC4899)],
                  ),
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: const [
                    BoxShadow(color: Color(0x33EC4899), blurRadius: 6, offset: Offset(0, 2)),
                  ],
                ),
                alignment: Alignment.center,
                child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 18),
              ),
              const SizedBox(width: 8),
              const Text(
                "Let's Watch",
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  color: AppTheme.textMain,
                  letterSpacing: -0.4,
                ),
              ),
            ],
          ),
          actions: [
            // User Avatar Pill
            Container(
              margin: const EdgeInsets.symmetric(vertical: 10),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.85),
                borderRadius: BorderRadius.circular(9999),
                border: Border.all(color: const Color(0x3DF472B6), width: 1.2),
                boxShadow: const [
                  BoxShadow(color: Color(0x14EC4899), blurRadius: 8, offset: Offset(0, 2)),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    isAdmin ? '👑' : '🌸',
                    style: const TextStyle(fontSize: 13),
                  ),
                  const SizedBox(width: 5),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 80),
                    child: Text(
                      widget.currentProfile.name,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.textMain,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.logout_rounded, color: AppTheme.textMuted, size: 20),
              tooltip: 'Sign Out',
              padding: const EdgeInsets.symmetric(horizontal: 6),
              constraints: const BoxConstraints(),
              onPressed: _signOut,
            ),
            const SizedBox(width: 6),
          ],
        ),
        body: IndexedStack(
          index: _currentIndex,
          children: tabs,
        ),
        bottomNavigationBar: ClipRRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.88),
                border: const Border(
                  top: BorderSide(
                    color: Color(0x2EF472B6),
                    width: 1.2,
                  ),
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0FEB4899),
                    blurRadius: 16,
                    offset: Offset(0, -4),
                  ),
                ],
              ),
              child: BottomNavigationBar(
                currentIndex: _currentIndex,
                onTap: (idx) {
                  HapticFeedback.selectionClick();
                  setState(() => _currentIndex = idx);
                },
                backgroundColor: Colors.transparent,
                elevation: 0,
                type: BottomNavigationBarType.fixed,
                selectedItemColor: AppTheme.electricPink,
                unselectedItemColor: AppTheme.textMuted,
                selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11),
                unselectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                items: navItems,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
