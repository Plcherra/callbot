import 'dart:convert';

import 'api_client.dart';

/// Load call history for a receptionist.
Future<List<Map<String, dynamic>>> loadCallHistory(
  String receptionistId, {
  int limit = 50,
  int offset = 0,
}) async {
  final res = await ApiClient.get(
    '/api/mobile/receptionists/$receptionistId/call-history?limit=$limit&offset=$offset',
  );
  if (res.statusCode >= 200 && res.statusCode < 300 && res.body.isNotEmpty) {
    final decoded = jsonDecode(res.body) as Map<String, dynamic>?;
    return List<Map<String, dynamic>>.from((decoded?['calls'] as List?) ?? []);
  }
  return [];
}
