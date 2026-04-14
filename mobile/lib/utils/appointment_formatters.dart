// Helpers for formatting appointment-related display strings.

/// Format appointment date/time for list (e.g. "Mar 22, 2:34 PM").
String formatAppointmentDateTime(DateTime? dt) {
  if (dt == null) return '—';
  final local = dt.toLocal();
  final timeStr = _formatTime(local);
  return '${_shortDate(local)} $timeStr';
}

String _formatTime(DateTime dt) {
  final hour = dt.hour;
  final minute = dt.minute;
  final am = hour < 12;
  final h = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  return '$h:${minute.toString().padLeft(2, '0')} ${am ? 'AM' : 'PM'}';
}

String _shortDate(DateTime dt) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
}

/// Truncate text for preview.
String truncatePreview(String? text, {int maxLength = 80}) {
  if (text == null || text.trim().isEmpty) return '';
  final t = text.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (t.length <= maxLength) return t;
  return '${t.substring(0, maxLength).trim()}…';
}

/// Short status line for agenda / day view (plain language, not raw enum values).
String formatAgendaStatusLabel(String? status) {
  switch (status) {
    case 'confirmed':
      return '\u2705 Confirmed';
    case 'needs_review':
      return '\u23F3 Needs review';
    case 'cancelled':
      return '\u274C Cancelled';
    case 'completed':
      return '\u2713 Completed';
    default:
      return '\u23F3 Needs review';
  }
}

/// Time only for grouping (local), e.g. "2:30 PM".
String formatAgendaTime(DateTime? dt) {
  if (dt == null) return '—';
  final local = dt.toLocal();
  final hour = local.hour;
  final minute = local.minute;
  final am = hour < 12;
  final h = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  return '$h:${minute.toString().padLeft(2, '0')} ${am ? 'AM' : 'PM'}';
}

/// Mask phone number for display.
String maskPhone(String? s) {
  if (s == null || s.trim().isEmpty) return '—';
  final digits = s.replaceAll(RegExp(r'\D'), '');
  if (digits.length <= 4) return '***';
  return '***${digits.substring(digits.length - 2)}';
}
