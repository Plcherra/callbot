import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../services/api_client.dart';
import '../../strings.dart';
import '../../widgets/constrained_scaffold_body.dart';

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
  String _mode = 'personal';
  Map<String, dynamic>? _calendarStatus;
  bool _loadingCalendarStatus = false;
  bool _loading = true;
  List<Tab> _tabs = const [];

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

    if (!mounted) return;
    setState(() {
      _tabs = tabs;
      _loading = false;
      _tabController.dispose();
      _tabController = TabController(length: _tabs.length, vsync: this);
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
      if (!mounted) return;
      setState(() {
        _calendarStatus = decoded;
        _loadingCalendarStatus = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingCalendarStatus = false);
    }
  }

  List<Widget> _buildTabViews() {
    final views = <Widget>[];
    for (final tab in _tabs) {
      switch (tab.text) {
        case 'Calendar':
          views.add(_CalendarTab(
            receptionistId: widget.receptionistId,
            status: _calendarStatus,
            loading: _loadingCalendarStatus,
            onRefresh: _loadCalendarStatus,
          ));
          break;
        case 'Staff':
          views.add(_StaffTab(receptionistId: widget.receptionistId));
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
          views.add(_WebsiteTab(receptionistId: widget.receptionistId));
          break;
        case 'Instructions':
          views.add(_InstructionsTab(receptionistId: widget.receptionistId));
          break;
        default:
          views.add(const SizedBox.shrink());
      }
    }
    return views;
  }
}

class _CalendarTab extends StatelessWidget {
  final String receptionistId;
  final Map<String, dynamic>? status;
  final bool loading;
  final Future<void> Function() onRefresh;

  const _CalendarTab({
    required this.receptionistId,
    required this.status,
    required this.loading,
    required this.onRefresh,
  });

  static String _str(dynamic v) {
    if (v == null) return '';
    if (v is String) return v;
    return v.toString();
  }

