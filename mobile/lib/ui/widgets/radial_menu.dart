import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';

class RadialMenuItem {
  final String id;
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final Color? iconColor;

  const RadialMenuItem({
    required this.id,
    required this.label,
    required this.icon,
    required this.onTap,
    this.iconColor,
  });
}

class RadialMenuOverlay extends StatefulWidget {
  final Offset position;
  final VoidCallback onClose;
  final List<RadialMenuItem> items;

  const RadialMenuOverlay({
    super.key,
    required this.position,
    required this.onClose,
    required this.items,
  });

  @override
  State<RadialMenuOverlay> createState() => _RadialMenuOverlayState();
}

class _RadialMenuOverlayState extends State<RadialMenuOverlay> with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
    );
    _scaleAnimation = CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOutBack,
    );
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _handleClose() {
    _animController.reverse().then((_) => widget.onClose());
  }

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.of(context).size;
    final clampedX = widget.position.dx.clamp(90.0, screenSize.width - 90.0);
    final clampedY = widget.position.dy.clamp(90.0, screenSize.height - 90.0);
    final count = widget.items.length;
    const radius = 100.0;

    return GestureDetector(
      onTap: _handleClose,
      behavior: HitTestBehavior.opaque,
      child: Container(
        color: Colors.black.withOpacity(0.55),
        child: Stack(
          children: [
            Positioned(
              left: clampedX,
              top: clampedY,
              child: ScaleTransition(
                scale: _scaleAnimation,
                child: Stack(
                  alignment: Alignment.center,
                  clipBehavior: Clip.none,
                  children: [
                    // Center Core Button
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        _handleClose();
                      },
                      child: Container(
                        width: 50,
                        height: 50,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: const LinearGradient(
                            colors: [AppTheme.electricPink, AppTheme.deepMagenta],
                          ),
                          border: Border.all(color: Colors.white.withOpacity(0.6), width: 1.5),
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.electricPink.withOpacity(0.6),
                              blurRadius: 20,
                            ),
                          ],
                        ),
                        child: const Icon(Icons.close, color: Colors.white, size: 22),
                      ),
                    ),

                    // Outer Nodes
                    for (int i = 0; i < count; i++) ...[
                      Builder(builder: (context) {
                        final angle = (i * (2 * math.pi / count)) - (math.pi / 2);
                        final x = math.cos(angle) * radius;
                        final y = math.sin(angle) * radius;
                        final item = widget.items[i];

                        return Transform.translate(
                          offset: Offset(x - 28, y - 28),
                          child: GestureDetector(
                            onTap: () {
                              HapticFeedback.selectionClick();
                              item.onTap();
                              _handleClose();
                            },
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(9999),
                              child: BackdropFilter(
                                filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                                child: Container(
                                  width: 56,
                                  height: 56,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: AppTheme.surfaceGlass,
                                    border: Border.all(
                                      color: AppTheme.electricPink.withOpacity(0.5),
                                      width: 1.2,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withOpacity(0.5),
                                        blurRadius: 16,
                                      ),
                                    ],
                                  ),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        item.icon,
                                        size: 18,
                                        color: item.iconColor ?? AppTheme.textMain,
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        item.label,
                                        style: const TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w800,
                                          color: AppTheme.lightCherry,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

