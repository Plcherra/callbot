import 'dart:async';

import 'package:app_links/app_links.dart';

import 'api_client.dart';

/// Handles incoming deep links (echodesk://checkout, echodesk://google-callback).
class DeepLinkHandler {
  final AppLinks _appLinks = AppLinks();

  StreamSubscription<Uri>? _subscription;

  void init(void Function(String message) onMessage) {
    _subscription = _appLinks.uriLinkStream.listen((uri) {
      _handleUri(uri, onMessage);
    });

    // Handle cold start (app launched from link)
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleUri(uri, onMessage);
    });
  }

  void dispose() {
    _subscription?.cancel();
  }

  Future<void> _handleUri(Uri uri, void Function(String) onMessage) async {
    if (uri.host == 'checkout') {
      final sessionId = uri.queryParameters['session_id'];
      if (sessionId != null && sessionId.isNotEmpty) {
        if (uri.queryParameters['cancelled'] == '1') {
          onMessage('Checkout cancelled');
          return;
        }
        try {
          final res = await ApiClient.post(
            '/api/mobile/sync-session',
            body: {'session_id': sessionId},
          );
          if (res.statusCode >= 200 && res.statusCode < 300) {
            onMessage('Subscription activated!');
          } else {
            onMessage('Could not sync subscription. Please try again.');
          }
        } catch (_) {
          onMessage('Could not sync subscription. Please try again.');
        }
      }
    } else if (uri.host == 'google-callback') {
      final success = uri.queryParameters['success'];
      if (success == '1') {
        onMessage('Google Calendar connected!');
      } else {
        final err = uri.queryParameters['error'] ?? 'Connection failed';
        onMessage('Calendar: $err');
      }
    }
  }
}
