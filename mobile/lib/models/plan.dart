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

  static const List<Plan> publicPlans = [
    Plan(id: 'starter', name: 'Starter', priceCents: 6900, includedMinutes: 300),
    Plan(id: 'pro', name: 'Pro', priceCents: 14900, includedMinutes: 800),
    Plan(id: 'business', name: 'Business', priceCents: 24900, includedMinutes: 1500),
    Plan(id: 'payg', name: 'Pay As You Go', priceCents: 0, includedMinutes: 0),
  ];

  static List<Plan> get subscriptionPlans =>
      publicPlans.where((p) => p.id != 'payg').toList();
}
