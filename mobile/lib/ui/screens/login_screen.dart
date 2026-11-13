import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';
import '../../data/models/user_profile.dart';
import '../../data/services/api_service.dart';
import '../../data/services/session_service.dart';
import '../widgets/glass_card.dart';
import 'main_navigation_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final ApiService _apiService = ApiService();

  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _confirmPassController = TextEditingController();

  bool _isSignUp = false;
  bool _isLoading = false;
  String? _errorMessage;

  void _submit() async {
    final email = _emailController.text.trim();
    final pass = _passwordController.text.trim();

    if (email.isEmpty || pass.isEmpty) {
      setState(() => _errorMessage = 'Please enter both email/username and password');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      if (_isSignUp) {
        final confirm = _confirmPassController.text.trim();
        final name = _nameController.text.trim();
        final res = await _apiService.register(
          email: email,
          password: pass,
          confirmPassword: confirm,
          name: name.isEmpty ? email : name,
        );
        final token = res['token'] as String;
        final user = res['user'] as UserProfile;
        await SessionService.saveSession(token, user);

        if (mounted) {
          HapticFeedback.mediumImpact();
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => MainNavigationScreen(currentProfile: user, token: token),
            ),
          );
        }
      } else {
        final res = await _apiService.login(email, pass);
        final token = res['token'] as String;
        final user = res['user'] as UserProfile;
        await SessionService.saveSession(token, user);

        if (mounted) {
          HapticFeedback.mediumImpact();
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => MainNavigationScreen(currentProfile: user, token: token),
            ),
          );
        }
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _quickLogin(String username, String pass) {
    _emailController.text = username;
    _passwordController.text = pass;
    _submit();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: AppTheme.pageBackgroundDecoration,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo
                  Container(
                    width: 58,
                    height: 58,
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
                          blurRadius: 20,
                          offset: const Offset(0, 5),
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Icon(
                        Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 32,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  const Text(
                    "Let's Watch",
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                      color: AppTheme.textMain,
                      letterSpacing: -0.6,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _isSignUp ? 'Create your cinema account' : 'Sign in to join the common room',
                    style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 16),

                  // Quick 1-Tap Login Chips
                  if (!_isSignUp) ...[
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'QUICK 1-TAP LOGIN',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.textSub,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: GlassCard(
                            borderRadius: 16,
                            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                            onTap: () => _quickLogin('het', '1234'),
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text('👑', style: TextStyle(fontSize: 18)),
                                SizedBox(width: 8),
                                Text(
                                  'Het (Admin)',
                                  style: TextStyle(fontWeight: FontWeight.w800, color: AppTheme.textMain, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: GlassCard(
                            borderRadius: 16,
                            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                            onTap: () => _quickLogin('ria', '1234'),
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text('🌸', style: TextStyle(fontSize: 18)),
                                SizedBox(width: 8),
                                Text(
                                  'Ria (Lounge)',
                                  style: TextStyle(fontWeight: FontWeight.w800, color: AppTheme.textMain, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    Row(
                      children: [
                        Expanded(child: Divider(color: AppTheme.softBlossom.withOpacity(0.3))),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 10),
                          child: Text(
                            'OR EMAIL SIGN IN',
                            style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.w800),
                          ),
                        ),
                        Expanded(child: Divider(color: AppTheme.softBlossom.withOpacity(0.3))),
                      ],
                    ),
                    const SizedBox(height: 18),
                  ],

                  // Form card
                  GlassCard(
                    borderRadius: 22,
                    padding: const EdgeInsets.all(22),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_isSignUp) ...[
                          TextField(
                            controller: _nameController,
                            style: const TextStyle(color: AppTheme.textMain),
                            decoration: _inputDecoration('Full Name', Icons.person_outline_rounded),
                          ),
                          const SizedBox(height: 12),
                        ],

                        TextField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          style: const TextStyle(color: AppTheme.textMain),
                          decoration: _inputDecoration('Email or Username', Icons.alternate_email_rounded),
                        ),
                        const SizedBox(height: 12),

                        TextField(
                          controller: _passwordController,
                          obscureText: true,
                          style: const TextStyle(color: AppTheme.textMain),
                          decoration: _inputDecoration('Password', Icons.lock_outline_rounded),
                        ),

                        if (_isSignUp) ...[
                          const SizedBox(height: 12),
                          TextField(
                            controller: _confirmPassController,
                            obscureText: true,
                            style: const TextStyle(color: AppTheme.textMain),
                            decoration: _inputDecoration('Confirm Password', Icons.lock_reset_rounded),
                          ),
                        ],

                        if (_errorMessage != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            _errorMessage!,
                            style: const TextStyle(color: AppTheme.alertRed, fontSize: 12, fontWeight: FontWeight.w700),
                            textAlign: TextAlign.center,
                          ),
                        ],
                        const SizedBox(height: 20),

                        ElevatedButton(
                          onPressed: _isLoading ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.electricPink,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                            elevation: 2,
                            shadowColor: AppTheme.electricPink.withOpacity(0.4),
                          ),
                          child: _isLoading
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                )
                              : Text(
                                  _isSignUp ? 'Create Account' : 'Sign In',
                                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                                ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Toggle Sign Up / Sign In
                  TextButton(
                    onPressed: () {
                      setState(() {
                        _isSignUp = !_isSignUp;
                        _errorMessage = null;
                      });
                    },
                    child: Text(
                      _isSignUp
                          ? 'Already have an account? Sign In'
                          : 'Created an account on desktop? Sign In or Register',
                      style: const TextStyle(color: AppTheme.textSub, fontSize: 13, fontWeight: FontWeight.w700),
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

  InputDecoration _inputDecoration(String label, IconData icon) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
      prefixIcon: Icon(icon, color: AppTheme.electricPink, size: 18),
      filled: true,
      fillColor: AppTheme.pinkBackground,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppTheme.softBlossom.withOpacity(0.3)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppTheme.softBlossom.withOpacity(0.3)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppTheme.electricPink, width: 1.5),
      ),
    );
  }
}
