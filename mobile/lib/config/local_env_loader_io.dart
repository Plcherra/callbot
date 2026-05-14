import 'dart:io';

Future<Map<String, String>> loadLocalEnv() async {
  final seen = <String>{};
  final candidates = <File>[];
  final roots = <Directory>[
    Directory.current,
    File(Platform.resolvedExecutable).parent,
  ];

  for (final root in roots) {
    var dir = root;
    for (var i = 0; i < 12; i++) {
      for (final path in [
        '${dir.path}/.env.local',
        '${dir.path}/../.env.local',
      ]) {
        if (seen.add(path)) candidates.add(File(path));
      }
      final parent = dir.parent;
      if (parent.path == dir.path) break;
      dir = parent;
    }
  }

  for (final file in candidates) {
    if (await file.exists()) {
      try {
        return _parseEnv(await file.readAsString());
      } on FileSystemException {
        continue;
      }
    }
  }
  return const {};
}

Map<String, String> _parseEnv(String text) {
  final values = <String, String>{};
  for (final rawLine in text.split('\n')) {
    final line = rawLine.trim();
    if (line.isEmpty || line.startsWith('#') || !line.contains('=')) continue;
    final index = line.indexOf('=');
    final key = line.substring(0, index).trim();
    var value = line.substring(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    if (key.isNotEmpty) values[key] = value;
  }
  return values;
}
