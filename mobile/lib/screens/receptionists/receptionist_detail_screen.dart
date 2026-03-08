import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/receptionist.dart';
import '../../strings.dart';
import '../../services/api_client.dart';

class ReceptionistDetailScreen extends StatefulWidget {
  final String receptionistId;

  const ReceptionistDetailScreen({super.key, required this.receptionistId});

  @override
  State<ReceptionistDetailScreen> createState() =>
      _ReceptionistDetailScreenState();
}

class _ReceptionistDetailScreenState extends State<ReceptionistDetailScreen> {
  bool get _isPhoneDevice => !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);

  Receptionist? _receptionist;
  List<Map<String, dynamic>> _callHistory = [];
  bool _loading = true;
  String? _error;

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
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) throw Exception('Not authenticated');

      final supabase = Supabase.instance.client;

      final recRes = await supabase
          .from('receptionists')
          .select(
              'id, name, phone_number, inbound_phone_number, calendar_id, status')
          .eq('id', widget.receptionistId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (recRes == null) {
        setState(() {
          _error = 'Not found';
          _loading = false;
        });
        return;
      }

      final historyRes = await supabase
          .from('call_usage')
          .select('id, started_at, ended_at, duration_seconds, transcript')
          .eq('receptionist_id', widget.receptionistId)
          .order('started_at', ascending: false)
          .limit(20);

      setState(() {
        _receptionist = Receptionist.fromJson(recRes as Map<String, dynamic>);
        _callHistory = (historyRes as List)
            .map((e) => e as Map<String, dynamic>)
            .toList();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/receptionists'),
          ),
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_receptionist == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Receptionist not found')),
      );
    }

    final r = _receptionist!;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/receptionists'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () =>
                context.push('/receptionists/${r.id}/settings'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    r.name,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: r.status == 'active'
                        ? Colors.green.shade100
                        : Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    r.status ?? 'active',
                    style: TextStyle(
                      color: r.status == 'active'
                          ? Colors.green.shade800
                          : Colors.grey.shade700,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Your business number — give this to customers so they can call and book.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 8),
            SelectableText(
              r.displayPhone,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 24),
            if (_isPhoneDevice)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.phone),
                  title: const Text('Test call'),
                  subtitle: const Text(
                    'Opens your phone dialer to call the AI.',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => launchUrl(
                    Uri.parse('tel:${r.displayPhone}'),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
              )
            else
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Call this number from your phone to test the AI.',
                        style: TextStyle(fontSize: 14),
                      ),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: () {
                          Clipboard.setData(
                            ClipboardData(text: r.displayPhone),
                          );
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Copied!')),
                          );
                        },
                        icon: const Icon(Icons.copy),
                        label: const Text('Copy'),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Overview',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    _OverviewRow('Your business number', r.displayPhone),
                    if (r.calendarId != null)
                      _OverviewRow('Calendar', r.calendarId!),
                    _OverviewRow('Voice', 'Connected'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Call history',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (_callHistory.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Icon(Icons.phone_missed_outlined, size: 48, color: Colors.grey.shade400),
                      const SizedBox(height: 12),
                      Text(
                        'No calls yet',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        "When customers call your AI receptionist, they'll appear here.",
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              )
            else
              ..._callHistory.map((call) {
                final start = call['started_at'] != null
                    ? DateTime.tryParse(call['started_at'] as String)
                    : null;
                final dur = call['duration_seconds'] as int?;
                final transcript = call['transcript'] as String?;
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ExpansionTile(
                    title: Text(
                      start != null
                          ? '${start.toLocal()}'
                          : 'Unknown',
                      style: const TextStyle(fontSize: 12),
                    ),
                    subtitle: dur != null
                        ? Text(
                            '${dur ~/ 60}m ${dur % 60}s',
                            style: const TextStyle(fontSize: 12),
                          )
                        : null,
                    children: [
                      if (transcript != null && transcript.trim().isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(
                            transcript,
                            style: const TextStyle(fontSize: 12),
                            maxLines: 5,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                  ),
                );
              }),
            const SizedBox(height: 24),
            Row(
              children: [
                FilledButton(
                  onPressed: () =>
                      context.push('/receptionists/${r.id}/settings'),
                  child: const Text('Manage settings'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => _showDeleteConfirm(context, r),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.error,
                  ),
                  child: const Text('Delete'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showDeleteConfirm(BuildContext context, Receptionist r) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete receptionist?'),
        content: Text(
          'This will delete "${r.name}" and its phone number. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              try {
                await ApiClient.post(
                  '/api/mobile/receptionists/${r.id}/delete',
                );
                if (context.mounted) context.go('/receptionists');
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text(AppStrings.couldNotDeleteReceptionist)),
                  );
                }
              }
            },
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

class _OverviewRow extends StatelessWidget {
  final String label;
  final String value;

  const _OverviewRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
