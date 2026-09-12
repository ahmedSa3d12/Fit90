import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdditionalServicesService } from './additional-services.service';

describe('AdditionalServicesService', () => {
  let prisma: any;
  let tx: any;
  let service: AdditionalServicesService;

  beforeEach(() => {
    tx = {
      club_class_schedule_slots: { findUnique: jest.fn() },
      club_services: { findMany: jest.fn() },
      club_class_additional_services: { findMany: jest.fn() },
      club_slot_additional_services: {
        updateMany: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
    };
    prisma = {
      club_classes: { findFirst: jest.fn() },
      club_services: { findFirst: jest.fn() },
      club_class_additional_services: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    service = new AdditionalServicesService(prisma);
  });

  it('يربط خدمة بكلاس', async () => {
    prisma.club_classes.findFirst.mockResolvedValue({ id: 1 });
    prisma.club_services.findFirst.mockResolvedValue({ id: 2, is_active: true });
    prisma.club_class_additional_services.findUnique.mockResolvedValue(null);
    prisma.club_class_additional_services.create.mockResolvedValue({ id: 3 });
    await expect(
      service.addToClass(1, { serviceId: 2, isRequired: false, isActive: true }),
    ).resolves.toMatchObject({ id: 3 });
  });

  it('يرفض تكرار ربط الخدمة', async () => {
    prisma.club_classes.findFirst.mockResolvedValue({ id: 1 });
    prisma.club_services.findFirst.mockResolvedValue({ id: 2, is_active: true });
    prisma.club_class_additional_services.findUnique.mockResolvedValue({ id: 3 });
    await expect(
      service.addToClass(1, { serviceId: 2, isRequired: false, isActive: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('يعد خدمة على موعد باستخدام upsert', async () => {
    tx.club_class_schedule_slots.findUnique.mockResolvedValue({
      id: 5,
      monthly_schedule: { status: 'draft', class_id: 1 },
    });
    tx.club_services.findMany.mockResolvedValue([{ id: 2 }]);
    tx.club_class_additional_services.findMany.mockResolvedValue([
      { service_id: 2, is_required: false },
    ]);
    tx.club_slot_additional_services.findMany.mockResolvedValue([]);
    await service.setSlotServices(5, [
      { serviceId: 2, capacity: 4, isRequired: false, isActive: true },
    ]);
    expect(tx.club_slot_additional_services.upsert).toHaveBeenCalledTimes(1);
  });

  it('يرفض خدمة غير مرتبطة بالكلاس', async () => {
    tx.club_class_schedule_slots.findUnique.mockResolvedValue({
      id: 5,
      monthly_schedule: { status: 'draft', class_id: 1 },
    });
    tx.club_services.findMany.mockResolvedValue([{ id: 2 }]);
    tx.club_class_additional_services.findMany.mockResolvedValue([]);
    await expect(
      service.setSlotServices(5, [
        { serviceId: 2, capacity: 4, isRequired: false, isActive: true },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
