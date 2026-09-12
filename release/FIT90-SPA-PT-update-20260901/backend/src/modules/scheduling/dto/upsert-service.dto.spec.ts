import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertServiceDto } from './upsert-service.dto';

describe('UpsertServiceDto entitlementKey', () => {
  it.each(['nutrition_session', 'inbody'])(
    'accepts supported entitlement key %s',
    async (entitlementKey) => {
      const dto = plainToInstance(UpsertServiceDto, { entitlementKey });
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it('rejects an unsupported entitlement key', async () => {
    const dto = plainToInstance(UpsertServiceDto, { entitlementKey: 'anything' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'entitlementKey')).toBe(true);
  });
});