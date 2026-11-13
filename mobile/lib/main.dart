import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'core/theme.dart';
import 'data/models/user_profile.dart';
import 'data/services/session_service.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/main_navigation_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize WebRTC with bypassVoiceProcessing: true at root startup
  // This forces MediaRecorder.AudioSource.MIC and disables HW NS/AEC filters
  // so the microphone records pure, crisp, studio-grade 48kHz audio without any muffling or effects.
  if (WebRTC.platformIsAndroid) {
    try {
      await WebRTC.initialize(options: {'bypassVoiceProcessing': true});
    } catch (e) {
      debugPrint('⚠️ [WebRTC] initialize bypassVoiceProcessing failed: $e');
    }
  }

  // Screen orientations - Lock to portrait initially so app never auto-rotates on launch
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]);

  // Check saved session
  final session = await SessionService.getSession();
  final initialUser = session?['user'] as UserProfile?;
  final initialToken = session?['token'] as String?;

  runApp(WatchTogetherApp(
    initialUser: initialUser,
    initialToken: initialToken,
  ));
}

class WatchTogetherApp extends StatelessWidget {
  final UserProfile? initialUser;
  final String? initialToken;

  const WatchTogetherApp({
    super.key,
    this.initialUser,
    this.initialToken,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Watch Together',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: (initialUser != null && initialToken != null)
          ? MainNavigationScreen(
              currentProfile: initialUser!,
              token: initialToken!,
            )
          : const LoginScreen(),
    );
  }
}
