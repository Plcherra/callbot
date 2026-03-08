// Push notification provider - wraps PushService for app-wide access.

import 'package:flutter/foundation.dart';

import '../services/push_service.dart';

class PushProvider extends ChangeNotifier {
  static final PushProvider _instance = PushProvider._();
  factory PushProvider() => _instance;

  PushProvider._();

  PushService get _push => PushService();

  String? get fcmToken => _push.fcmToken;
  bool get hasPush => _push.isInitialized;

  Future<void> refreshToken() async {
    await _push.initialize();
    notifyListeners();
  }
}
