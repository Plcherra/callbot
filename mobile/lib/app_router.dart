import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/landing/landing_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/signup_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'screens/receptionists/receptionists_screen.dart';
import 'screens/receptionists/receptionist_detail_screen.dart';
import 'screens/receptionists/receptionist_settings_screen.dart';
import 'screens/receptionists/create_receptionist_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/settings/edit_business_screen.dart';
import 'screens/checkout/checkout_screen.dart';
import 'screens/help/help_screen.dart';
import 'screens/call/active_call_screen.dart';
import 'screens/calls/call_history_screen.dart';
import 'screens/calls/call_detail_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

GoRouter createAppRouter() {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/',
    redirect: (context, state) async {
      final session = Supabase.instance.client.auth.currentSession;
      final isLoggedIn = session != null;
      final isLanding = state.matchedLocation == '/' ||
          state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/signup');
      final isAuthRoute = state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/signup');

      if (!isLoggedIn && !isLanding) {
        return '/';
      }
      if (isLoggedIn && isAuthRoute) {
        return '/dashboard';
      }
      if (isLoggedIn && state.matchedLocation == '/') {
        return '/dashboard';
      }
      // Redirect to onboarding if not yet complete (allowlist: onboarding, settings, checkout, help, call)
      if (isLoggedIn) {
        final loc = state.matchedLocation;
        final allowlist = loc == '/onboarding' ||
            loc.startsWith('/settings') ||
            loc.startsWith('/checkout') ||
            loc == '/help' ||
            loc.startsWith('/call/');
        if (!allowlist) {
          try {
            final user = Supabase.instance.client.auth.currentUser;
            if (user != null) {
              final res = await Supabase.instance.client
                  .from('users')
                  .select('onboarding_completed_at')
                  .eq('id', user.id)
                  .maybeSingle();
              final completedAt = res?['onboarding_completed_at'] as String?;
              final onboardingComplete =
                  (completedAt ?? '').trim().isNotEmpty;
              if (!onboardingComplete) {
                return '/onboarding';
              }
            }
          } catch (_) {
            // On error (e.g. network), don't block navigation
          }
        }
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const LandingScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/signup',
        builder: (context, state) => SignupScreen(
          planId: state.uri.queryParameters['plan'],
        ),
      ),
      GoRoute(
        path: '/dashboard',
        builder: (context, state) => const DashboardScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: '/receptionists',
        builder: (context, state) => const ReceptionistsScreen(),
      ),
      GoRoute(
        path: '/receptionists/create',
        builder: (context, state) => const CreateReceptionistScreen(),
      ),
      GoRoute(
        path: '/receptionists/:id',
        builder: (context, state) => ReceptionistDetailScreen(
          receptionistId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/receptionists/:id/calls',
        builder: (context, state) => CallHistoryScreen(
          receptionistId: state.pathParameters['id']!,
          receptionistName: state.uri.queryParameters['name'],
        ),
      ),
      GoRoute(
        path: '/receptionists/:id/calls/:callId',
        builder: (context, state) => CallDetailScreen(
          receptionistId: state.pathParameters['id']!,
          callId: state.pathParameters['callId']!,
          callData: state.extra as Map<String, dynamic>?,
        ),
      ),
      GoRoute(
        path: '/receptionists/:id/settings',
        builder: (context, state) => ReceptionistSettingsScreen(
          receptionistId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/settings/business-edit',
        builder: (context, state) => const EditBusinessScreen(),
      ),
      GoRoute(
        path: '/checkout',
        builder: (context, state) => CheckoutScreen(
          planId: state.uri.queryParameters['plan'] ?? 'starter',
        ),
      ),
      GoRoute(
        path: '/help',
        builder: (context, state) => const HelpScreen(),
      ),
      GoRoute(
        path: '/call/:callSid',
        builder: (context, state) {
          final callSid = state.pathParameters['callSid'] ?? '';
          final receptionistId = state.uri.queryParameters['receptionist_id'] ?? '';
          final caller = state.uri.queryParameters['caller'] ?? '';
          return ActiveCallScreen(
            callSid: callSid,
            receptionistId: receptionistId,
            caller: caller,
          );
        },
      ),
    ],
  );
}
