import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/appointment_service.dart';
import '../../utils/appointment_formatters.dart';
import '../../widgets/constrained_scaffold_body.dart';

/// Single-day schedule for one receptionist, grouped by start time.
class AgendaScreen extends StatefulWidget {
  final String receptionistId;

  const AgendaScreen({super.key, required this.receptionistId});

  @override
  State<AgendaScreen> createState() => _AgendaScreenState();
}

class _AgendaScreenState extends State<AgendaScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;
  late String _localDateLabel;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _localDateLabel =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final now = DateTime.now();
      final date =
          '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
      final offset = now.timeZoneOffset.inMinutes;
      final data = await loadAgendaToday(
        receptionistId: widget.receptionistId,
        date: date,
        offsetMinutes: offset,
      );
      if (!mounted) return;
      setState(() {
        _items = List<Map<String, dynamic>>.from(data['appointments'] ?? []);
        _localDateLabel = date;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<_AgendaSection> _groupByTime() {
    final sections = <String, List<Map<String, dynamic>>>{};
    for (final a in _items) {
      final start = a['start_time'] != null
          ? DateTime.tryParse(a['start_time'] as String)
          : null;
      final key = formatAgendaTime(start);
      sections.putIfAbsent(key, () => []).add(a);
    }
    final keys = sections.keys.toList();
    return keys
        .map((k) => _AgendaSection(timeLabel: k, appointments: sections[k]!))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final sections = _groupByTime();
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Agenda'),
            Text(
              _localDateLabel,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.normal,
                  ),
            ),
          ],
        ),
      ),
      body: constrainedScaffoldBody(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _buildError(context)
                : _items.isEmpty
                    ? RefreshIndicator(
                        onRefresh: _load,
                        child: ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            SizedBox(
                              height: MediaQuery.of(context).size.height * 0.45,
                              child: _buildEmpty(context),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                          itemCount: sections.length,
                          itemBuilder: (context, sectionIndex) {
                            final section = sections[sectionIndex];
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Padding(
                                  padding: EdgeInsets.only(
                                    top: sectionIndex == 0 ? 0 : 16,
                                    bottom: 8,
                                  ),
                                  child: Text(
                                    section.timeLabel,
                                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                          color: Theme.of(context).colorScheme.primary,
                                          fontWeight: FontWeight.w700,
                                        ),
                                  ),
                                ),
                                ...section.appointments.map((apt) => _AgendaTile(appointment: apt)),
                              ],
                            );
                          },
                        ),
                      ),
      ),
    );
  }

  Widget _buildError(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red.shade400),
            const SizedBox(height: 16),
            Text('Could not load agenda', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
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
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.event_available, size: 48, color: Colors.grey.shade400),
                const SizedBox(height: 12),
                Text('Nothing scheduled', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  'No appointments for this day.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AgendaSection {
  final String timeLabel;
  final List<Map<String, dynamic>> appointments;

  _AgendaSection({required this.timeLabel, required this.appointments});
}

class _AgendaTile extends StatelessWidget {
  final Map<String, dynamic> appointment;

  const _AgendaTile({required this.appointment});

  @override
  Widget build(BuildContext context) {
    final id = appointment['id'] as String?;
    final start = appointment['start_time'] != null
        ? DateTime.tryParse(appointment['start_time'] as String)
        : null;
    final end = appointment['end_time'] != null
        ? DateTime.tryParse(appointment['end_time'] as String)
        : null;
    final summary = (appointment['summary'] as String?)?.trim();
    final title = summary != null && summary.isNotEmpty ? summary : 'Appointment';
    final service = (appointment['service_name'] as String?)?.trim();
    final serviceLine = service != null && service.isNotEmpty ? service : '—';
    final phone = appointment['caller_number'] as String?;
    final status = appointment['status'] as String? ?? 'needs_review';
    final isPast = appointment['is_past'] == true;
    final bodyStyle = Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: isPast
              ? Theme.of(context).colorScheme.onSurfaceVariant
              : Theme.of(context).colorScheme.onSurface,
        );

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: id != null ? () => context.push('/appointments/$id') : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      '${formatAgendaTime(start)} – ${formatAgendaTime(end)}',
                      style: bodyStyle?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (isPast)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Text(
                        'Done',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                      ),
                    ),
                  Icon(Icons.chevron_right, size: 20, color: Colors.grey.shade400),
                ],
              ),
              const SizedBox(height: 8),
              Text(title, style: bodyStyle),
              const SizedBox(height: 4),
              Text(
                serviceLine,
                style: bodyStyle?.copyWith(fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(Icons.phone_outlined, size: 14, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    maskPhone(phone),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                formatAgendaStatusLabel(status),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
