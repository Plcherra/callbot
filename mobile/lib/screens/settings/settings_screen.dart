import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            title: const Text('Billing Portal'),
            subtitle: const Text('Manage subscription and payment'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _openBillingPortal(context),
          ),
          const Divider(),
          ListTile(
            title: const Text('Connect Google Calendar'),
            subtitle: const Text('Required for appointment booking'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _connectCalendar(context),
          ),
          const Divider(),
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
      final res = await ApiClient.post('/api/mobile/billing-portal');
      if (res.statusCode == 200) {
        final data = _parseJson(res.body);
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
        final data = _parseJson(res.body);
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
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) return;

      final res = await ApiClient.get(
        '/api/mobile/google-auth-url',
        queryParams: {'return_to': 'mobile'},
        withAuth: true,
      );

      if (res.statusCode == 200) {
        final data = _parseJson(res.body);
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

  Map<String, dynamic> _parseJson(String body) {
    try {
      return body.isNotEmpty
          ? jsonDecode(body) as Map<String, dynamic>
          : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }
}
