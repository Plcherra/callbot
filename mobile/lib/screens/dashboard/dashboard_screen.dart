import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../models/receptionist.dart';
import '../checkout/checkout_screen.dart';
import '../receptionists/receptionists_screen.dart';
import '../settings/settings_screen.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => const SettingsScreen(),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => Supabase.instance.client.auth.signOut(),
          ),
        ],
      ),
      body: FutureBuilder<DashboardData>(
        future: _loadDashboard(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final data = snapshot.data;
          if (data == null) {
            return const Center(child: Text('No data'));
          }
          return RefreshIndicator(
            onRefresh: () async {
              // Trigger rebuild by navigating to same screen - simplified
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _ProfileCard(profile: data.profile),
                const SizedBox(height: 24),
                _ReceptionistsCard(receptionists: data.receptionists),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (context) => const ReceptionistsScreen(),
                    ),
                  ),
                  icon: const Icon(Icons.phone_in_talk),
                  label: const Text('Manage Receptionists'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<DashboardData> _loadDashboard() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) throw Exception('Not authenticated');

    final supabase = Supabase.instance.client;

    final profileRes = await supabase
        .from('users')
        .select('subscription_status, billing_plan, phone, calendar_id')
        .eq('id', user.id)
        .maybeSingle();

    final recsRes = await supabase
        .from('receptionists')
        .select('id, name, phone_number, status')
        .eq('user_id', user.id)
        .order('created_at', ascending: false)
        .limit(10);

    final receptionists = (recsRes as List)
        .map((e) => Receptionist.fromJson(e as Map<String, dynamic>))
        .toList();

    return DashboardData(
      profile: profileRes as Map<String, dynamic>? ?? {},
      receptionists: receptionists,
    );
  }
}

class DashboardData {
  final Map<String, dynamic> profile;
  final List<Receptionist> receptionists;

  DashboardData({required this.profile, required this.receptionists});
}

class _ProfileCard extends StatelessWidget {
  final Map<String, dynamic> profile;

  const _ProfileCard({required this.profile});

  @override
  Widget build(BuildContext context) {
    final status = profile['subscription_status'] as String? ?? 'inactive';
    final plan = profile['billing_plan'] as String? ?? 'None';
    final isActive = status == 'active';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isActive ? Icons.check_circle : Icons.info_outline,
                  color: isActive ? Colors.green : Colors.orange,
                  size: 24,
                ),
                const SizedBox(width: 8),
                Text(
                  'Subscription: ${isActive ? 'Active' : 'Inactive'}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('Plan: $plan'),
            if (!isActive) ...[
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (context) => const CheckoutScreen(planId: 'starter'),
                  ),
                ),
                child: const Text('Subscribe'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReceptionistsCard extends StatelessWidget {
  final List<Receptionist> receptionists;

  const _ReceptionistsCard({required this.receptionists});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Receptionists',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            if (receptionists.isEmpty)
              const Text('No receptionists yet. Create one to get started.')
            else
              ...receptionists.map(
                (r) => ListTile(
                  title: Text(r.name),
                  subtitle: Text(r.phoneNumber),
                  dense: true,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
