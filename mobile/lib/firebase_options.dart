// File generated from existing GoogleService-Info.plist and google-services.json.
// Run `flutterfire configure` (requires Firebase CLI) to regenerate from Firebase Console.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'DefaultFirebaseOptions have not been configured for web - '
        'reconfigure by running the FlutterFire CLI again.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return ios; // Reuse iOS config for macOS desktop
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBgRHbALnfAeEbPS-vQyP_R2GJnlasWNt4',
    appId: '1:106939181070:android:e5661f14d2b032fd7d745f',
    messagingSenderId: '106939181070',
    projectId: 'echodesk-73e57',
    storageBucket: 'echodesk-73e57.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyA5G3BXYNFzMzKu1sWz0h1_z313yLAPxTk',
    appId: '1:106939181070:ios:513e627fd98631e97d745f',
    messagingSenderId: '106939181070',
    projectId: 'echodesk-73e57',
    storageBucket: 'echodesk-73e57.firebasestorage.app',
    iosBundleId: 'com.echodesk.mobile',
  );
}
