import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/auth/login_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'services/deep_link_handler.dart';

class EchodeskApp extends StatefulWidget {
  const EchodeskApp({super.key});

  @override
  State<EchodeskApp> createState() => _EchodeskAppState();
}

class _EchodeskAppState extends State<EchodeskApp> {
  final DeepLinkHandler _deepLinkHandler = DeepLinkHandler();
  final GlobalKey<ScaffoldMessengerState> _scaffoldKey =
      GlobalKey<ScaffoldMessengerState>();

  @override
  void initState() {
    super.initState();
    _deepLinkHandler.init((msg) {
      _scaffoldKey.currentState?.showSnackBar(SnackBar(content: Text(msg)));
    });
  }

  @override
  void dispose() {
    _deepLinkHandler.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      scaffoldMessengerKey: _scaffoldKey,
      title: 'Echodesk',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: StreamBuilder<AuthState>(
        stream: Supabase.instance.client.auth.onAuthStateChange,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          final session = snapshot.data?.session;
          if (session != null) {
            return const DashboardScreen();
          }
          return const LoginScreen();
        },
      ),
    );
  }
}