  @override
  Widget build(BuildContext context) {
    final s = status ?? {};
    final mode = _str(s['mode']).isEmpty ? 'personal' : _str(s['mode']);
    final assistantName = _str(s['assistant_name']);
    final connectedEmail = _str(s['connected_google_email']).isEmpty ? null : _str(s['connected_google_email']);
    final bookingLabel = _str(s['booking_calendar_label']);
    final bookingId = _str(s['booking_calendar_id']);
    final bookingCalendar = bookingLabel.isNotEmpty ? bookingLabel : (bookingId.isNotEmpty ? bookingId : 'primary');
    final connected = s['calendar_connected'] == true;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            title: const Text('Assistant'),
            subtitle: Text(
              assistantName.isNotEmpty ? assistantName : receptionistId,
            ),
          ),
          ListTile(
            title: const Text('Mode'),
            subtitle:
                Text(mode == 'business' ? 'Business / Team' : 'Personal / Solo'),
          ),
          ListTile(
            title: const Text('Google account'),
            subtitle: Text(
              connectedEmail ?? 'Not connected',
            ),
            trailing: Icon(
              connected ? Icons.check_circle : Icons.error_outline,
              color: connected ? Colors.green : Colors.orange,
            ),
          ),
          ListTile(
            title: const Text('Booking calendar'),
            subtitle: Text(bookingCalendar),
          ),
          const SizedBox(height: 8),
          if (loading) const LinearProgressIndicator(),
          const SizedBox(height: 8),
          Text(
            'This calendar is used for availability checks and bookings for this assistant.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
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
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Delete staff member?'),
                      content: Text(
                        'Remove "${s['name'] ?? 'this person'}"? This cannot be undone.',
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
                        .from('staff')
                        .delete()
                        .eq('id', s['id'])
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
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Website content saved')),
                          );
                        }
                      } else {
                        final data = jsonDecode(res.body) as Map<String, dynamic>?;
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text((data?['error'] as String?) ?? 'Failed'),
                            ),
                          );
                        }
                      }
                    } catch (_) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text(AppStrings.couldNotFetchWebsite)),
                        );
                      }
                    }
                    if (mounted) setState(() => _loading = false);
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
  final _coreInstructionsController = TextEditingController();
  final _greetingController = TextEditingController();
  final _assistantIdentityController = TextEditingController();
  final _extraNotesController = TextEditingController();
  final AudioPlayer _previewPlayer = AudioPlayer();
  bool _loading = true;
  bool _saving = false;
  String? _voicePresetKey;
  List<Map<String, dynamic>> _voicePresets = [];
  bool _voicePresetsLoading = false;
  String? _previewPlayingKey;

  @override
  void dispose() {
    _coreInstructionsController.dispose();
    _greetingController.dispose();
    _assistantIdentityController.dispose();
    _extraNotesController.dispose();
    _previewPlayer.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _loadVoicePresets() async {
    if (_voicePresets.isNotEmpty) return;
    setState(() => _voicePresetsLoading = true);
    try {
      final res = await ApiClient.get('/api/mobile/voice-presets');
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final data = jsonDecode(res.body) as Map<String, dynamic>?;
        final list = data?['presets'] as List<dynamic>?;
        if (mounted) {
          setState(() {
            _voicePresets = list?.cast<Map<String, dynamic>>() ?? [];
            _voicePresetsLoading = false;
          });
        }
      } else {
        if (mounted) setState(() => _voicePresetsLoading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _voicePresetsLoading = false);
    }
  }

  Future<void> _playPresetPreview(String key) async {
    if (_previewPlayingKey == key) {
      await _previewPlayer.stop();
      setState(() => _previewPlayingKey = null);
      return;
    }
    setState(() => _previewPlayingKey = key);
    try {
      final path = '/api/mobile/voice-presets/$key/preview';
      final res = await ApiClient.get(path);
      if (res.statusCode == 200 && res.bodyBytes.isNotEmpty) {
        await _previewPlayer.stop();
        await _previewPlayer.setSource(BytesSource(res.bodyBytes, mimeType: 'audio/mpeg'));
        await _previewPlayer.resume();
        _previewPlayer.onPlayerComplete.listen((_) {
          if (mounted) setState(() => _previewPlayingKey = null);
        });
      } else {
        if (mounted) setState(() => _previewPlayingKey = null);
      }
    } catch (_) {
      if (mounted) setState(() => _previewPlayingKey = null);
    }
  }

  Future<void> _showVoicePicker() async {
    await _loadVoicePresets();
    if (!mounted) return;
    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final presets = _voicePresets;
            final loading = _voicePresetsLoading;
            return DraggableScrollableSheet(
              initialChildSize: 0.6,
              maxChildSize: 0.9,
              expand: false,
              builder: (_, scrollController) => Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Choose a voice',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'How your receptionist sounds.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    if (loading)
                      const Center(child: CircularProgressIndicator())
                    else
                      Expanded(
                        child: ListView.builder(
                          controller: scrollController,
                          itemCount: presets.length,
                          itemBuilder: (_, i) {
                            final p = presets[i];
                            final key = p['key'] as String? ?? '';
                            final label = p['label'] as String? ?? key;
                            final description = p['description'] as String? ?? '';
                            final selected = _voicePresetKey == key;
                            final playing = _previewPlayingKey == key;
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              color: selected
                                  ? Theme.of(context).colorScheme.primaryContainer
                                  : null,
                              child: ListTile(
                                title: Text(label),
                                subtitle: description.isNotEmpty
                                    ? Text(description)
                                    : null,
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: Icon(
                                        playing ? Icons.stop : Icons.play_circle_outline,
                                      ),
                                      onPressed: () => _playPresetPreview(key),
                                    ),
                                    if (selected)
                                      const Icon(Icons.check_circle, color: Colors.green),
                                  ],
                                ),
                                onTap: () {
                                  setState(() => _voicePresetKey = key);
                                  setModalState(() {});
                                },
                              ),
                            );
                          },
                        ),
                      ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Done'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    ).then((saved) {
      if (saved == true && _voicePresetKey != null) _save();
    });
  }

  Future<void> _load() async {
    final res = await Supabase.instance.client
        .from('receptionists')
        .select('system_prompt, greeting, voice_id, voice_preset_key, assistant_identity, extra_instructions')
        .eq('id', widget.receptionistId)
        .maybeSingle();
    if (res != null) {
      _coreInstructionsController.text = res['system_prompt'] as String? ?? '';
      _greetingController.text = res['greeting'] as String? ?? '';
      _voicePresetKey = res['voice_preset_key'] as String?;
      _assistantIdentityController.text = res['assistant_identity'] as String? ?? '';
      _extraNotesController.text = res['extra_instructions'] as String? ?? '';
    }
    if (!mounted) return;
    setState(() => _loading = false);
    _loadVoicePresets();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final ctx = context;
    try {
      final body = <String, dynamic>{
        'system_prompt': _coreInstructionsController.text.trim().isEmpty ? null : _coreInstructionsController.text.trim(),
        'greeting': _greetingController.text.trim().isEmpty ? null : _greetingController.text.trim(),
        'assistant_identity': _assistantIdentityController.text.trim().isEmpty ? null : _assistantIdentityController.text.trim(),
        'extra_instructions': _extraNotesController.text.trim().isEmpty ? null : _extraNotesController.text.trim(),
      };
      if (_voicePresetKey != null) body['voice_preset_key'] = _voicePresetKey;
      final res = await ApiClient.patch(
        '/api/mobile/receptionists/${widget.receptionistId}',
        body: body,
      );
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await _load();
        if (!ctx.mounted) return;
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('Saved')),
        );
      } else {
        final data = jsonDecode(res.body) as Map<String, dynamic>?;
        if (!ctx.mounted) return;
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(content: Text(data?['error'] as String? ?? AppStrings.couldNotSaveSettings)),
        );
      }
    } catch (_) {
      if (!ctx.mounted) return;
      ScaffoldMessenger.of(ctx).showSnackBar(
        const SnackBar(content: Text(AppStrings.couldNotSaveSettings)),
      );
    }
    if (!mounted) return;
    setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Assistant identity — what the AI calls itself in the greeting.'),
        const SizedBox(height: 8),
        TextField(
          controller: _assistantIdentityController,
          decoration: const InputDecoration(
            labelText: 'Assistant name/identity',
            hintText: "e.g. Eve, Alex — leave blank to use receptionist name",
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        const Text('Core instructions — main system prompt for the AI.'),
        const SizedBox(height: 8),
        TextField(
          controller: _coreInstructionsController,
          decoration: const InputDecoration(
            hintText: "Leave blank to use generated prompt from business data",
            border: OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          maxLines: 6,
        ),
        const SizedBox(height: 16),
        const Text('Greeting — first thing the AI says when a call is answered.'),
        const SizedBox(height: 8),
        TextField(
          controller: _greetingController,
          decoration: const InputDecoration(
            hintText: "e.g. Hello! Thanks for calling. I'm Eve. How can I help you today?",
            border: OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          maxLines: 2,
        ),
        const SizedBox(height: 16),
        const Text('Voice — how your receptionist sounds.'),
        const SizedBox(height: 8),
        ListTile(
          title: Text(
            () {
              final found = _voicePresets.where((p) => p['key'] == _voicePresetKey);
              return found.isEmpty
                  ? (_voicePresetKey ?? 'Default')
                  : (found.first['label'] as String? ?? 'Default');
            }(),
          ),
          subtitle: const Text('Name and voice are separate choices.'),
          trailing: FilledButton.tonal(
            onPressed: _showVoicePicker,
            child: const Text('Change voice'),
          ),
        ),
        const SizedBox(height: 16),
        const Text('Extra notes — additional instructions appended to the main prompt.'),
        const SizedBox(height: 8),
        TextField(
          controller: _extraNotesController,
          decoration: const InputDecoration(
            hintText: "e.g. We're closed on Sundays. Cancellations must be 24h in advance.",
            border: OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          maxLines: 4,
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Save'),
        ),
      ],
    );
  }
}
