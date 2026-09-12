import { nutritionBenefitTotal, summarizeNutritionEntitlement } from './nutrition-entitlement.util';

describe('nutrition entitlement', () => {
  it('reads nutrition and inbody benefits from subscriptions', () => {
    const subscriptions = [
      { benefits: { nutritionSessions: 3, inBody: 1 }, inbodyCount: 0 },
      { benefits: null, inbodyCount: 2 },
    ];
    expect(nutritionBenefitTotal(subscriptions, 'nutrition_session')).toBe(3);
    expect(nutritionBenefitTotal(subscriptions, 'inbody')).toBe(3);
  });

  it('separates used, reserved and remaining credit', () => {
    expect(summarizeNutritionEntitlement(4, [
      { status: 'completed', restored: false },
      { status: 'no_show', restored: false },
      { status: 'confirmed', restored: false },
      { status: 'cancelled', restored: false },
    ])).toEqual({ total: 4, used: 2, reserved: 1, remaining: 1 });
  });

  it('does not consume a restored no-show', () => {
    expect(summarizeNutritionEntitlement(1, [
      { status: 'no_show', restored: true },
    ])).toEqual({ total: 1, used: 0, reserved: 0, remaining: 1 });
  });
});