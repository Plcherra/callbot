import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/appointment_service.dart';
import '../../utils/appointment_formatters.dart';
import '../../widgets/constrained_scaffold_body.dart';

class AppointmentsScreen extends StatefulWidget {
  final String? initialStatus;
  final String? receptionistId;

  const AppointmentsScreen({super.key, this.initialStatus, this.receptionistId});

  @override
  State<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends State<AppointmentsScreen> {
  List<Map<String, dynamic>> _appointments = [];
  Map<String, String> _receptionists = {};
  bool _loading = true;
  String? _error;
  late String? _statusFilter;

  @override
  void initState() {
    super.initState();
    _statusFilter = widget.initialStatus;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await loadAppointments(
        status: _statusFilter,
        receptionistId: widget.receptionistId,
      );
      setState(() {
        _appointments = List<Map<String, dynamic>>.from(data['appointments'] ?? []);
        _receptionists = Map<String, String>.from(data['receptionists'] ?? {});
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('Appointments'),
      ),
      body: constrainedScaffoldBody(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _buildError()
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildFilterChips(),
                      Expanded(
                        child: _appointments.isEmpty
                            ? _buildEmpty()
                            : RefreshIndicator(
                                onRefresh: _load,
                                child: ListView.builder(
                                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                                  itemCount: _appointments.length,
                                  itemBuilder: (context, i) {
                                    final apt = _appointments[i];
                                    return _AppointmentRow(
                                      appointment: apt,
                                      receptionistName: _receptionists[apt['receptionist_id']] ?? '—',
                                      onTap: () => context.push('/appointments/${apt['id']}'),
                                    );
                                  },
                                ),
                              ),
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _buildFilterChips() {
    const filters = [
      (null, 'All'),
      ('needs_review', 'Needs Review'),
      ('confirmed', 'Confirmed'),
      ('cancelled', 'Cancelled'),
      ('completed', 'Completed'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
      child: Row(
        children: filters.map((f) {
          final selected = _statusFilter == f.$1;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(f.$2),
              selected: selected,
              onSelected: (_) {
                setState(() {
                  _statusFilter = f.$1;
                  _load();
                });
              },
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red.shade400),
            const SizedBox(height: 16),
            Text(
              'Could not load appointments',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
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

  Widget _buildEmpty() {
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
                Text(
                  'No appointments',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  'Appointments booked by your AI receptionist will appear here.',
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

class _AppointmentRow extends StatelessWidget {
  final Map<String, dynamic> appointment;
  final String receptionistName;
  final VoidCallback onTap;

  const _AppointmentRow({
    required this.appointment,
    required this.receptionistName,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final start = appointment['start_time'] != null
        ? DateTime.tryParse(appointment['start_time'] as String)
        : null;
    final status = appointment['status'] as String? ?? 'needs_review';
    final serviceName = (appointment['service_name'] as String?)?.trim();
    final displayService = serviceName != null && serviceName.isNotEmpty
        ? serviceName
        : 'Generic appointment';
    final isGeneric = (appointment['booking_mode'] as String?) == 'generic' ||
        (serviceName == null || serviceName.isEmpty);
    final callerNumber = appointment['caller_number'] as String?;
    final paymentLink = appointment['payment_link'] as String?;
    final hasPayment = paymentLink != null && paymentLink.isNotEmpty;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      formatAppointmentDateTime(start),
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                  _StatusChip(status: status),
                  if (isGeneric) _GenericBadge(),
                  const SizedBox(width: 4),
                  Icon(Icons.chevron_right, size: 20, color: Colors.grey.shade400),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                displayService,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(Icons.person_outline, size: 14, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    receptionistName,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                  if (callerNumber != null && callerNumber.isNotEmpty) ...[
                    const SizedBox(width: 16),
                    Icon(Icons.phone_outlined, size: 14, color: Colors.grey.shade600),
                    const SizedBox(width: 4),
                    Text(
                      maskPhone(callerNumber),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ],
              ),
              if (hasPayment) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.payment, size: 14, color: Colors.green.shade700),
                    const SizedBox(width: 4),
                    Text(
                      'Payment link attached',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.green.shade700,
                          ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color, bgColor) = _statusStyle(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }

  (String, Color, Color) _statusStyle(String s) {
    switch (s) {
      case 'confirmed':
        return ('Confirmed', Colors.green.shade800, Colors.green.shade100);
      case 'needs_review':
        return ('Needs Review', Colors.orange.shade800, Colors.orange.shade100);
      case 'cancelled':
        return ('Cancelled', Colors.red.shade800, Colors.red.shade100);
      case 'completed':
        return ('Completed', Colors.blue.shade800, Colors.blue.shade100);
      default:
        return ('—', Colors.grey.shade700, Colors.grey.shade200);
    }
  }
}

class _GenericBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.amber.shade100,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.warning_amber, size: 12, color: Colors.amber.shade800),
          const SizedBox(width: 4),
          Text(
            'Generic',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.amber.shade900),
          ),
        ],
      ),
    );
  }
}
