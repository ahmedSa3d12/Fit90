import { PrismaClient } from '@prisma/client';

describe('legacy import tracking schema', () => {
  it('exposes delegates for batches and source-record crosswalks', () => {
    const prisma = new PrismaClient() as unknown as Record<string, unknown>;
    expect(prisma.data_import_batches).toBeDefined();
    expect(prisma.data_import_records).toBeDefined();
  });
});
