import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../utils/call_formatters.dart';
import '../../widgets/constrained_scaffold_body.dart';

class CallDetailScreen extends StatelessWidget {
  final String receptionistId;
  final String callId;
  final Map<String, dynamic>? callData;

  const CallDetailScreen({
    super.key,
    required this.receptionistId,
    required this.callId,
    this.callData,
  });

  @override
  Widget build(BuildContext context) {
    final call = callData;
    if (call == null) {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.pop(),
          ),
        ),
        body: const Center(child: Text('Call not found')),
      );
    }

    final start = call['started_at'] != null
        ? DateTime.tryParse(call['started_at'] as String)
        : null;
    final dur = call['duration_seconds'] as int?;
    final transcript = (call['transcript'] as String?)?.trim();
    final fromNumber = call['from_number'] as String? ?? '';
    final toNumber = call['to_number'] as String? ?? '';
    final outcome = callOutcomeLabel(call);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('Call details'),
        actions: [
          if (fromNumber.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.copy),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: fromNumber));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Number copied')),
                );
              },
              tooltip: 'Copy number',
            ),
        ],
      ),
      body: constrainedScaffoldBody(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          children: [
            _DetailRow(label: 'Date & time', value: formatCallTimestamp(start)),
            _DetailRow(label: 'Duration', value: formatCallDuration(dur)),
            _DetailRow(label: 'Outcome', value: outcome),
            if (fromNumber.isNotEmpty)
              _DetailRow(
                label: 'From',
                value: fromNumber,
                onTap: () => _copyAndNotify(context, fromNumber),
              ),
            if (toNumber.isNotEmpty)
              _DetailRow(
                label: 'To',
                value: toNumber,
                onTap: () => _copyAndNotify(context, toNumber),
              ),
            if (transcript != null && transcript.isNotEmpty) ...[
              const SizedBox(height: 24),
              Text(
                'Transcript',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SelectableText(
                  transcript,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _copyAndNotify(BuildContext context, String text) {
    Clipboard.setData(ClipboardData(text: text));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Copied')),
      );
    }
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback? onTap;

  const _DetailRow({
    required this.label,
    required this.value,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final child = Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    );

    if (onTap != null) {
      return InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: child,
      );
    }
    return child;
  }
}
