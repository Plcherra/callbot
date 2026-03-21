/// Subscription plan definitions (matches app/lib/plans.ts)
class Plan {
  final String id;
  final String name;
  final int priceCents;
  final int includedMinutes;

  const Plan({
    required this.id,
    required this.name,
    required this.priceCents,
    required this.includedMinutes,
  });

  String get priceLabel =>
      priceCents == 0 ? 'Try free' : '\$${(priceCents / 100).toStringAsFixed(0)}/mo';

  /// Option A tiers (keep in sync with backend stripe_plans / Stripe prices).
  static const List<Plan> publicPlans = [
    Plan(id: 'starter', name: 'Starter', priceCents: 2900, includedMinutes: 300),
    Plan(id: 'growth', name: 'Growth', priceCents: 5900, includedMinutes: 800),
    Plan(id: 'pro', name: 'Pro', priceCents: 9900, includedMinutes: 1800),
    Plan(id: 'payg', name: 'Pay As You Go', priceCents: 0, includedMinutes: 0),
  ];

  static List<Plan> get subscriptionPlans =>
      publicPlans.where((p) => p.id != 'payg').toList();
}
