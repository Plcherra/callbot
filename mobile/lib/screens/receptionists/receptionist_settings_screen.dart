import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../services/api_client.dart';
import '../../strings.dart';

class ReceptionistSettingsScreen extends StatefulWidget {
  final String receptionistId;

  const ReceptionistSettingsScreen({super.key, required this.receptionistId});

  @override
  State<ReceptionistSettingsScreen> createState() =>
      _ReceptionistSettingsScreenState();
}

class _ReceptionistSettingsScreenState extends State<ReceptionistSettingsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String? _receptionistName;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final res = await Supabase.instance.client
        .from('receptionists')
        .select('name')
        .eq('id', widget.receptionistId)
        .maybeSingle();
    setState(() {
      _receptionistName = res?['name'] as String?;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_receptionistName ?? 'Settings'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/receptionists/${widget.receptionistId}'),
        ),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: const [
            Tab(text: 'Staff'),
            Tab(text: 'Services'),
            Tab(text: 'Locations'),
            Tab(text: 'Promos'),
            Tab(text: 'Website'),
            Tab(text: 'Instructions'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _StaffTab(receptionistId: widget.receptionistId),
          _ServicesTab(receptionistId: widget.receptionistId),
          _LocationsTab(receptionistId: widget.receptionistId),
          _PromosTab(receptionistId: widget.receptionistId),
          _WebsiteTab(receptionistId: widget.receptionistId),
          _InstructionsTab(receptionistId: widget.receptionistId),
        ],
      ),
    );
  }
}

class _StaffTab extends StatefulWidget {
  final String receptionistId;

  const _StaffTab({required this.receptionistId});

  @override
  State<_StaffTab> createState() => _StaffTabState();
}

class _StaffTabState extends State<_StaffTab> {
  List<Map<String, dynamic>> _staff = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Supabase.instance.client
        .from('staff')
        .select('id, name, role')
        .eq('receptionist_id', widget.receptionistId)
        .order('name');
    setState(() {
      _staff = (res as List).cast<Map<String, dynamic>>();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Staff members for this receptionist.'),
        const SizedBox(height: 16),
        _AddStaffForm(
          receptionistId: widget.receptionistId,
          onAdded: _load,
        ),
        const SizedBox(height: 16),
        ..._staff.map((s) => ListTile(
              title: Text(s['name'] ?? ''),
              subtitle: Text(s['role'] ?? ''),
              trailing: IconButton(
                icon: const Icon(Icons.delete),
                onPressed: () async {
                  await Supabase.instance.client
                      .from('staff')
                      .delete()
                      .eq('id', s['id'])
                      .eq('receptionist_id', widget.receptionistId);
                  _load();
                },
              ),
            )),
      ],
    );
  }
}

class _AddStaffForm extends StatefulWidget {
  final String receptionistId;
  final VoidCallback onAdded;

  const _AddStaffForm({
    required this.receptionistId,
    required this.onAdded,
  });

  @override
  State<_AddStaffForm> createState() => _AddStaffFormState();
}

class _AddStaffFormState extends State<_AddStaffForm> {
  final _nameController = TextEditingController();
  final _roleController = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _roleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              labelText: 'Name',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: TextField(
            controller: _roleController,
            decoration: const InputDecoration(
              labelText: 'Role',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        const SizedBox(width: 8),
        FilledButton(
          onPressed: _saving
              ? null
              : () async {
                  final name = _nameController.text.trim();
                  if (name.isEmpty) return;
                  setState(() => _saving = true);
                  await Supabase.instance.client.from('staff').insert({
                    'receptionist_id': widget.receptionistId,
                    'name': name,
                    'role': _roleController.text.trim().isEmpty
                        ? null
                        : _roleController.text.trim(),
                  });
                  _nameController.clear();
                  _roleController.clear();
                  setState(() => _saving = false);
                  widget.onAdded();
                },
          child: const Text('Add'),
        ),
      ],
    );
  }
}

class _ServicesTab extends StatefulWidget {
  final String receptionistId;

  const _ServicesTab({required this.receptionistId});

  @override
  State<_ServicesTab> createState() => _ServicesTabState();
}

class _ServicesTabState extends State<_ServicesTab> {
  List<Map<String, dynamic>> _services = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Supabase.instance.client
        .from('services')
        .select('id, name, description, price_cents, duration_minutes')
        .eq('receptionist_id', widget.receptionistId)
        .order('name');
    setState(() {
      _services = (res as List).cast<Map<String, dynamic>>();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Service menu with pricing and duration.'),
        const SizedBox(height: 16),
        ..._services.map((s) => ListTile(
              title: Text(s['name'] ?? ''),
              subtitle: Text(
                '${(s['price_cents'] ?? 0) / 100} · ${s['duration_minutes'] ?? 0} min',
              ),
              trailing: IconButton(
                icon: const Icon(Icons.delete),
                onPressed: () async {
                  await Supabase.instance.client
                      .from('services')
                      .delete()
                      .eq('id', s['id'])
                      .eq('receptionist_id', widget.receptionistId);
                  _load();
                },
              ),
            )),
      ],
    );
  }
}

