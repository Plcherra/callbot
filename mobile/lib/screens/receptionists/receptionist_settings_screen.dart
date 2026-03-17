import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../services/api_client.dart';
import '../../strings.dart';
import '../../widgets/constrained_scaffold_body.dart';
import 'settings_tabs/calendar_tab.dart';
import 'settings_tabs/staff_tab.dart';
import 'settings_tabs/instructions_tab.dart';
import 'settings_tabs/website_tab.dart';

class ReceptionistSettingsScreen extends StatefulWidget {
  final String receptionistId;

  const ReceptionistSettingsScreen({super.key, required this.receptionistId});

  @override
  State<ReceptionistSettingsScreen> createState() =>
      _ReceptionistSettingsScreenState();
}

class _ReceptionistSettingsScreenState extends State<ReceptionistSettingsScreen>
    with TickerProviderStateMixin {
  late TabController _tabController;
  String? _receptionistName;
  String _mode = 'personal';
  Map<String, dynamic>? _calendarStatus;
  bool _loadingCalendarStatus = false;
  bool _loading = true;
  List<Tab> _tabs = const [];
  int _loadSeq = 0;
  int _calendarStatusLoadSeq = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 0, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final int seq = ++_loadSeq;
    final res = await Supabase.instance.client
        .from('receptionists')
        .select('name, mode')
        .eq('id', widget.receptionistId)
        .maybeSingle();
    _receptionistName = res?['name'] as String?;
    _mode = (res?['mode'] as String?) ?? 'personal';

    // Exact tab order per spec:
    // Personal/Solo: Calendar, Services, Website, Instructions
    // Business/Team: Calendar, Staff, Services, Locations, Promos, Website, Instructions
    final List<Tab> tabs;
    if (_mode == 'business') {
      tabs = const [
        Tab(text: 'Calendar'),
        Tab(text: 'Staff'),
        Tab(text: 'Services'),
        Tab(text: 'Locations'),
        Tab(text: 'Promos'),
        Tab(text: 'Website'),
        Tab(text: 'Instructions'),
      ];
    } else {
      tabs = const [
        Tab(text: 'Calendar'),
        Tab(text: 'Services'),
        Tab(text: 'Website'),
        Tab(text: 'Instructions'),
      ];
    }

    if (!mounted || seq != _loadSeq) return;

    TabController? nextController;
    TabController? oldController;
    if (_tabController.length != tabs.length) {
      final nextIndex = _tabController.index.clamp(0, (tabs.length - 1).clamp(0, 1 << 20));
      nextController = TabController(length: tabs.length, vsync: this, initialIndex: nextIndex);
      oldController = _tabController;
    }

    if (nextController != null) {
      oldController?.dispose();
    }

    if (!mounted || seq != _loadSeq) {
      nextController?.dispose();
      return;
    }

    setState(() {
      _tabs = tabs;
      _loading = false;
      if (nextController != null) {
        _tabController = nextController;
      }
    });

    await _loadCalendarStatus();
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
          tabs: _tabs,
        ),
      ),
      body: constrainedScaffoldBody(
        child: TabBarView(
          controller: _tabController,
          children: _buildTabViews(),
        ),
      ),
    );
  }

  Future<void> _loadCalendarStatus() async {
    if (!mounted) return;
    final int seq = ++_calendarStatusLoadSeq;
    setState(() => _loadingCalendarStatus = true);
    try {
      final res = await ApiClient.get(
        '/api/mobile/receptionists/${widget.receptionistId}/calendar-status',
      );
      Map<String, dynamic>? decoded;
      if (res.statusCode >= 200 && res.statusCode < 300 && res.body.trim().isNotEmpty) {
        try {
          final data = jsonDecode(res.body);
          if (data is Map<String, dynamic>) {
            decoded = data;
          }
        } catch (_) {
          // Invalid JSON or wrong shape; leave _calendarStatus as-is or null.
        }
      }
      if (!mounted || seq != _calendarStatusLoadSeq) return;
      setState(() {
        _calendarStatus = decoded;
        _loadingCalendarStatus = false;
      });
    } catch (_) {
      if (!mounted || seq != _calendarStatusLoadSeq) return;
      setState(() => _loadingCalendarStatus = false);
    }
  }

  List<Widget> _buildTabViews() {
    final views = <Widget>[];
    for (final tab in _tabs) {
      switch (tab.text) {
        case 'Calendar':
          views.add(ReceptionistCalendarTab(
            receptionistId: widget.receptionistId,
            status: _calendarStatus,
            loading: _loadingCalendarStatus,
            onRefresh: _loadCalendarStatus,
          ));
          break;
        case 'Staff':
          views.add(ReceptionistStaffTab(receptionistId: widget.receptionistId));
          break;
        case 'Services':
          views.add(_ServicesTab(receptionistId: widget.receptionistId));
          break;
        case 'Locations':
          views.add(_LocationsTab(receptionistId: widget.receptionistId));
          break;
        case 'Promos':
          views.add(_PromosTab(receptionistId: widget.receptionistId));
          break;
        case 'Website':
          views.add(ReceptionistWebsiteTab(receptionistId: widget.receptionistId));
          break;
        case 'Instructions':
          views.add(ReceptionistInstructionsTab(receptionistId: widget.receptionistId));
          break;
        default:
          views.add(const SizedBox.shrink());
      }
    }
    return views;
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
        .select('id, name, description, price_cents, duration_minutes, requires_location, default_location_type')
        .eq('receptionist_id', widget.receptionistId)
        .order('name');
    setState(() {
      _services = (res as List).cast<Map<String, dynamic>>();
      _loading = false;
    });
  }

  Future<void> _updateService(String id, {bool? requiresLocation, String? defaultLocationType}) async {
    final updates = <String, dynamic>{};
    if (requiresLocation != null) updates['requires_location'] = requiresLocation;
    if (defaultLocationType != null) updates['default_location_type'] = defaultLocationType.isEmpty ? null : defaultLocationType;
    if (updates.isEmpty) return;
    await Supabase.instance.client
        .from('services')
        .update(updates)
        .eq('id', id)
        .eq('receptionist_id', widget.receptionistId);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Service menu with pricing, duration, and optional location.'),
        const SizedBox(height: 16),
        ..._services.map((s) {
          final requiresLocation = (s['requires_location'] as bool?) ?? false;
          final rawType = s['default_location_type'] as String?;
          final defaultLocationType = (rawType == null || rawType == 'no_location') ? 'customer_address' : rawType;
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s['name'] ?? '', style: Theme.of(context).textTheme.titleMedium),
                            Text(
                              '\$${(s['price_cents'] ?? 0) / 100} · ${s['duration_minutes'] ?? 0} min',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete),
                        onPressed: () async {
                          final confirm = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: const Text('Delete service?'),
                              content: Text(
                                'Remove "${s['name'] ?? 'this service'}"? This cannot be undone.',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.of(ctx).pop(false),
                                  child: const Text('Cancel'),
                                ),
                                FilledButton(
                                  onPressed: () => Navigator.of(ctx).pop(true),
                                  style: FilledButton.styleFrom(
                                    backgroundColor: Theme.of(ctx).colorScheme.error,
                                  ),
                                  child: const Text('Delete'),
                                ),
                              ],
                            ),
                          );
                          if (confirm == true && mounted) {
                            await Supabase.instance.client
                                .from('services')
                                .delete()
                                .eq('id', s['id'])
                                .eq('receptionist_id', widget.receptionistId);
                            _load();
                          }
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  CheckboxListTile(
                    title: const Text('Requires location', style: TextStyle(fontSize: 14)),
                    value: requiresLocation,
                    onChanged: (v) => _updateService(s['id'] as String, requiresLocation: v ?? false),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                  ),
                  if (requiresLocation) ...[
                    const SizedBox(height: 4),
                    DropdownButtonFormField<String>(
                      // ignore: deprecated_member_use -- value is the current selection; initialValue is for uncontrolled form fields
                      value: defaultLocationType,
                      decoration: const InputDecoration(
                        labelText: 'Location type',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      isExpanded: true,
                      items: const [
                        DropdownMenuItem(value: 'customer_address', child: Text('Customer address')),
                        DropdownMenuItem(value: 'phone_call', child: Text('Phone call')),
                        DropdownMenuItem(value: 'video_meeting', child: Text('Video meeting')),
                        DropdownMenuItem(value: 'custom', child: Text('Custom text')),
                      ],
                      onChanged: (v) => _updateService(s['id'] as String, defaultLocationType: v ?? 'customer_address'),
                    ),
                  ],
                ],
              ),
            ),
          );
        }),
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
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Delete location?'),
                      content: Text(
                        'Remove "${l['name'] ?? 'this location'}"? This cannot be undone.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(ctx).pop(false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.of(ctx).pop(true),
                          style: FilledButton.styleFrom(
                            backgroundColor: Theme.of(ctx).colorScheme.error,
                          ),
                          child: const Text('Delete'),
                        ),
                      ],
                    ),
                  );
                  if (confirm == true && mounted) {
                    await Supabase.instance.client
                        .from('locations')
                        .delete()
                        .eq('id', l['id'])
                        .eq('receptionist_id', widget.receptionistId);
                    _load();
                  }
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
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Delete promotion?'),
                      content: Text(
                        'Remove "${p['code'] ?? 'this promo'}"? This cannot be undone.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(ctx).pop(false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.of(ctx).pop(true),
                          style: FilledButton.styleFrom(
                            backgroundColor: Theme.of(ctx).colorScheme.error,
                          ),
                          child: const Text('Delete'),
                        ),
                      ],
                    ),
                  );
                  if (confirm == true && mounted) {
                    await Supabase.instance.client
                        .from('promos')
                        .delete()
                        .eq('id', p['id'])
                        .eq('receptionist_id', widget.receptionistId);
                    _load();
                  }
                },
              ),
            )),
      ],
    );
  }
}

// moved tab widgets to settings_tabs/*
