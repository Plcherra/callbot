// Helpers for formatting call-related display strings.

/// Format a DateTime for call list (e.g. "Mar 22, 2:34 PM" or "Yesterday 3:00 PM").
String formatCallTimestamp(DateTime? dt) {
  if (dt == null) return 'Unknown';
  final local = dt.toLocal();
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final callDate = DateTime(local.year, local.month, local.day);
  final diff = today.difference(callDate).inDays;

  final timeStr = _formatTime(local);
  if (diff == 0) {
    return 'Today $timeStr';
  } else if (diff == 1) {
    return 'Yesterday $timeStr';
  } else if (diff < 7) {
    return '${_weekday(local)} $timeStr';
  } else {
    return '${_shortDate(local)} $timeStr';
  }
}

String _formatTime(DateTime dt) {
  final hour = dt.hour;
  final minute = dt.minute;
  final am = hour < 12;
  final h = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
  return '$h:${minute.toString().padLeft(2, '0')} ${am ? 'AM' : 'PM'}';
}

String _weekday(DateTime dt) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days[dt.weekday - 1];
}

String _shortDate(DateTime dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
}

/// Format duration in seconds to "1m 30s" or "45s".
String formatCallDuration(int? seconds) {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return '${seconds}s';
  final m = seconds ~/ 60;
  final s = seconds % 60;
  if (s == 0) return '${m}m';
  return '${m}m ${s}s';
}

/// Truncate transcript for list preview. Max length with ellipsis.
String truncateTranscriptPreview(String? text, {int maxLength = 80}) {
  if (text == null || text.trim().isEmpty) return '';
  final t = text.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (t.length <= maxLength) return t;
  return '${t.substring(0, maxLength).trim()}…';
}

/// Format E.164 phone for display (e.g. "+1 (555) 123-4567" or last 4 digits masked).
String formatPhoneForDisplay(String? raw, {bool mask = false}) {
  if (raw == null || raw.trim().isEmpty) return '—';
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return raw;
  if (mask && digits.length > 4) return '***${digits.substring(digits.length - 2)}';
  if (digits.length >= 10) {
    final area = digits.length >= 10 ? digits.substring(digits.length - 10, digits.length - 7) : '';
    final mid = digits.length >= 7 ? digits.substring(digits.length - 7, digits.length - 4) : digits;
    final last = digits.substring(digits.length >= 4 ? digits.length - 4 : 0);
    return '($area) $mid-$last';
  }
  return raw;
}

/// Outcome badge label derived from call data.
/// Backend fields used: duration_seconds, answered_at, outcome (if present).
String callOutcomeLabel(Map<String, dynamic> call) {
  // Prefer explicit outcome if backend adds it later
  final explicit = call['outcome'] as String?;
  if (explicit != null && explicit.trim().isNotEmpty) {
    const known = ['booked', 'missed', 'short_call', 'completed', 'unknown'];
    final lower = explicit.trim().toLowerCase();
    if (known.contains(lower)) {
      switch (lower) {
        case 'booked': return 'Booked';
        case 'missed': return 'Missed';
        case 'short_call': return 'Short Call';
        case 'completed': return 'Completed';
        default: return 'Unknown';
      }
    }
  }

  final dur = call['duration_seconds'] as int? ?? 0;
  final answeredAt = call['answered_at'];

  if (answeredAt == null && dur <= 0) return 'Missed';
  if (dur > 0 && dur < 30) return 'Short Call';
  if (dur >= 30) return 'Completed';
  return 'Unknown';
}
