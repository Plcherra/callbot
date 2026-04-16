import 'dart:convert';

import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../widgets/constrained_scaffold_body.dart';

/// Voice / SMS / WhatsApp onboarding: business-owned line first; assistant context is secondary.
class CommunicationSetupScreen extends StatefulWidget {
  const CommunicationSetupScreen({super.key});

  @override
  State<CommunicationSetupScreen> createState() => _CommunicationSetupScreenState();
}

class _CommunicationSetupScreenState extends State<CommunicationSetupScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _setup;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.get('/api/mobile/communication/setup');
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        setState(() {
          _error = body['error']?.toString() ?? 'Could not load setup';
          _setup = null;
          _loading = false;
        });
        return;
      }
      setState(() {
        _setup = body;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _setup = null;
        _loading = false;
      });
    }
  }

  Future<void> _post(String path) async {
    try {
      final res = await ApiClient.post(path, body: const {});
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(body['error']?.toString() ?? 'Request failed')),
        );
        return;
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  String _s(Map<String, dynamic>? m, String key) => m?[key]?.toString().trim() ?? '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Communication setup'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: constrainedScaffoldBody(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error!, textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          FilledButton(onPressed: _load, child: const Text('Retry')),
                        ],
                      ),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                    children: [
                      if (_setup != null) _businessHeader(context, _setup!),
                      const SizedBox(height: 16),
                      if (_setup != null) _nextStepBanner(context, _setup!),
                      const SizedBox(height: 12),
                      _channelCard(
                        context,
                        title: 'Voice (business line)',
                        badge: _setup?['voice_status']?.toString() ?? '—',
                        description:
                            'Calls to this number reach your EchoDesk assistant. This line belongs to your business.',
                        detail: _setup?['phone_number_e164']?.toString(),
                        actions: const [],
                      ),
                      const SizedBox(height: 12),
                      _channelCard(
                        context,
                        title: _s(_setup, 'sms_setup_title').isEmpty ? 'SMS' : _s(_setup, 'sms_setup_title'),
                        badge: _setup?['sms_status']?.toString() ?? '—',
                        description: _s(_setup, 'sms_setup_description'),
                        detail: _s(_setup, 'sms_failure_reason'),
                        help: _s(_setup, 'sms_help_text'),
                        actions: _smsActions(_setup),
                      ),
                      const SizedBox(height: 12),
                      _channelCard(
                        context,
                        title: _s(_setup, 'whatsapp_setup_title').isEmpty
                            ? 'WhatsApp'
                            : _s(_setup, 'whatsapp_setup_title'),
                        badge: _setup?['whatsapp_status']?.toString() ?? '—',
                        description: _s(_setup, 'whatsapp_setup_description'),
                        detail: _s(_setup, 'whatsapp_failure_reason'),
                        help: _s(_setup, 'whatsapp_help_text'),
                        actions: _waActions(_setup),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
      ),
    );
  }

  Widget _businessHeader(BuildContext context, Map<String, dynamic> s) {
    final name = s['business_name']?.toString();
    final isDefault = s['is_default_business'] == true;
    final assistant = s['primary_receptionist_name']?.toString();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.business, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    (name != null && name.isNotEmpty) ? name : 'Your business',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                if (isDefault)
                  Text(
                    'Default',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Theme.of(context).colorScheme.secondary,
                        ),
                  ),
              ],
            ),
            if (assistant != null && assistant.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Primary assistant: $assistant',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 4),
            Text(
              'One number for voice, SMS, and WhatsApp where enabled.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }

  Widget _nextStepBanner(BuildContext context, Map<String, dynamic> s) {
    final next = s['next_recommended_action']?.toString() ?? '';
    if (next.isEmpty || next == 'none') return const SizedBox.shrink();
    String msg;
    switch (next) {
      case 'activate_sms':
        msg = 'Next: activate SMS for this number.';
        break;
      case 'submit_sms':
        msg = 'Next: submit SMS registration for review.';
        break;
      case 'retry_sms':
        msg = 'Next: fix SMS registration.';
        break;
      case 'connect_whatsapp':
        msg = 'Next: connect WhatsApp.';
        break;
      case 'continue_whatsapp':
        msg = 'Next: continue WhatsApp setup.';
        break;
      case 'retry_whatsapp':
        msg = 'Next: retry WhatsApp connection.';
        break;
      default:
        msg = 'Next: $next';
    }
    return Text(
      msg,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Theme.of(context).colorScheme.primary,
          ),
    );
  }

  List<Widget> _smsActions(Map<String, dynamic>? s) {
    if (s == null) return [];
    final st = s['sms_status']?.toString() ?? '';
    final labelActivate = _s(s, 'sms_primary_action').isEmpty ? 'Activate SMS' : _s(s, 'sms_primary_action');
    final out = <Widget>[];
    if (st == 'not_started') {
      out.add(
        FilledButton(
          onPressed: () => _post('/api/mobile/communication/sms/activate'),
          child: Text(labelActivate),
        ),
      );
    } else if (st == 'needs_submission') {
      out.add(
        FilledButton(
          onPressed: () => _post('/api/mobile/communication/sms/submit'),
          child: Text(labelActivate.isEmpty ? 'Submit for review' : labelActivate),
        ),
      );
    } else if (st == 'failed') {
      out.add(
        FilledButton(
          onPressed: () => _post('/api/mobile/communication/sms/retry'),
          child: const Text('Retry SMS setup'),
        ),
      );
    }
    return out;
  }

  List<Widget> _waActions(Map<String, dynamic>? s) {
    if (s == null) return [];
    final st = s['whatsapp_status']?.toString() ?? '';
    final labelConnect =
        _s(s, 'whatsapp_primary_action').isEmpty ? 'Connect WhatsApp' : _s(s, 'whatsapp_primary_action');
    final out = <Widget>[];
    if (st == 'not_connected') {
      out.add(
        FilledButton(
          onPressed: () => _post('/api/mobile/communication/whatsapp/connect'),
          child: Text(labelConnect),
        ),
      );
    } else if (st == 'needs_connection') {
      out.add(
        FilledButton(
          onPressed: () => _post('/api/mobile/communication/whatsapp/continue'),
          child: Text(labelConnect.isEmpty ? 'Continue setup' : labelConnect),
        ),
      );
    } else if (st == 'failed') {
      out.add(
        FilledButton(
          onPressed: () => _post('/api/mobile/communication/whatsapp/retry'),
          child: const Text('Retry connection'),
        ),
      );
    }
    return out;
  }

  Widget _channelCard(
    BuildContext context, {
    required String title,
    required String badge,
    required String description,
    String? detail,
    String? help,
    required List<Widget> actions,
  }) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(badge, style: Theme.of(context).textTheme.labelSmall),
                ),
              ],
            ),
            if (description.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(description, style: Theme.of(context).textTheme.bodyMedium),
            ],
            if (detail != null && detail.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(detail, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.error)),
            ],
            if (help != null && help.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(help, style: Theme.of(context).textTheme.bodySmall),
            ],
            if (actions.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: actions),
            ],
          ],
        ),
      ),
    );
  }
}
