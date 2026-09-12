export type NutritionEntitlementKey = 'nutrition_session' | 'inbody';

type SubscriptionBenefitSource = {
  benefits: unknown;
  inbodyCount?: number | null;
};

type BookingConsumption = {
  status: string;
  restored: boolean;
};

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export function nutritionBenefitTotal(
  subscriptions: SubscriptionBenefitSource[],
  key: NutritionEntitlementKey,
): number {
  return subscriptions.reduce((total, subscription) => {
    const benefits = subscription.benefits && typeof subscription.benefits === 'object'
      ? subscription.benefits as Record<string, unknown>
      : {};
    if (key === 'nutrition_session') return total + numberValue(benefits.nutritionSessions);
    return total + numberValue(benefits.inBody ?? subscription.inbodyCount);
  }, 0);
}

export function summarizeNutritionEntitlement(total: number, bookings: BookingConsumption[]) {
  const effective = bookings.filter((booking) => !booking.restored);
  const used = effective.filter((booking) => ['completed', 'no_show'].includes(booking.status)).length;
  const reserved = effective.filter((booking) => ['pending', 'confirmed'].includes(booking.status)).length;
  return { total, used, reserved, remaining: Math.max(0, total - used - reserved) };
}