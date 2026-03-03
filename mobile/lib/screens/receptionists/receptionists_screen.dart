import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../models/receptionist.dart';
import '../../services/api_client.dart';
import 'create_receptionist_screen.dart';

class ReceptionistsScreen extends StatefulWidget {
  const ReceptionistsScreen({super.key});

  @override
  State<ReceptionistsScreen> createState() => _ReceptionistsScreenState();
}

class _ReceptionistsScreenState extends State<ReceptionistsScreen> {
  List<Receptionist> _receptionists = [];
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

      final res = await Supabase.instance.client
          .from('receptionists')
          .select('id, name, phone_number, status')
          .eq('user_id', user.id)
          .order('created_at', ascending: false);

      final list = (res as List)
          .map((e) => Receptionist.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() {
        _receptionists = list;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _showOutboundCallSheet(BuildContext context, Receptionist r) {
    final controller = TextEditingController();
    showModalBottomSheet(
      context: context,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Call from ${r.name}', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone number',
                hintText: '+15551234567',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () async {
                final to = controller.text.trim();
                if (to.isEmpty) return;
                Navigator.of(ctx).pop();
                try {
                  final res = await ApiClient.post(
                    '/api/telnyx/outbound',
                    body: {'receptionist_id': r.id, 'to': to},
                  );
                  if (res.statusCode >= 200 && res.statusCode < 300) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Call initiated')),
                      );
                    }
                  } else {
                    final err = _parseError(res.body);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(err)),
                      );
                    }
                  }
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Error: $e')),
                    );
                  }
                }
              },
              icon: const Icon(Icons.phone),
              label: const Text('Place Call'),
            ),
          ],
        ),
      ),
    );
  }

  String _parseError(String body) {
    try {
      if (body.isEmpty) return 'Request failed';
      final m = jsonDecode(body) as Map<String, dynamic>?;
      if (m != null && m['error'] != null) return m['error'].toString();
    } catch (_) {}
    return body;
  }

  Future<void> _navigateToCreate() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => const CreateReceptionistScreen(),
      ),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Receptionists'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: _navigateToCreate,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : _receptionists.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text('No receptionists yet.'),
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: _navigateToCreate,
                            icon: const Icon(Icons.add),
                            label: const Text('Create Receptionist'),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _receptionists.length,
                        itemBuilder: (context, i) {
                          final r = _receptionists[i];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              title: Text(r.name),
                              subtitle: Text(r.phoneNumber),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => _showOutboundCallSheet(context, r),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
