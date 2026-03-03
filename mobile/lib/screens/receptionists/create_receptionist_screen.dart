import 'dart:convert';

import 'package:flutter/material.dart';

import '../../services/api_client.dart';

class CreateReceptionistScreen extends StatefulWidget {
  const CreateReceptionistScreen({super.key});

  @override
  State<CreateReceptionistScreen> createState() =>
      _CreateReceptionistScreenState();
}

class _CreateReceptionistScreenState extends State<CreateReceptionistScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _calendarIdController = TextEditingController(text: 'primary');
  final _systemPromptController = TextEditingController(
    text:
        'You are a friendly, professional receptionist. Answer calls politely, '
        'book appointments into Google Calendar, confirm details, and be helpful.',
  );
  String _phoneStrategy = 'new';
  String _areaCode = '212';
  final _ownPhoneController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _calendarIdController.dispose();
    _systemPromptController.dispose();
    _ownPhoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final body = <String, dynamic>{
        'name': _nameController.text.trim(),
        'country': 'US',
        'calendar_id': _calendarIdController.text.trim(),
        'phone_strategy': _phoneStrategy,
        'system_prompt': _systemPromptController.text.trim(),
        'staff': <Map<String, dynamic>>[],
      };
      if (_phoneStrategy == 'new') {
        body['area_code'] = _areaCode == 'other' ? '212' : _areaCode;
      } else {
        body['own_phone'] = _ownPhoneController.text.trim();
      }

      final res = await ApiClient.post(
        '/api/mobile/receptionists/create',
        body: body,
      );

      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (mounted) {
          Navigator.of(context).pop(true);
        }
      } else {
        final data = _parseJson(res.body);
        final msg = data['error'] as String? ??
            (res.body.isNotEmpty ? res.body : 'Failed to create receptionist (${res.statusCode})');
        setState(() {
          _error = msg;
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
    return Scaffold(
      appBar: AppBar(title: const Text('Create Receptionist')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Receptionist Name',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _calendarIdController,
              decoration: const InputDecoration(
                labelText: 'Calendar ID (email or "primary")',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 16),
            const Text('Phone number', style: TextStyle(fontWeight: FontWeight.w500)),
            Row(
              children: [
                Expanded(
                  child: RadioListTile<String>(
                    title: const Text('New number'),
                    value: 'new',
                    groupValue: _phoneStrategy,
                    onChanged: (v) => setState(() => _phoneStrategy = v!),
                  ),
                ),
                Expanded(
                  child: RadioListTile<String>(
                    title: const Text('Bring your own'),
                    value: 'own',
                    groupValue: _phoneStrategy,
                    onChanged: (v) => setState(() => _phoneStrategy = v!),
                  ),
                ),
              ],
            ),
            if (_phoneStrategy == 'new') ...[
              DropdownButtonFormField<String>(
                value: _areaCode,
                decoration: const InputDecoration(
                  labelText: 'Area code',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: '212', child: Text('212 (New York)')),
                  DropdownMenuItem(value: '310', child: Text('310 (LA)')),
                  DropdownMenuItem(value: '415', child: Text('415 (SF)')),
                  DropdownMenuItem(value: '617', child: Text('617 (Boston)')),
                  DropdownMenuItem(value: 'other', child: Text('Other')),
                ],
                onChanged: (v) => setState(() => _areaCode = v ?? '212'),
              ),
            ] else ...[
              TextFormField(
                controller: _ownPhoneController,
                decoration: const InputDecoration(
                  labelText: 'Phone (E.164 e.g. +15551234567)',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  if (_phoneStrategy != 'own') return null;
                  if (v == null || v.trim().isEmpty) return 'Required';
                  return null;
                },
              ),
            ],
            const SizedBox(height: 16),
            TextFormField(
              controller: _systemPromptController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'System prompt',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Create Receptionist'),
            ),
          ],
        ),
      ),
    );
  }
}
