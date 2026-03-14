import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../services/api_client.dart';

/// Opens Stripe Checkout in WebView. User returns via deep link (echodesk://checkout?session_id=...).
class CheckoutScreen extends StatefulWidget {
  final String planId;

  const CheckoutScreen({super.key, this.planId = 'starter'});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  String? _checkoutUrl;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadCheckoutUrl();
  }

  Future<void> _loadCheckoutUrl() async {
    try {
      final res = await ApiClient.post(
        '/api/mobile/checkout',
        body: {'plan_id': widget.planId, 'return_scheme': 'echodesk'},
      );
      if (res.statusCode == 200) {
        final data = _parseJson(res.body);
        final url = data['url'] as String?;
        setState(() {
          _checkoutUrl = url;
          _loading = false;
          _error = url == null ? 'No checkout URL returned' : null;
        });
      } else {
        final data = _parseJson(res.body);
        setState(() {
          _error = data['error'] as String? ?? 'Failed to create checkout';
          _loading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Map<String, dynamic> _parseJson(String body) {
    try {
      return body.isNotEmpty
          ? jsonDecode(body) as Map<String, dynamic>
          : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Subscribe')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Subscribe')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(_error!, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    FilledButton(
                      onPressed: () {
                        setState(() {
                          _loading = true;
                          _error = null;
                        });
                        _loadCheckoutUrl();
                      },
                      child: const Text('Retry'),
                    ),
                    const SizedBox(width: 16),
                    OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Back'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }
    if (_checkoutUrl != null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Subscribe'),
          actions: [
            TextButton(
              onPressed: () async {
                if (await canLaunchUrl(Uri.parse(_checkoutUrl!))) {
                  await launchUrl(
                    Uri.parse(_checkoutUrl!),
                    mode: LaunchMode.externalApplication,
                  );
                }
              },
              child: const Text('Open in browser'),
            ),
          ],
        ),
        body: WebViewWidget(
          controller: WebViewController()
            ..setJavaScriptMode(JavaScriptMode.unrestricted)
            ..loadRequest(Uri.parse(_checkoutUrl!)),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}
