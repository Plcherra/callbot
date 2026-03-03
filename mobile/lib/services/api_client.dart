import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/env.dart';

/// HTTP client for Echodesk backend API. Attaches Bearer token from Supabase session.
class ApiClient {
  static String get _baseUrl =>
      Env.apiBaseUrl.replaceAll(RegExp(r'/$'), '');

  static Future<String?> _getAccessToken() async {
    final session = Supabase.instance.client.auth.currentSession;
    return session?.accessToken;
  }

  static Future<Map<String, String>> _headers({bool withAuth = true}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (withAuth) {
      final token = await _getAccessToken();
      if (token != null) {
        headers['Authorization'] = 'Bearer $token';
      }
    }
    return headers;
  }

  static Future<http.Response> get(
    String path, {
    Map<String, String>? queryParams,
    bool withAuth = true,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');
    final uriWithParams = queryParams != null && queryParams.isNotEmpty
        ? uri.replace(queryParameters: queryParams)
        : uri;
    return http.get(uriWithParams, headers: await _headers(withAuth: withAuth));
  }

  static Future<http.Response> post(
    String path, {
    Object? body,
    bool withAuth = true,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');
    return http.post(
      uri,
      headers: await _headers(withAuth: withAuth),
      body: body != null ? jsonEncode(body) : null,
    );
  }

  static Future<http.Response> patch(
    String path, {
    Object? body,
    bool withAuth = true,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');
    return http.patch(
      uri,
      headers: await _headers(withAuth: withAuth),
      body: body != null ? jsonEncode(body) : null,
    );
  }
}
