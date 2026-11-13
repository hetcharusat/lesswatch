import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme.dart';
import '../../data/models/chat_message.dart';
import '../../data/models/user_profile.dart';

class ChatBottomSheet extends StatefulWidget {
  final List<ChatMessage> messages;
  final UserProfile currentProfile;
  final Function(String text) onSendMessage;

  const ChatBottomSheet({
    super.key,
    required this.messages,
    required this.currentProfile,
    required this.onSendMessage,
  });

  @override
  State<ChatBottomSheet> createState() => _ChatBottomSheetState();
}

class _ChatBottomSheetState extends State<ChatBottomSheet> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  final List<String> quickEmojis = ['❤️', '😂', '🥺', '🍿', '🔥', '✨', '👏', '👀'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
  }

  @override
  void didUpdateWidget(covariant ChatBottomSheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.messages.length != widget.messages.length) {
      _scrollToBottom();
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

  void _handleSend() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.lightImpact();
    widget.onSendMessage(text);
    _textController.clear();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          height: MediaQuery.of(context).size.height * 0.72,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.96),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            border: Border.all(
              color: AppTheme.softBlossom.withOpacity(0.4),
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: AppTheme.electricPink.withOpacity(0.12),
                blurRadius: 32,
                offset: const Offset(0, -8),
              ),
            ],
          ),
          child: Column(
            children: [
              // Drag handle
              Container(
                margin: const EdgeInsets.only(top: 10, bottom: 6),
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.textMuted.withOpacity(0.25),
                  borderRadius: BorderRadius.circular(9999),
                ),
              ),

              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Text('💬', style: TextStyle(fontSize: 18)),
                        SizedBox(width: 8),
                        Text(
                          'Common Room Chat',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.textMain,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: AppTheme.textSub, size: 20),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              Divider(color: AppTheme.softBlossom.withOpacity(0.2), height: 1),

              // Messages list
              Expanded(
                child: widget.messages.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.chat_bubble_outline_rounded, size: 40, color: AppTheme.softBlossom.withOpacity(0.4)),
                          const SizedBox(height: 8),
                          const Text(
                            'No messages yet. Send a whisper or reaction! 🍿',
                            style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      itemCount: widget.messages.length,
                      itemBuilder: (context, index) {
                        final msg = widget.messages[index];
                        final isMe = msg.username.toLowerCase() == widget.currentProfile.username.toLowerCase();

                        return Align(
                          alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.symmetric(vertical: 4),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                            decoration: BoxDecoration(
                              gradient: isMe
                                  ? const LinearGradient(
                                      colors: [AppTheme.electricPink, AppTheme.deepMagenta],
                                    )
                                  : null,
                              color: isMe ? null : AppTheme.pinkBackground,
                              borderRadius: BorderRadius.circular(16).copyWith(
                                bottomRight: isMe ? const Radius.circular(2) : null,
                                bottomLeft: !isMe ? const Radius.circular(2) : null,
                              ),
                              border: isMe
                                  ? null
                                  : Border.all(color: AppTheme.softBlossom.withOpacity(0.25)),
                              boxShadow: [
                                BoxShadow(
                                  color: (isMe ? AppTheme.electricPink : Colors.black).withOpacity(0.06),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ],
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
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        color: AppTheme.deepMagenta,
                                      ),
                                    ),
                                  ),
                                Text(
                                  msg.text,
                                  style: TextStyle(
                                    color: isMe ? Colors.white : AppTheme.textMain,
                                    fontSize: 14,
                                    fontWeight: isMe ? FontWeight.w600 : FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
              ),

              // Quick Emoji Row
              Container(
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: quickEmojis.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final emoji = quickEmojis[index];
                    return GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        widget.onSendMessage(emoji);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppTheme.pinkBackground,
                          borderRadius: BorderRadius.circular(9999),
                          border: Border.all(color: AppTheme.softBlossom.withOpacity(0.3)),
                        ),
                        child: Center(
                          child: Text(emoji, style: const TextStyle(fontSize: 16)),
                        ),
                      ),
                    );
                  },
                ),
              ),

              // Input form
              Padding(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  top: 8,
                  bottom: MediaQuery.of(context).viewInsets.bottom + 16,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _textController,
                        style: const TextStyle(color: AppTheme.textMain, fontSize: 14),
                        decoration: InputDecoration(
                          hintText: 'Message room...',
                          hintStyle: const TextStyle(color: AppTheme.textMuted),
                          filled: true,
                          fillColor: AppTheme.pinkBackground,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(9999),
                            borderSide: BorderSide(color: AppTheme.softBlossom.withOpacity(0.4)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(9999),
                            borderSide: BorderSide(color: AppTheme.softBlossom.withOpacity(0.3)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(9999),
                            borderSide: const BorderSide(color: AppTheme.electricPink, width: 1.5),
                          ),
                        ),
                        onSubmitted: (_) => _handleSend(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [AppTheme.electricPink, AppTheme.deepMagenta],
                        ),
                      ),
                      child: IconButton(
                        icon: const Icon(Icons.send_rounded, color: Colors.white, size: 18),
                        onPressed: _handleSend,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
