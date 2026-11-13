import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import '../../core/theme.dart';
import '../../data/models/chat_message.dart';
import '../../data/models/user_profile.dart';

class FloatingChatOverlay extends StatefulWidget {
  final List<ChatMessage> messages;
  final UserProfile currentProfile;
  final Function(String text) onSendMessage;
  final VoidCallback onClose;

  const FloatingChatOverlay({
    super.key,
    required this.messages,
    required this.currentProfile,
    required this.onSendMessage,
    required this.onClose,
  });

  @override
  State<FloatingChatOverlay> createState() => _FloatingChatOverlayState();
}

class _FloatingChatOverlayState extends State<FloatingChatOverlay> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();

  late stt.SpeechToText _speech;
  bool _isSpeechAvailable = false;
  bool _isListening = false;
  String _lastWords = '';

  final List<String> _quickReactions = ['❤️', '😂', '🍿', '🥺', '🔥', '👏', '✨', '💀'];

  @override
  void initState() {
    super.initState();
    _speech = stt.SpeechToText();
    _initSpeech();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
  }

  Future<void> _initSpeech() async {
    try {
      final available = await _speech.initialize(
        onError: (val) => setState(() => _isListening = false),
        onStatus: (val) {
          if (val == 'done' || val == 'notListening') {
            setState(() => _isListening = false);
          }
        },
      );
      if (mounted) {
        setState(() => _isSpeechAvailable = available);
      }
    } catch (_) {
      // Speech not available or denied
    }
  }

  void _toggleListening() async {
    HapticFeedback.mediumImpact();
    if (!_isSpeechAvailable) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Speech recognition not available on this device'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    if (_isListening) {
      await _speech.stop();
      setState(() => _isListening = false);
    } else {
      setState(() => _isListening = true);
      await _speech.listen(
        onResult: (result) {
          setState(() {
            _lastWords = result.recognizedWords;
            _textController.text = _lastWords;
            _textController.selection = TextSelection.fromPosition(
              TextPosition(offset: _textController.text.length),
            );
          });
        },
      );
    }
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  void _send() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.lightImpact();
    widget.onSendMessage(text);
    _textController.clear();
    _lastWords = '';
    if (_isListening) {
      _speech.stop();
      setState(() => _isListening = false);
    }
    Future.delayed(const Duration(milliseconds: 60), _scrollToBottom);
  }

  void _sendReaction(String reaction) {
    HapticFeedback.selectionClick();
    widget.onSendMessage(reaction);
    Future.delayed(const Duration(milliseconds: 60), _scrollToBottom);
  }

  @override
  void dispose() {
    _speech.stop();
    _textController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        _focusNode.unfocus();
      },
      onHorizontalDragEnd: (details) {
        // Swipe left-to-right dismisses the chat overlay!
        if (details.primaryVelocity != null && details.primaryVelocity! > 120) {
          HapticFeedback.lightImpact();
          widget.onClose();
        }
      },
      child: Container(
        width: 380,
        height: double.infinity,
        margin: const EdgeInsets.only(top: 8, bottom: 8, right: 8),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.65),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: AppTheme.electricPink.withValues(alpha: 0.45),
                  width: 1.2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.5),
                    blurRadius: 28,
                    offset: const Offset(-4, 4),
                  ),
                ],
              ),
              child: Column(
                children: [
                  // Header
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: Colors.white.withValues(alpha: 0.12),
                          width: 1,
                        ),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: Color(0xFF34D399),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Text(
                              'Chit-Chat Live',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                                letterSpacing: -0.2,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppTheme.electricPink.withValues(alpha: 0.25),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                '${widget.messages.length}',
                                style: const TextStyle(
                                  color: AppTheme.lightCherry,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ),
                        Row(
                          children: [
                            GestureDetector(
                              onTap: widget.onClose,
                              child: Container(
                                padding: const EdgeInsets.all(4),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.12),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.close_rounded, color: Colors.white70, size: 16),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  // Messages Stream
                  Expanded(
                    child: widget.messages.isEmpty
                        ? Center(
                            child: Text(
                              'No messages yet.\nSay something or tap mic to speak! 💬',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.5),
                                fontSize: 12,
                                height: 1.4,
                              ),
                            ),
                          )
                        : ListView.builder(
                            controller: _scrollController,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            itemCount: widget.messages.length,
                            itemBuilder: (context, index) {
                              final msg = widget.messages[index];
                              final isMe = msg.username.toLowerCase() == widget.currentProfile.username.toLowerCase() ||
                                  msg.name.toLowerCase() == widget.currentProfile.name.toLowerCase();

                              return Padding(
                                padding: const EdgeInsets.only(bottom: 8.0),
                                child: Align(
                                  alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      if (!isMe) ...[
                                        Container(
                                          width: 22,
                                          height: 22,
                                          margin: const EdgeInsets.only(right: 6, bottom: 2),
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            gradient: const LinearGradient(
                                              colors: [AppTheme.electricPink, AppTheme.deepMagenta],
                                            ),
                                          ),
                                          child: Center(
                                            child: Text(
                                              msg.name.isNotEmpty ? msg.name[0].toUpperCase() : '?',
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 11,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                      Flexible(
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                          decoration: BoxDecoration(
                                            color: isMe
                                                ? AppTheme.electricPink.withValues(alpha: 0.85)
                                                : Colors.white.withValues(alpha: 0.16),
                                            borderRadius: BorderRadius.only(
                                              topLeft: const Radius.circular(14),
                                              topRight: const Radius.circular(14),
                                              bottomLeft: Radius.circular(isMe ? 14 : 2),
                                              bottomRight: Radius.circular(isMe ? 2 : 14),
                                            ),
                                            border: Border.all(
                                              color: isMe
                                                  ? AppTheme.lightCherry.withValues(alpha: 0.6)
                                                  : Colors.white.withValues(alpha: 0.15),
                                              width: 0.8,
                                            ),
                                          ),
                                          child: Column(
                                            crossAxisAlignment:
                                                isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                                            children: [
                                              if (!isMe)
                                                Padding(
                                                  padding: const EdgeInsets.only(bottom: 2),
                                                  child: Text(
                                                    msg.name,
                                                    style: const TextStyle(
                                                      color: AppTheme.softBlossom,
                                                      fontSize: 10,
                                                      fontWeight: FontWeight.w800,
                                                    ),
                                                  ),
                                                ),
                                              Text(
                                                msg.text,
                                                style: const TextStyle(
                                                  color: Colors.white,
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w500,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),

                  // Quick Reactions Bar
                  Container(
                    height: 38,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.06),
                      border: Border(
                        top: BorderSide(
                          color: Colors.white.withValues(alpha: 0.08),
                          width: 1,
                        ),
                      ),
                    ),
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: _quickReactions.length,
                      itemBuilder: (context, idx) {
                        final reaction = _quickReactions[idx];
                        return GestureDetector(
                          onTap: () => _sendReaction(reaction),
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Center(
                              child: Text(reaction, style: const TextStyle(fontSize: 15)),
                            ),
                          ),
                        );
                      },
                    ),
                  ),

                  // Listening indicator banner
                  if (_isListening)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      color: AppTheme.electricPink.withValues(alpha: 0.3),
                      child: Row(
                        children: [
                          const Icon(Icons.mic_rounded, color: AppTheme.lightCherry, size: 14),
                          const SizedBox(width: 6),
                          const Expanded(
                            child: Text(
                              'Listening... speak now',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          GestureDetector(
                            onTap: _toggleListening,
                            child: const Text(
                              'Stop',
                              style: TextStyle(
                                color: AppTheme.lightCherry,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Input Box with Fast Speech-to-Text Button
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Row(
                      children: [
                        // Speech to Text Button
                        GestureDetector(
                          onTap: _toggleListening,
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: _isListening
                                  ? AppTheme.electricPink
                                  : Colors.white.withValues(alpha: 0.15),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: _isListening ? AppTheme.lightCherry : Colors.white24,
                              ),
                            ),
                            child: Icon(
                              _isListening ? Icons.mic_rounded : Icons.mic_none_rounded,
                              color: Colors.white,
                              size: 18,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),

                        // Text Field
                        Expanded(
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: Colors.white24, width: 0.8),
                            ),
                            child: TextField(
                              controller: _textController,
                              focusNode: _focusNode,
                              style: const TextStyle(color: Colors.white, fontSize: 13),
                              decoration: InputDecoration(
                                hintText: _isListening ? 'Speaking...' : 'Type a message...',
                                hintStyle: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.4),
                                  fontSize: 12,
                                ),
                                border: InputBorder.none,
                                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              ),
                              onSubmitted: (_) => _send(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),

                        // Send Button
                        GestureDetector(
                          onTap: _send,
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(
                              color: AppTheme.electricPink,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.send_rounded, color: Colors.white, size: 16),
                          ),
                        ),
                      ],
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
}

