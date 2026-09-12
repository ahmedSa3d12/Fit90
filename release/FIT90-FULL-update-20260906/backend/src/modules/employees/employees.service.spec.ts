import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
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
});
