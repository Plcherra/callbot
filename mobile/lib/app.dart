import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_router.dart';
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
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = createAppRouter();
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
    return MaterialApp.router(
      scaffoldMessengerKey: _scaffoldKey,
      title: 'Echodesk',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      routerConfig: _router,
    );
  }
}
