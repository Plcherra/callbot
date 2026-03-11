import 'package:flutter/foundation.dart' show kReleaseMode;

/// App configuration. Uses dart-define in production, or defaults for local dev.
/// Debug: http://localhost:3000 | Release: https://echodesk.us (or pass API_BASE_URL)
/// Run: flutter run --dart-define=API_BASE_URL=https://echodesk.us
/// Build: flutter build apk --dart-define=API_BASE_URL=https://echodesk.us ...
class Env {
  static String get apiBaseUrl {
    const env = String.fromEnvironment('API_BASE_URL', defaultValue: '');
    if (env.isNotEmpty) return env;
    return kReleaseMode ? 'https://echodesk.us' : 'http://localhost:3000';
  }
  static const String supabaseUrl =
      String.fromEnvironment('SUPABASE_URL', defaultValue: '');
  static const String supabaseAnonKey =
      String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
  static const String deepLinkScheme =
      String.fromEnvironment('DEEP_LINK_SCHEME', defaultValue: 'echodesk');

  /// Voice backend WebSocket base URL (for listen-in on active call screen).
  /// Defaults to wss://echodesk.us in release; override with VOICE_WS_BASE_URL.
  static String get voiceWsBaseUrl {
    const env = String.fromEnvironment('VOICE_WS_BASE_URL', defaultValue: '');
    if (env.isNotEmpty) return env;
    return kReleaseMode ? 'wss://echodesk.us' : '';
  }
}
