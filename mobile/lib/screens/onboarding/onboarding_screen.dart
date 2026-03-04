import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';
import '../receptionists/create_receptionist_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  bool get _isPhoneDevice => !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);

  bool _hasCalendar = false;
  bool _hasPhone = false;
  bool _hasReceptionist = false;
  String? _testCallNumber;
  bool _isSubscribed = false;
  String? _calendarId;
  String? _phone;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    final supabase = Supabase.instance.client;
    final profileRes = await supabase
        .from('users')
        .select('calendar_id, phone, subscription_status, onboarding_completed_at')
        .eq('id', user.id)
        .maybeSingle();

    final recsRes = await supabase
        .from('receptionists')
        .select('inbound_phone_number')
        .eq('user_id', user.id)
        .limit(1);

    setState(() {
      _calendarId = profileRes?['calendar_id'] as String?;
      _phone = profileRes?['phone'] as String?;
      _hasCalendar = (_calendarId ?? '').trim().isNotEmpty;
      _hasPhone = (_phone ?? '').trim().isNotEmpty;
      _isSubscribed = (profileRes?['subscription_status'] ?? '') == 'active';
      _hasReceptionist = (recsRes as List).isNotEmpty;
      _testCallNumber = (recsRes.isNotEmpty
              ? (recsRes.first as Map<String, dynamic>)['inbound_phone_number']
              : null)
          as String?;
      _loading = false;
    });
  }

  Future<void> _connectCalendar() async {
    try {
      final res = await ApiClient.get(
        '/api/mobile/google-auth-url',
        queryParams: {'return_to': 'mobile'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final url = data['url'] as String?;
        if (url != null && await canLaunchUrl(Uri.parse(url))) {
          await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _completeOnboarding() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;
    await Supabase.instance.client.from('users').update({
      'onboarding_completed_at': DateTime.now().toIso8601String(),
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', user.id).isFilter('onboarding_completed_at', null);
    if (mounted) context.go('/dashboard');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final currentStep = !_hasCalendar
        ? 1
        : !_hasPhone
            ? 2
            : !_hasReceptionist
                ? 3
                : 4;

    const steps = [
      ('Connect Calendar', Icons.calendar_today),
      ('Add Phone', Icons.phone),
      ('Create Receptionist', Icons.person_add),
      ('Test Call', Icons.phone_in_talk),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Finish setup'),
        actions: [
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
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Complete these steps to get the most out of your AI receptionist.',
          ),
          const SizedBox(height: 24),
          _buildStepper(steps, currentStep),
          const SizedBox(height: 24),
          if (currentStep == 1) _buildStep1(),
          if (currentStep == 2) _buildStep2(),
          if (currentStep == 3) _buildStep3(context),
          if (currentStep == 4) _buildStep4(context),
          const SizedBox(height: 24),
          TextButton(
            onPressed: _completeOnboarding,
            child: const Text("I'll do this later"),
          ),
        ],
      ),
    );
  }

  Widget _buildStepper(List<(String, IconData)> steps, int current) {
    return Row(
      children: [
        for (var i = 0; i < steps.length; i++) ...[
          CircleAvatar(
            radius: 16,
            backgroundColor: i + 1 < current
                ? Colors.green
                : i + 1 == current
                    ? Theme.of(context).colorScheme.primary
                    : Colors.grey.shade300,
            child: Text(
              i + 1 < current ? '✓' : '${i + 1}',
              style: TextStyle(
                color: i + 1 <= current ? Colors.white : Colors.grey.shade700,
                fontSize: 12,
              ),
            ),
          ),
          if (i < steps.length - 1)
            Expanded(
              child: Container(
                height: 2,
                color: i + 1 < current ? Colors.green : Colors.grey.shade300,
              ),
            ),
        ],
      ],
    );
  }

  Widget _buildStep1() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('1. Connect Google Calendar'),
            const SizedBox(height: 8),
            const Text(
              'Required for booking and availability.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            if (_hasCalendar)
              const Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green),
                  SizedBox(width: 8),
                  Text('Calendar connected'),
                ],
              )
            else
              FilledButton(
                onPressed: _connectCalendar,
                child: const Text('Connect Google Calendar'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStep2() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('2. Set your default phone'),
            const SizedBox(height: 8),
            const Text(
              'Used when creating new receptionists. Set in Settings → Integrations.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            if (_hasPhone)
              const Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green),
                  SizedBox(width: 8),
                  Text('Phone saved'),
                ],
              )
            else
              FilledButton(
                onPressed: () => context.push('/settings'),
                child: const Text('Go to Settings'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStep3(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('3. Create your first receptionist'),
            const SizedBox(height: 8),
            const Text(
              'Each receptionist gets a dedicated phone number.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            if (_hasReceptionist)
              const Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green),
                  SizedBox(width: 8),
                  Text('Receptionist created'),
                ],
              )
            else if (_isSubscribed)
              FilledButton(
                onPressed: () async {
                  final created = await context.push<bool>('/receptionists/create');
                  if (created == true) _load();
                },
                child: const Text('Create Receptionist'),
              )
            else
              Row(
                children: [
                  const Text('You need an active subscription. '),
                  TextButton(
                    onPressed: () => context.push('/dashboard'),
                    child: const Text('Upgrade first'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStep4(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('4. Test call'),
            const SizedBox(height: 8),
            const Text(
              'Call your AI receptionist to hear it in action.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            if (_testCallNumber != null && _testCallNumber!.isNotEmpty)
              Column(
                children: [
                  const Text(
                    'Your business number — give this to customers so they can call and book.',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _testCallNumber!,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  if (!_isPhoneDevice)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                        'Call this number from your phone to test the AI.',
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      if (_isPhoneDevice)
                        FilledButton.icon(
                          onPressed: () => launchUrl(
                            Uri.parse('tel:$_testCallNumber'),
                            mode: LaunchMode.externalApplication,
                          ),
                          icon: const Icon(Icons.phone),
                          label: const Text('Test call'),
                        )
                      else
                        FilledButton.icon(
                          onPressed: () {
                            Clipboard.setData(
                              ClipboardData(text: _testCallNumber ?? ''),
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Copied!')),
                            );
                          },
                          icon: const Icon(Icons.copy),
                          label: const Text('Copy'),
                        ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: _completeOnboarding,
                        child: const Text('Go to dashboard'),
                      ),
                    ],
                  ),
                ],
              )
            else if (_hasReceptionist)
              const Text(
                'Your number will appear shortly. Refresh or check Receptionists.',
              )
            else
              const Text('Create a receptionist first.'),
          ],
        ),
      ),
    );
  }
}
