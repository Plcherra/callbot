// Call service for background call handling.
// Shows native CallKit (iOS) / ConnectionService (Android) UI for call alerts.

import 'package:flutter_callkit_incoming/entities/android_params.dart';
import 'package:flutter_callkit_incoming/entities/call_event.dart';
import 'package:flutter_callkit_incoming/entities/call_kit_params.dart';
import 'package:flutter_callkit_incoming/entities/ios_params.dart';
import 'package:flutter_callkit_incoming/entities/notification_params.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';

class CallService {
  static final CallService _instance = CallService._();
  factory CallService() => _instance;

  CallService._();

  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;

    FlutterCallkitIncoming.onEvent.listen(_onCallKitEvent);
    _initialized = true;
  }

  void _onCallKitEvent(CallEvent? event) {
    if (event == null) return;
    switch (event.event) {
      case Event.actionCallIncoming:
        // Incoming call shown
        break;
      case Event.actionCallStart:
        break;
      case Event.actionCallAccept:
        break;
      case Event.actionCallDecline:
        break;
      case Event.actionCallEnded:
        break;
      case Event.actionCallTimeout:
        break;
      case Event.actionCallCallback:
        break;
      default:
        break;
    }
  }

  /// Show incoming call UI when backend pushes call alert.
  /// The AI has already answered - this is for staff awareness.
  Future<void> handlePushCallEvent(
    String type,
    String? callSid,
    String? receptionistName,
  ) async {
    if (callSid == null || callSid.isEmpty) return;

    if (type == 'incoming_call') {
      await showIncomingCallUI(
        callId: callSid,
        callerName: receptionistName ?? 'Incoming call',
        callerNumber: '',
      );
    } else if (type == 'call_ended') {
      await endCall(callSid);
    }
  }

  /// Display native incoming call UI (CallKit on iOS, custom on Android).
  Future<void> showIncomingCallUI({
    required String callId,
    required String callerName,
    required String callerNumber,
  }) async {
    try {
      final params = CallKitParams(
        id: callId,
        nameCaller: callerName,
        appName: 'Echodesk',
        avatar: '',
        handle: callerNumber,
        type: 0, // Audio
        textAccept: 'Accept',
        textDecline: 'Decline',
        missedCallNotification: const NotificationParams(
          showNotification: true,
          isShowCallback: false,
          subtitle: 'Missed call',
          callbackText: 'Call back',
        ),
        duration: 30000,
        extra: <String, dynamic>{'call_sid': callId},
        headers: <String, dynamic>{},
        android: const AndroidParams(
          isCustomNotification: false,
          ringtonePath: 'system_ringtone_default',
          backgroundColor: '#0955fa',
          actionColor: '#4CAF50',
        ),
        ios: const IOSParams(
          iconName: 'CallKitLogo',
          handleType: 'generic',
          supportsVideo: false,
          maximumCallGroups: 1,
          maximumCallsPerCallGroup: 1,
          audioSessionMode: 'default',
          audioSessionActive: true,
          audioSessionPreferredSampleRate: 44100.0,
          audioSessionPreferredIOBufferDuration: 0.005,
          supportsDTMF: false,
          supportsHolding: false,
          supportsGrouping: false,
          supportsUngrouping: false,
          ringtonePath: 'system_ringtone_default',
        ),
      );

      await FlutterCallkitIncoming.showCallkitIncoming(params);
    } catch (e) {
      if (e.toString().contains('CallKit')) {
        // CallKit requires real device
      }
    }
  }

  /// End a call by id.
  Future<void> endCall(String callId) async {
    try {
      await FlutterCallkitIncoming.endCall(callId);
    } catch (_) {}
  }

  /// End all active calls.
  Future<void> endAllCalls() async {
    try {
      await FlutterCallkitIncoming.endAllCalls();
    } catch (_) {}
  }

  /// Start outbound call UI (optional - for future VoIP).
  Future<void> startOutgoingCall({
    required String callId,
    required String handle,
    String? name,
  }) async {
    try {
      final params = CallKitParams(
        id: callId,
        nameCaller: name ?? handle,
        handle: handle,
        type: 0,
        extra: <String, dynamic>{'call_sid': callId},
        android: const AndroidParams(isCustomNotification: false),
        ios: const IOSParams(handleType: 'phone'),
      );
      await FlutterCallkitIncoming.startCall(params);
    } catch (_) {}
  }
}
