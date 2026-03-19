import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../services/api_client.dart';
import '../../../strings.dart';

class ReceptionistInstructionsTab extends StatefulWidget {
  final String receptionistId;

  const ReceptionistInstructionsTab({super.key, required this.receptionistId});

  @override
  State<ReceptionistInstructionsTab> createState() =>
      _ReceptionistInstructionsTabState();
}

class _ReceptionistInstructionsTabState
    extends State<ReceptionistInstructionsTab> {
  final _coreInstructionsController = TextEditingController();
  final _greetingController = TextEditingController();
  final _extraNotesController = TextEditingController();
  final _genericFollowupController = TextEditingController();
  final AudioPlayer _previewPlayer = AudioPlayer();
  bool _loading = true;
  bool _saving = false;
  String? _voicePresetKey;
  List<Map<String, dynamic>> _voicePresets = [];
  bool _voicePresetsLoading = false;
  String? _previewPlayingKey;

  @override
  void dispose() {
    _coreInstructionsController.dispose();
    _greetingController.dispose();
    _extraNotesController.dispose();
    _genericFollowupController.dispose();
    _previewPlayer.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _loadVoicePresets() async {
    if (_voicePresets.isNotEmpty) return;
    setState(() => _voicePresetsLoading = true);
    try {
      final res = await ApiClient.get('/api/mobile/voice-presets');
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final data = jsonDecode(res.body) as Map<String, dynamic>?;
        final list = data?['presets'] as List<dynamic>?;
        if (mounted) {
          setState(() {
            _voicePresets = list?.cast<Map<String, dynamic>>() ?? [];
            _voicePresetsLoading = false;
          });
        }
      } else {
        if (mounted) setState(() => _voicePresetsLoading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _voicePresetsLoading = false);
    }
  }

  Future<void> _playPresetPreview(String key) async {
    if (_previewPlayingKey == key) {
      await _previewPlayer.stop();
      setState(() => _previewPlayingKey = null);
      return;
    }
    setState(() => _previewPlayingKey = key);
    try {
      final path = '/api/mobile/voice-presets/$key/preview';
      final res = await ApiClient.get(path);
      if (res.statusCode == 200 && res.bodyBytes.isNotEmpty) {
        await _previewPlayer.stop();
        await _previewPlayer
            .setSource(BytesSource(res.bodyBytes, mimeType: 'audio/mpeg'));
        await _previewPlayer.resume();
        _previewPlayer.onPlayerComplete.listen((_) {
          if (mounted) setState(() => _previewPlayingKey = null);
        });
      } else {
        if (mounted) setState(() => _previewPlayingKey = null);
      }
    } catch (_) {
      if (mounted) setState(() => _previewPlayingKey = null);
    }
  }

  Future<void> _showVoicePicker() async {
    await _loadVoicePresets();
    if (!mounted) return;
    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final presets = _voicePresets;
            final loading = _voicePresetsLoading;
            return DraggableScrollableSheet(
              initialChildSize: 0.6,
              maxChildSize: 0.9,
              expand: false,
              builder: (_, scrollController) => Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Choose a voice',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'How your receptionist sounds.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    if (loading)
                      const Center(child: CircularProgressIndicator())
                    else
                      Expanded(
                        child: ListView.builder(
                          controller: scrollController,
                          itemCount: presets.length,
                          itemBuilder: (_, i) {
                            final p = presets[i];
                            final key = p['key'] as String? ?? '';
                            final label = p['label'] as String? ?? key;
                            final description =
                                p['description'] as String? ?? '';
                            final selected = _voicePresetKey == key;
                            final playing = _previewPlayingKey == key;
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              color: selected
                                  ? Theme.of(context)
                                      .colorScheme
                                      .primaryContainer
                                  : null,
                              child: ListTile(
                                title: Text(label),
                                subtitle:
                                    description.isNotEmpty ? Text(description) : null,
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: Icon(
                                        playing
                                            ? Icons.stop
                                            : Icons.play_circle_outline,
                                      ),
                                      onPressed: () => _playPresetPreview(key),
                                    ),
                                    if (selected)
                                      const Icon(Icons.check_circle,
                                          color: Colors.green),
                                  ],
                                ),
                                onTap: () {
                                  setState(() => _voicePresetKey = key);
                                  setModalState(() {});
                                },
                              ),
                            );
                          },
                        ),
                      ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Done'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    ).then((saved) {
      if (saved == true && _voicePresetKey != null) _save();
    });
  }

  Future<void> _load() async {
    final res = await Supabase.instance.client
        .from('receptionists')
        .select(
            'system_prompt, greeting, voice_id, voice_preset_key, extra_instructions, generic_followup_message_template')
        .eq('id', widget.receptionistId)
        .maybeSingle();
    if (res != null) {
      _coreInstructionsController.text = res['system_prompt'] as String? ?? '';
      _greetingController.text = res['greeting'] as String? ?? '';
      _voicePresetKey = res['voice_preset_key'] as String?;
      final voiceId = res['voice_id'] as String?;
      _extraNotesController.text =
          res['extra_instructions'] as String? ?? '';
      _genericFollowupController.text =
          res['generic_followup_message_template'] as String? ?? '';

      // Legacy compatibility: some older records may not have voice_preset_key populated.
      // Ask backend (source of truth) to infer key from stored voice_id when possible.
      if ((_voicePresetKey == null || _voicePresetKey!.trim().isEmpty) &&
          voiceId != null &&
          voiceId.trim().isNotEmpty) {
        try {
          final r = await ApiClient.get(
              '/api/mobile/receptionists/${widget.receptionistId}');
          if (r.statusCode >= 200 && r.statusCode < 300) {
            final data = jsonDecode(r.body) as Map<String, dynamic>?;
            final inferred = data?['voice_preset_key'] as String?;
            if (inferred != null && inferred.trim().isNotEmpty) {
              _voicePresetKey = inferred.trim();
            }
          }
        } catch (_) {
          // Best-effort only; keep null and let UI default gracefully.
        }
      }
    }
    if (!mounted) return;
    setState(() => _loading = false);
    _loadVoicePresets();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final ctx = context;
    try {
      final body = <String, dynamic>{
        'system_prompt': _coreInstructionsController.text.trim().isEmpty
            ? null
            : _coreInstructionsController.text.trim(),
        'greeting': _greetingController.text.trim().isEmpty
            ? null
            : _greetingController.text.trim(),
        'extra_instructions': _extraNotesController.text.trim().isEmpty
            ? null
            : _extraNotesController.text.trim(),
        'generic_followup_message_template': _genericFollowupController.text
                .trim()
                .isEmpty
            ? null
            : _genericFollowupController.text.trim(),
      };
      if (_voicePresetKey != null) body['voice_preset_key'] = _voicePresetKey;
      final res = await ApiClient.patch(
        '/api/mobile/receptionists/${widget.receptionistId}',
        body: body,
      );
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await _load();
        if (!ctx.mounted) return;
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('Saved')),
        );
      } else {
        final data = jsonDecode(res.body) as Map<String, dynamic>?;
        if (!ctx.mounted) return;
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(
              content: Text(data?['error'] as String? ??
                  AppStrings.couldNotSaveSettings)),
        );
      }
    } catch (_) {
      if (!ctx.mounted) return;
      ScaffoldMessenger.of(ctx).showSnackBar(
        const SnackBar(content: Text(AppStrings.couldNotSaveSettings)),
      );
    }
    if (!mounted) return;
    setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Core instructions — main system prompt for the AI.'),
        const SizedBox(height: 8),
        TextField(
          controller: _coreInstructionsController,
          decoration: const InputDecoration(
            hintText: "Leave blank to use generated prompt from business data",
            border: OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          maxLines: 6,
        ),
        const SizedBox(height: 16),
        const Text('Greeting — first thing the AI says when a call is answered.'),
        const SizedBox(height: 8),
        TextField(
          controller: _greetingController,
          decoration: const InputDecoration(
            hintText:
                "e.g. Hello! Thanks for calling. I'm Eve. How can I help you today?",
            border: OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          maxLines: 2,
        ),
        const SizedBox(height: 16),
        const Text('Voice — how your receptionist sounds.'),
        const SizedBox(height: 8),
        ListTile(
          title: Text(
            () {
              final found = _voicePresets
                  .where((p) => p['key'] == _voicePresetKey);
              return found.isEmpty
                  ? (_voicePresetKey ?? 'Default')
                  : (found.first['label'] as String? ?? 'Default');
            }(),
          ),
          subtitle: const Text('Name and voice are separate choices.'),
          trailing: FilledButton.tonal(
            onPressed: _showVoicePicker,
            child: const Text('Change voice'),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
            'Extra notes — additional instructions appended to the main prompt.'),
        const SizedBox(height: 8),
        TextField(
          controller: _extraNotesController,
          decoration: const InputDecoration(
            hintText:
                "e.g. We're closed on Sundays. Cancellations must be 24h in advance.",
            border: OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          maxLines: 4,
        ),
        const SizedBox(height: 16),
        const Text(
          'Generic booking follow-up message (no services) — spoken after booking when no service is selected.',
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _genericFollowupController,
          decoration: const InputDecoration(
            hintText:
                'e.g. Your appointment is under review and we will text you the details shortly.',
            border: OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          maxLines: 3,
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Save'),
        ),
      ],
    );
  }
}

