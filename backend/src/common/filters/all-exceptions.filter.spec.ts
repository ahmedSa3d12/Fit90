import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  it('translates a coded booking error from the Accept-Language header', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host: any = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'accept-language': 'en-US,en;q=0.9' } }),
        getResponse: () => ({ status, json }),
      }),
    };

    new AllExceptionsFilter().catch(
      new ConflictException({ code: 'APPOINTMENT_CAPACITY_FULL', message: 'العدد اكتمل، اختر موعدًا آخر.' }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'APPOINTMENT_CAPACITY_FULL',
      message: 'Capacity is full. Please choose another appointment.',
    });
  });

  it('identifies a duplicate member phone instead of returning a generic value', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host: any = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
        getResponse: () => ({ status, json }),
      }),
    };

    new AllExceptionsFilter().catch(
      new Prisma.PrismaClientKnownRequestError('duplicate phone', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['phone'] },
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'رقم الهاتف مُسجّل لعضو آخر',
    });
  });
});
