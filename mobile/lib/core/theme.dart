import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Pink Light Theme Palette
  static const Color pinkBackground = Color(0xFFFFF5F8);
  static const Color pinkBackgroundSoft = Color(0xFFFFF0F5);
  static const Color pinkBackgroundGradientEnd = Color(0xFFFDE8F0);

  static const Color surfaceGlass = Color(0xEBFFFFFF); // 92% White Frosted Glass
  static const Color surfaceGlassHigh = Color(0xF7FFFFFF);
  static const Color surfaceContainer = Color(0xFFFFFFFF);

  static const Color electricPink = Color(0xFFEC4899); // Vibrant Rose
  static const Color softBlossom = Color(0xFFF472B6);
  static const Color lightCherry = Color(0xFFFFB0CD);
  static const Color deepMagenta = Color(0xFFBE185D);

  // Deep contrast typography for crystal readability on light surfaces
  static const Color textMain = Color(0xFF831843); // Deep Berry Plum
  static const Color textSub = Color(0xFF9D174D);  // Mid Berry
  static const Color textMuted = Color(0xFF6B7280); // Slate Charcoal
  static const Color textLight = Color(0xFF9CA3AF);

  static const Color emeraldGreen = Color(0xFF10B981);
  static const Color alertRed = Color(0xFFEF4444);
  static const Color amberWarning = Color(0xFFF59E0B);

  static BoxDecoration get pageBackgroundDecoration {
    return const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color(0xFFFFF7FA),
          Color(0xFFFFF0F5),
          Color(0xFFFDE8F0),
        ],
      ),
    );
  }

  static ThemeData get lightTheme {
    return ThemeData.light().copyWith(
      scaffoldBackgroundColor: pinkBackground,
      colorScheme: const ColorScheme.light(
        primary: electricPink,
        secondary: softBlossom,
        surface: surfaceContainer,
        error: alertRed,
        onPrimary: Colors.white,
        onSurface: textMain,
      ),
      textTheme: GoogleFonts.plusJakartaSansTextTheme(
        ThemeData.light().textTheme,
      ).apply(
        bodyColor: textMain,
        displayColor: textMain,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: textMain),
        titleTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 18,
          fontWeight: FontWeight.w800,
          color: textMain,
        ),
      ),
    );
  }

  // Alias for backward compatibility
  static ThemeData get darkTheme => lightTheme;
}
