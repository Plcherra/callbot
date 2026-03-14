import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_client.dart';
import '../../strings.dart';
import '../../widgets/constrained_scaffold_body.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _loadingBilling = false;
  bool _loadingCalendar = false;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/dashboard'),
        ),
      ),
      body: constrainedScaffoldBody(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
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
            trailing: _loadingBilling
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.chevron_right),
            onTap: _loadingBilling ? null : () => _openBillingPortal(context),
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
            trailing: _loadingCalendar
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.chevron_right),
            onTap: _loadingCalendar ? null : () => _connectCalendar(context),
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
      ),
    ),
        if (_loadingBilling || _loadingCalendar)
          Container(
            color: Colors.black26,
            child: const Center(child: CircularProgressIndicator()),
          ),
      ],
    );
  }

  Future<void> _openBillingPortal(BuildContext context) async {
    if (_loadingBilling) return;
    setState(() => _loadingBilling = true);
    try {
      final res = await ApiClient.post('/api/mobile/billing-portal', body: {
        'return_scheme': 'echodesk',
      });
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final url = data['url'] as String?;
        if (url != null && await canLaunchUrl(Uri.parse(url))) {
          await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Opening billing portal...')),
            );
          }
        } else {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text(AppStrings.couldNotOpenBilling)),
            );
          }
        }
      } else {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final err = data['error'] as String? ?? AppStrings.billingError;
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
        }
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.couldNotOpenBilling)),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingBilling = false);
    }
  }

  Future<void> _connectCalendar(BuildContext context) async {
    if (_loadingCalendar) return;
    setState(() => _loadingCalendar = true);
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
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.couldNotConnectCalendar)),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingCalendar = false);
    }
  }
}
