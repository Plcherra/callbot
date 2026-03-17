import 'package:flutter/material.dart';

class ReceptionistCalendarTab extends StatelessWidget {
  final String receptionistId;
  final Map<String, dynamic>? status;
  final bool loading;
  final Future<void> Function() onRefresh;

  const ReceptionistCalendarTab({
    super.key,
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
    final connectedEmail =
        _str(s['connected_google_email']).isEmpty ? null : _str(s['connected_google_email']);
    final bookingLabel = _str(s['booking_calendar_label']);
    final bookingId = _str(s['booking_calendar_id']);
    final bookingCalendar =
        bookingLabel.isNotEmpty ? bookingLabel : (bookingId.isNotEmpty ? bookingId : 'primary');
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
            subtitle: Text(mode == 'business' ? 'Business / Team' : 'Personal / Solo'),
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

