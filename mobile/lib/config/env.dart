/// App configuration. Uses dart-define in production, or defaults for local dev.
/// Run with: flutter run --dart-define=API_BASE_URL=https://your-api.com
class Env {
  static const String apiBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000');
  static const String supabaseUrl =
      String.fromEnvironment('SUPABASE_URL', defaultValue: '');
  static const String supabaseAnonKey =
      String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
  static const String deepLinkScheme =
      String.fromEnvironment('DEEP_LINK_SCHEME', defaultValue: 'echodesk');
}
