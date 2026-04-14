import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../utils/appointment_formatters.dart';

/// One time bucket for the day view (e.g. "2:30 PM").
class AppointmentDaySection {
  final String timeLabel;
  final List<Map<String, dynamic>> appointments;

  const AppointmentDaySection({
    required this.timeLabel,
    required this.appointments,
  });
}

/// Group appointments by [formatAgendaTime] of start_time (stable insertion order per bucket).
List<AppointmentDaySection> groupAppointmentsByAgendaTime(
  List<Map<String, dynamic>> items,
) {
  final sections = <String, List<Map<String, dynamic>>>{};
  for (final a in items) {
    final start = a['start_time'] != null
        ? DateTime.tryParse(a['start_time'] as String)
        : null;
    final key = formatAgendaTime(start);
    sections.putIfAbsent(key, () => []).add(a);
  }
  final keys = sections.keys.toList();
  return keys
      .map((k) => AppointmentDaySection(timeLabel: k, appointments: sections[k]!))
      .toList();
}

/// Time-grouped list for a single calendar day (agenda-style).
class AppointmentDayScheduleListView extends StatelessWidget {
  final List<Map<String, dynamic>> appointments;

  const AppointmentDayScheduleListView({
    super.key,
    required this.appointments,
  });

  @override
  Widget build(BuildContext context) {
    final sections = groupAppointmentsByAgendaTime(appointments);
    return ListView.builder(
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
            ...section.appointments.map(
              (apt) => AppointmentAgendaTile(appointment: apt),
            ),
          ],
        );
      },
    );
  }
}

/// Compact tile used in the day / Today view.
class AppointmentAgendaTile extends StatelessWidget {
  final Map<String, dynamic> appointment;

  const AppointmentAgendaTile({super.key, required this.appointment});

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
