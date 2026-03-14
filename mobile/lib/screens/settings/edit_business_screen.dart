import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../services/api_client.dart';
import '../../strings.dart';
import '../../widgets/constrained_scaffold_body.dart';

/// Screen to edit business name and address.
/// Loads current values from Supabase, saves via API.
class EditBusinessScreen extends StatefulWidget {
  const EditBusinessScreen({super.key});

  @override
  State<EditBusinessScreen> createState() => _EditBusinessScreenState();
}

class _EditBusinessScreenState extends State<EditBusinessScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _addressController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        setState(() {
          _loadError = AppStrings.sessionExpired;
          _loading = false;
        });
        return;
      }
      final raw = await Supabase.instance.client
          .from('users')
          .select('business_name, business_address')
          .eq('id', user.id)
          .maybeSingle();
      final data = raw is Map<String, dynamic> ? raw : null;
      if (mounted) {
        _nameController.text = (data?['business_name'] as String? ?? '').trim();
        _addressController.text =
            (data?['business_address'] as String? ?? '').trim();
        setState(() {
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = AppStrings.couldNotLoadBusiness;
          _loading = false;
        });
      }
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _saving) return;
    setState(() => _saving = true);
    try {
      final res = await ApiClient.patch(
        '/api/mobile/settings/business',
        body: {
          'business_name': _nameController.text.trim().isEmpty
              ? null
              : _nameController.text.trim(),
          'business_address': _addressController.text.trim().isEmpty
              ? null
              : _addressController.text.trim(),
        },
      );
      if (res.statusCode == 200) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Business details saved')),
          );
          context.pop();
        }
      } else {
        final data = (res.body.isNotEmpty
                ? jsonDecode(res.body) as Map<String, dynamic>?
                : null) ??
            {};
        final err = data['error'] as String? ?? AppStrings.couldNotSaveSettings;
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
        }
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.couldNotSaveSettings)),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Business details'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.pop(),
          ),
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_loadError != null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Business details'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.pop(),
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(_loadError!, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _load,
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Business details'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _saving ? null : () => context.pop(),
        ),
      ),
      body: constrainedScaffoldBody(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Business name',
                  hintText: 'Your business or practice name',
                ),
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _addressController,
                decoration: const InputDecoration(
                  labelText: 'Business address',
                  hintText: 'Street, city, state, zip',
                ),
                maxLines: 2,
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 32),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