class _LocationsTab extends StatefulWidget {
  final String receptionistId;

  const _LocationsTab({required this.receptionistId});

  @override
  State<_LocationsTab> createState() => _LocationsTabState();
}

class _LocationsTabState extends State<_LocationsTab> {
  List<Map<String, dynamic>> _locations = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Supabase.instance.client
        .from('locations')
        .select('id, name, address')
        .eq('receptionist_id', widget.receptionistId)
        .order('name');
    setState(() {
      _locations = (res as List).cast<Map<String, dynamic>>();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Stores or branches for this receptionist.'),
        const SizedBox(height: 16),
        ..._locations.map((l) => ListTile(
              title: Text(l['name'] ?? ''),
              subtitle: Text(l['address'] ?? ''),
              trailing: IconButton(
                icon: const Icon(Icons.delete),
                onPressed: () async {
                  await Supabase.instance.client
                      .from('locations')
                      .delete()
                      .eq('id', l['id'])
                      .eq('receptionist_id', widget.receptionistId);
                  _load();
                },
              ),
            )),
      ],
    );
  }
}

class _PromosTab extends StatefulWidget {
  final String receptionistId;

  const _PromosTab({required this.receptionistId});

  @override
  State<_PromosTab> createState() => _PromosTabState();
}

class _PromosTabState extends State<_PromosTab> {
  List<Map<String, dynamic>> _promos = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Supabase.instance.client
        .from('promos')
        .select('id, description, code')
        .eq('receptionist_id', widget.receptionistId);
    setState(() {
      _promos = (res as List).cast<Map<String, dynamic>>();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Discount codes and promotions.'),
        const SizedBox(height: 16),
        ..._promos.map((p) => ListTile(
              title: Text('${p['code']} · ${p['description']}'),
              trailing: IconButton(
                icon: const Icon(Icons.delete),
                onPressed: () async {
                  await Supabase.instance.client
                      .from('promos')
                      .delete()
                      .eq('id', p['id'])
                      .eq('receptionist_id', widget.receptionistId);
                  _load();
                },
              ),
            )),
      ],
    );
  }
}

class _WebsiteTab extends StatefulWidget {
  final String receptionistId;

  const _WebsiteTab({required this.receptionistId});

  @override
  State<_WebsiteTab> createState() => _WebsiteTabState();
}

class _WebsiteTabState extends State<_WebsiteTab> {
  final _urlController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Add your website URL to pull in information your assistant can use.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _urlController,
            decoration: const InputDecoration(
              labelText: 'Website URL',
              hintText: 'https://yoursite.com',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _loading
                ? null
                : () async {
                    final url = _urlController.text.trim();
                    if (url.isEmpty) return;
                    setState(() => _loading = true);
                    try {
                      final res = await ApiClient.post(
                        '/api/mobile/receptionists/${widget.receptionistId}/website',
                        body: {'url': url},
                      );
                      if (res.statusCode >= 200 && res.statusCode < 300) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Website content saved')),
                        );
                      } else {
                        final data = jsonDecode(res.body);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(data['error'] ?? 'Failed'),
                          ),
                        );
                      }
                    } catch (_) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text(AppStrings.couldNotFetchWebsite)),
                      );
                    }
                    setState(() => _loading = false);
                  },
            child: _loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Fetch from website'),
          ),
        ],
      ),
    );
  }
}

class _InstructionsTab extends StatefulWidget {
  final String receptionistId;

  const _InstructionsTab({required this.receptionistId});

  @override
  State<_InstructionsTab> createState() => _InstructionsTabState();
}

class _InstructionsTabState extends State<_InstructionsTab> {
  final _controller = TextEditingController();
  bool _loading = true;
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await Supabase.instance.client
        .from('receptionists')
        .select('extra_instructions')
        .eq('id', widget.receptionistId)
        .maybeSingle();
    _controller.text = res?['extra_instructions'] as String? ?? '';
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Anything else the assistant should know? e.g. opening hours, cancellation policy.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            decoration: const InputDecoration(
              hintText:
                  "e.g. We're closed on Sundays. Cancellations must be 24h in advance.",
              border: OutlineInputBorder(),
              alignLabelWithHint: true,
            ),
            maxLines: 4,
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving
                ? null
                : () async {
                    setState(() => _saving = true);
                    try {
                      await Supabase.instance.client
                          .from('receptionists')
                          .update({
                            'extra_instructions': _controller.text.trim().isEmpty
                                ? null
                                : _controller.text.trim(),
                          })
                          .eq('id', widget.receptionistId);
                      await _load();
                      if (!mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Saved')),
                      );
                    } catch (_) {
                      if (!mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text(AppStrings.couldNotSaveSettings)),
                      );
                    }
                    if (!mounted) return;
                    setState(() => _saving = false);
                  },
            child: _saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Save'),
          ),
        ],
      ),
    );
  }
}
