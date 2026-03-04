import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/dashboard'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Business'),
          ListTile(
            title: const Text('Business name & address'),
            subtitle: const Text('Update in app or dashboard'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {},
          ),
          const Divider(),
          const Text('Billing'),
          ListTile(
            title: const Text('Billing Portal'),
            subtitle: const Text('Manage subscription and payment'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _openBillingPortal(context),
          ),
          ListTile(
            title: const Text('Subscribe / Upgrade'),
            subtitle: const Text('Starter, Pro, Business plans'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/checkout?plan=starter'),
          ),
          const Divider(),
          const Text('Integrations'),
          ListTile(
            title: const Text('Connect Google Calendar'),
            subtitle: const Text('Required for appointment booking'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _connectCalendar(context),
          ),
          const Divider(),
          const Text('Account'),
          ListTile(
            title: const Text('Sign Out'),
            trailing: const Icon(Icons.logout),
            onTap: () => Supabase.instance.client.auth.signOut(),
          ),
        ],
      ),
    );
  }

  Future<void> _openBillingPortal(BuildContext context) async {
    try {
      final res = await ApiClient.post('/api/mobile/billing-portal', body: {
        'return_scheme': 'echodesk',
      });
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final url = data['url'] as String?;
        if (url != null && await canLaunchUrl(Uri.parse(url))) {
          await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
        } else {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Could not open billing portal')),
            );
          }
        }
      } else {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final err = data['error'] as String? ?? 'Failed';
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _connectCalendar(BuildContext context) async {
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
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }
}
