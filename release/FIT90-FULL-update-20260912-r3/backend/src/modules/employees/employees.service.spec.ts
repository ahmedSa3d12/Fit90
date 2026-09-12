import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  it('includes the employee job field in the list response independently from the job title', async () => {
    const prisma: any = {
      employees: {
        findMany: jest.fn().mockResolvedValue([{
          id: 26,
          emp_code: 1026,
          employee: 'ahmed hussen',
          employment_type: 'sales',
          mosma_wazefy_n: 'أخصائي مبيعات',
          employee_type: 1,
        }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new EmployeesService(prisma, { resolveListFilter: () => null } as never);

    const result = await service.list({ page: 1, pageSize: 25, skip: 0, take: 25, order: 'desc' });

    expect(result.data[0]).toEqual(expect.objectContaining({
      employment_type: 'sales',
      mosma_wazefy_n: 'أخصائي مبيعات',
    }));
    expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ employment_type: true }),
    }));
  });

  it('does not add a newly saved trainer-titled employee to the trainer directory', async () => {
    const trainerRows: Array<Record<string, unknown>> = [];
    const prisma = {
      employees: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 42, emp_code: 2001 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 42,
          employee: 'Nada Elsayed',
          email: null,
          phone: '01012345678',
          personal_photo: null,
          mosma_wazefy_n: 'مدرب لياقة',
          employee_type: 1,
          leave_emp: 0,
        }),
      },
      department_jobs: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'مدرب لياقة' }),
      },
      club_trainers: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => {
          trainerRows.push(data);
          return { id: 1, ...data };
        }),
        update: jest.fn(),
      },
    };
    const service = new EmployeesService(prisma as never, {} as never);

    await service.create({
      job_title_id_fk: '1',
      emp_code: '2001',
      emp_name: 'Nada Elsayed',
      branch_id_fk: '1',
      jwal: '01012345678',
      emp_type: '1',
      mosma_wazefy_n: 'مدرب لياقة',
      employee_type: '1',
    });

    expect(trainerRows).toEqual([]);
  });

  it('does not add an edited trainer-titled employee to the trainer directory', async () => {
    const trainerRows: Array<Record<string, unknown>> = [];
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({
          id: 42,
          employee: 'Nada Elsayed',
          email: null,
          phone: '01012345678',
          personal_photo: null,
          mosma_wazefy_n: 'أخصائي تغذية',
          employee_type: 1,
          leave_emp: 0,
        }),
        update: jest.fn(),
      },
      department_jobs: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'أخصائي تغذية' }),
      },
      club_trainers: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => {
          trainerRows.push(data);
          return { id: 1, ...data };
        }),
        update: jest.fn(),
      },
      users: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new EmployeesService(prisma as never, {} as never);

    await service.update(42, {
      job_title_id_fk: '1',
      emp_name: 'Nada Elsayed',
      branch_id_fk: '1',
      jwal: '01012345678',
      emp_type: '1',
      mosma_wazefy_n: 'أخصائي تغذية',
      employee_type: '1',
    });

    expect(trainerRows).toEqual([]);
  });

  it('updates the linked login account when an employee changes username or password', async () => {
    const linkedUser = {
      user_id: 37,
      emp_code: 42,
      username: 'nada.old',
      email: 'old@example.test',
      image: null,
    };
    const users = {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.emp_code === 42 ? linkedUser : null,
      ),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ user_id: 99 }),
    };
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({ personal_photo: null, email: 'nada@example.test' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      api_users: { findFirst: jest.fn().mockResolvedValue(null) },
      users,
      rbac_roles: { findUnique: jest.fn().mockResolvedValue({ id: 4 }) },
      rbac_user_roles: { deleteMany: jest.fn(), create: jest.fn() },
    };
    const service = new EmployeesService(prisma as never, {} as never);

    await (service as any).provisionUser(
      42,
      'Nada Elsayed',
      '01012345678',
      1,
      4,
      { username: 'nada.new', password: 'NewPass1' },
    );

    expect(users.create).not.toHaveBeenCalled();
    expect(users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 37 },
        data: expect.objectContaining({ username: 'nada.new', emp_code: 42 }),
      }),
    );
  });
});
