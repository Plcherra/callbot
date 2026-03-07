import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config/env.dart';
import 'app.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (Env.supabaseUrl.isEmpty || Env.supabaseAnonKey.isEmpty) {
    throw StateError(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be set via --dart-define. '
      'Example: flutter run --dart-define=SUPABASE_URL=https://xxx.supabase.co '
      '--dart-define=SUPABASE_ANON_KEY=your_anon_key',
    );
  }
  await Supabase.initialize(
    url: Env.supabaseUrl,
    anonKey: Env.supabaseAnonKey,
  );
  runApp(const EchodeskApp());
}
