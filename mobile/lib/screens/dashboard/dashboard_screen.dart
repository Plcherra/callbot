import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../models/receptionist.dart';
import '../../models/user_profile.dart';
import '../../services/api_client.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _profile;
  List<Receptionist> _receptionists = [];
  int _totalReceptionists = 0;
  int _activeReceptionists = 0;
  int _totalUsageMinutes = 0;
  int? _includedMinutes;
  int _overageMinutes = 0;
  int _totalCalls = 0;
  double _totalCallMinutes = 0.0;
  List<Map<String, dynamic>> _recentCalls = [];
  int? _remainingMinutes;
  bool _isPayg = false;
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

      final profileRes = await supabase
          .from('users')
          .select(
              'subscription_status, billing_plan, billing_plan_metadata, phone, '
              'calendar_id, onboarding_completed_at')
          .eq('id', user.id)
          .maybeSingle();

      final isActive = (profileRes?['subscription_status'] ?? '') == 'active';

      List<Receptionist> recs = [];
      int total = 0, active = 0;
      if (isActive) {
        final recsRes = await supabase
            .from('receptionists')
            .select('id, name, phone_number, inbound_phone_number, status')
            .eq('user_id', user.id)
            .order('created_at', ascending: false);

        recs = (recsRes as List)
            .map((e) => Receptionist.fromJson(e as Map<String, dynamic>))
            .toList();

        final countRes = await supabase
            .from('receptionists')
            .select('id')
            .eq('user_id', user.id);
        total = (countRes as List).length;
        active = recs.where((r) => r.status == 'active').length;
      }

      // Usage: query usage_snapshots for current period (same logic as web dashboard)
      int usageMin = 0, overage = 0;
      int? included;
      int? remaining;
      final meta = profileRes?['billing_plan_metadata'] as Map<String, dynamic>?;
      final billingPlan = profileRes?['billing_plan'] as String?;
      final isPayg = billingPlan == 'subscription_payg';
      if (meta != null && meta['included_minutes'] != null) {
        included = meta['included_minutes'] as int;
      }

      if (isActive) {
        final now = DateTime.now().toUtc();
        final periodStart =
            '${now.year}-${(now.month).toString().padLeft(2, '0')}-01';
        final usageRes = await supabase
            .from('usage_snapshots')
            .select('total_seconds, overage_minutes')
            .eq('user_id', user.id)
            .eq('period_start', periodStart);

        final rows = usageRes is List ? usageRes : ((usageRes as dynamic).data as List?) ?? [];
        int totalSeconds = 0;
        for (final r in rows) {
          final row = r as Map<String, dynamic>;
          totalSeconds += (row['total_seconds'] as int?) ?? 0;
          overage += (row['overage_minutes'] as int?) ?? 0;
        }
        usageMin = (totalSeconds / 60).ceil();
        if (included != null && !isPayg) {
          remaining = (included - usageMin).clamp(0, included);
        }
      }

      int totalCalls = 0;
      double totalCallMinutes = 0.0;
      List<Map<String, dynamic>> recentCalls = [];
      try {
        final summaryRes = await ApiClient.get('/api/mobile/dashboard-summary');
        if (summaryRes.statusCode >= 200 && summaryRes.statusCode < 300 && summaryRes.body.isNotEmpty) {
          final decoded = jsonDecode(summaryRes.body) as Map<String, dynamic>?;
          totalCalls = decoded?['total_calls'] as int? ?? 0;
          totalCallMinutes = (decoded?['total_minutes'] as num?)?.toDouble() ?? 0.0;
          recentCalls = List<Map<String, dynamic>>.from((decoded?['recent_calls'] as List?) ?? []);
        }
      } catch (_) {}

      setState(() {
        _profile = Map<String, dynamic>.from(profileRes ?? {});
        _receptionists = recs.take(6).toList();
        _totalReceptionists = total;
        _activeReceptionists = active;
        _totalUsageMinutes = usageMin;
        _includedMinutes = included;
        _overageMinutes = overage;
        _remainingMinutes = remaining;
        _isPayg = isPayg;
        _totalCalls = totalCalls;
        _totalCallMinutes = totalCallMinutes;
        _recentCalls = recentCalls;
        _loading = false;
      });
      if (!_loading && _error == null) {
        _maybeShowWelcomeOverlay();
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  static const _kWelcomeSeenKey = 'dashboard_welcome_seen';

  Future<void> _maybeShowWelcomeOverlay() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_kWelcomeSeenKey) == true) return;
      if (!mounted) return;
      _showWelcomeDialog(prefs);
    } catch (_) {}
  }

  void _showWelcomeDialog(SharedPreferences prefs) {
    if (!mounted) return;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Welcome to Echodesk'),
        content: const Text(
          'Create your first receptionist to get a dedicated phone number. '
          'Your AI will answer calls and book appointments into your calendar.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              prefs.setBool(_kWelcomeSeenKey, true);
              Navigator.of(ctx).pop();
            },
            child: const Text('Got it'),
          ),
          FilledButton(
            onPressed: () {
              prefs.setBool(_kWelcomeSeenKey, true);
              Navigator.of(ctx).pop();
              if (mounted) context.push('/receptionists/create');
            },
            child: const Text('Create receptionist'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Dashboard')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Dashboard')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.error_outline, size: 48, color: Colors.red.shade400),
                const SizedBox(height: 16),
                Text(
                  'Something went wrong',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final profile = UserProfile.fromJson(_profile ?? {});
    final isActive = profile.isActive;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.help_outline),
            onPressed: () => context.push('/help'),
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => context.push('/settings'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => Supabase.instance.client.auth.signOut(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (!profile.onboardingComplete && isActive)
              _buildOnboardingAlert(context),
            if (!isActive) ...[
              _buildUpgradeCard(context),
            ] else ...[
              _buildStatsGrid(profile),
              const SizedBox(height: 24),
              if (_recentCalls.isNotEmpty) ...[
                _buildRecentCalls(context),
                const SizedBox(height: 24),
              ],
              _buildRecentReceptionists(context),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildOnboardingAlert(BuildContext context) {
    return Card(
      color: Colors.blue.shade50,
      child: ListTile(
        title: const Text('Finish setup'),
        subtitle: const Text(
          'Connect calendar, add phone, and create your first receptionist.',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/onboarding'),
      ),
    );
  }

  Widget _buildUpgradeCard(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Upgrade to Pro',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            const Text(
              'Connect calendar to start. Upgrade for your AI assistant.',
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => context.push('/checkout?plan=starter'),
              child: const Text('Subscribe'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsGrid(UserProfile profile) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Overview',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const Spacer(),
            if (profile.isActive)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.green.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Active',
                  style: TextStyle(
                    color: Colors.green.shade800,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _StatCard(
              label: 'Total Calls',
              value: '$_totalCalls',
            ),
            _StatCard(
              label: 'Total Minutes',
              value: _totalCallMinutes.toStringAsFixed(1),
            ),
            _StatCard(
              label: 'Total Receptionists',
              value: '$_totalReceptionists',
            ),
            _StatCard(
              label: 'Active Receptionists',
              value: '$_activeReceptionists',
            ),
            _StatCard(
              label: 'Calendar',
              value: profile.hasCalendar ? 'Connected' : 'Not connected',
            ),
            _StatCard(
              label: 'Default phone',
              value: profile.hasPhone ? (profile.phone ?? '') : 'Not set',
            ),
            _StatCard(
              label: 'Minutes this period',
              value: _includedMinutes != null
                  ? '$_totalUsageMinutes / $_includedMinutes'
                  : '$_totalUsageMinutes',
              remainingSubtext: _remainingMinutes != null && _remainingMinutes! > 0
                  ? '$_remainingMinutes min remaining'
                  : null,
              overageSubtext:
                  _overageMinutes > 0 ? '$_overageMinutes overage' : null,
              overageWarning: _includedMinutes != null &&
                  _totalUsageMinutes >= _includedMinutes! &&
                  _totalUsageMinutes > 0,
              lowMinutesWarning: _remainingMinutes != null &&
                  _remainingMinutes! > 0 &&
                  _remainingMinutes! <= 30,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildRecentCalls(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Recent Calls',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        ..._recentCalls.take(5).map((call) {
          final start = call['started_at'] != null
              ? DateTime.tryParse(call['started_at'] as String)
              : null;
          final dur = call['duration_seconds'] as int?;
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              title: Text(
                call['from_number'] as String? ?? call['to_number'] as String? ?? 'Unknown',
              ),
              subtitle: Text(
                [
                  if (start != null) start.toIso8601String().substring(0, 16),
                  if (dur != null) '${dur}s',
                ].join(' · '),
              ),
              trailing: const Icon(Icons.phone),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildRecentReceptionists(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Recent Receptionists',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        if (_receptionists.isEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Text('No receptionists yet. '),
                TextButton(
                  onPressed: () => context.push('/receptionists'),
                  child: const Text('Add one'),
                ),
              ],
            ),
          )
        else
          ..._receptionists.map((r) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text(r.name),
                  subtitle: Text(r.displayPhone),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/receptionists/${r.id}'),
                ),
              )),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String? remainingSubtext;
  final String? overageSubtext;
  final bool overageWarning;
  final bool lowMinutesWarning;

  const _StatCard({
    required this.label,
    required this.value,
    this.remainingSubtext,
    this.overageSubtext,
    this.overageWarning = false,
    this.lowMinutesWarning = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 4),
              Text(
                value,
                style: Theme.of(context).textTheme.titleMedium,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (overageSubtext != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    overageSubtext!,
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.amber.shade700,
                    ),
                  ),
                )
              else if (overageWarning)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Over cap; overage may be billed at \$0.25/min.',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.amber.shade700,
                    ),
                  ),
                )
              else if (remainingSubtext != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    remainingSubtext!,
                    style: TextStyle(
                      fontSize: 11,
                      color: lowMinutesWarning
                          ? Colors.orange.shade700
                          : Colors.green.shade700,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
