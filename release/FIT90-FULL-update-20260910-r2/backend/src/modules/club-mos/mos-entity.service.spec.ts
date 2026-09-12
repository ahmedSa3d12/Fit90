import { BadRequestException } from '@nestjs/common';
import { MosEntityService } from './mos-entity.service';

const user = {
  sub: 15,
  level: 1,
  emp_code: 9,
  branch: 2,
  man_women_type: 0,
  name: 'مدير النظام',
  image: null,
};

describe('MosEntityService.convertLead', () => {
  it('creates a member from the lead, defaults an absent gender, and marks the lead converted', async () => {
    const lead = {
      id: 7,
      name: 'أحمد فاروق',
      phone: '01012345678',
      email: 'ahmed@example.com',
      gender: null,
      source_id: 3,
      branch_id: 2,
      status: 'new',
      notes: 'طلب متابعة',
      assigned_to: 12,
      is_deleted: false,
    };
    let memberInput: Record<string, unknown> | undefined;
    let leadUpdate: Record<string, unknown> | undefined;
    const prisma = {
      club_leads: {
        findFirst: jest.fn().mockResolvedValue(lead),
      },
    };
    const members = {
      create: jest.fn().mockImplementation(async (input, _user, afterCreate) => {
        memberInput = input;
        await afterCreate({
          club_leads: {
            update: async (args: Record<string, unknown>) => {
              leadUpdate = args;
            },
          },
        }, { id: 55 });
        return { member: { id: 55, memberCode: 'MIG-22630' } };
      }),
    };
    const service = new MosEntityService(prisma as any, members as any);

    await expect(service.convertLead(7, user)).resolves.toEqual({
      member: { id: 55, memberCode: 'MIG-22630' },
    });
    expect(memberInput).toMatchObject({
      branchId: 2,
      name: 'أحمد فاروق',
      phone: '01012345678',
      email: 'ahmed@example.com',
      gender: 'male',
      sourceId: 3,
      salesId: 12,
      notes: 'طلب متابعة',
      autoCreateUser: true,
    });
    expect(leadUpdate).toEqual({ where: { id: 7 }, data: { status: 'converted' } });
  });

  it('rejects a lead without a phone before creating a member', async () => {
    const prisma = {
      club_leads: {
        findFirst: jest.fn().mockResolvedValue({ id: 8, name: 'بدون هاتف', phone: null, is_deleted: false }),
      },
    };
    const members = { create: async () => { throw new Error('must not create a member'); } };
    const service = new MosEntityService(prisma as any, members as any);

    await expect(service.convertLead(8, user)).rejects.toEqual(new BadRequestException('LEAD_PHONE_REQUIRED'));
  });

  it('reserves the converted status for the conversion endpoint', async () => {
    const savedLead = { id: 9, name: 'Lead', follow_up_at: null, is_deleted: false };
    const update = jest.fn().mockResolvedValue(savedLead);
    const create = jest.fn().mockResolvedValue(savedLead);
    const reminders = { findFirst: jest.fn().mockResolvedValue(null) };
    const prisma = {
      club_leads: {
        findFirst: jest.fn().mockResolvedValue({ id: 9, name: 'Lead', is_deleted: false }),
      },
      $transaction: jest.fn().mockImplementation((work) => work({
        club_leads: { create, update },
        club_reminders: reminders,
      })),
    };
    const service = new MosEntityService(prisma as any, {} as any);

    await expect(service.create('leads', { name: 'Lead', status: 'converted' }))
      .rejects.toEqual(new BadRequestException('LEAD_STATUS_MANAGED_BY_CONVERSION'));
    await expect(service.update('leads', 9, { status: 'converted' }))
      .rejects.toEqual(new BadRequestException('LEAD_STATUS_MANAGED_BY_CONVERSION'));
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not return converted leads in the potential-members list', async () => {
    const allLeads = [
      { id: 1, name: 'Converted', status: 'converted', is_deleted: false },
      { id: 2, name: 'New', status: 'new', is_deleted: false },
    ];
    const listMatchingWhere = jest.fn((args: { where: { status?: string | { not: string } } }) => {
      const status = args.where.status;
      return Promise.resolve(allLeads.filter((lead) =>
        typeof status === 'object' ? lead.status !== status.not : !status || lead.status === status,
      ));
    });
    const countMatchingWhere = jest.fn(async (args: { where: { status?: string | { not: string } } }) => {
      const rows = await listMatchingWhere(args);
      return rows.length;
    });
    const prisma = { club_leads: { findMany: listMatchingWhere, count: countMatchingWhere } };
    const service = new MosEntityService(prisma as any, {} as any);

    const result = await service.list('leads', { page: 1, pageSize: 10, skip: 0, take: 10 } as any);

    expect(result.data).toEqual([{ id: 2, name: 'New', status: 'new' }]);
  });
});
