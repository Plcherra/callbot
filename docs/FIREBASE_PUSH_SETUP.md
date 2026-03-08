# Firebase Setup for Push Notifications

Incoming call push notifications require Firebase Cloud Messaging (FCM).

## 1. Firebase Console Setup

1. **Create or use a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com).

2. **Enable Cloud Messaging**:
   - Project Settings → Cloud Messaging
   - Cloud Messaging API (V1) must be enabled (Legacy FCM is deprecated).

3. **Add your apps**:
   - **Android**: Add app with package name (e.g. `com.echodesk.mobile`). Download `google-services.json` → place in `mobile/android/app/`.
   - **iOS**: Add app with bundle ID. Download `GoogleService-Info.plist` → add to `mobile/ios/Runner/`.
   - Run `flutterfire configure` to regenerate `firebase_options.dart` if needed.

## 2. Service Account (Backend FCM)

For the backend to send FCM pushes:

1. Firebase Console → Project Settings → Service accounts.
2. Click **Generate new private key**.
3. Save the JSON file.
4. Set `FIREBASE_SERVICE_ACCOUNT_KEY` to the **entire JSON string** (as a single line or escaped):

   ```bash
   # Backend .env or .env.local
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project",...}
   ```

5. When set, the backend sends FCM directly. When not set, it falls back to the Next.js internal API (which uses `FIREBASE_SERVICE_ACCOUNT_KEY` in the web app env).

## 3. Next.js (Fallback)

If using the Next.js fallback for FCM (when backend doesn't have Firebase):

1. Same service account JSON as above.
2. Set `FIREBASE_SERVICE_ACCOUNT_KEY` in your Next.js environment (e.g. `.env.local`).

## 4. Flutter App

1. **FCM token registration**: The app registers the FCM token with `POST /api/mobile/push-token` after login. Ensure the user is authenticated.

2. **Permissions**:
   - **iOS**: Add push notification capability in Xcode. Request permission at runtime.
   - **Android**: `POST_NOTIFICATIONS` permission (Android 13+). The app requests it on init.

3. **Background handler**: `_firebaseMessagingBackgroundHandler` must be a top-level function. It handles `incoming_call` and `call_ended` when the app is in the background or terminated.

## 5. FCM Data Payload

**Incoming call**:
```json
{
  "type": "incoming_call",
  "call_sid": "...",
  "caller": "+15551234567",
  "receptionist_id": "uuid",
  "receptionist_name": "Salon ABC"
}
```

**Call ended**:
```json
{
  "type": "call_ended",
  "call_sid": "...",
  "receptionist_id": "uuid",
  "receptionist_name": "Salon ABC"
}
```

## 6. Troubleshooting

- **No push received**: Verify FCM token is registered (`user_push_tokens` in Supabase). Check that the user has an active session when the token is saved.
- **Background not working**: Ensure `FirebaseMessaging.onBackgroundMessage` is set before `runApp()`. The handler must be top-level.
- **Android channel**: The app creates `echodesk_calls` channel. Notifications use high priority.
