import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface FitnessLedgerPaymentPayload {
  invoiceId: number;
  invoiceNumber: string;
  memberId?: number;
  amount: number;
  branchId: number;
  description?: string;
  invoiceDate?: string;
  createdBy?: number;
}

/**
 * Wellness (InBody/SPA) payment ledger poster.
 *
 * The general-ledger / accounting module is not part of the FIT90 product, so GL posting is a
 * no-op. The class + method signature are kept so ClubWellnessService continues to compile and
 * call it unchanged; invoices are still created/updated by the wellness flow itself.
 */
@Injectable()
export class ClubFitnessLedgerService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async postPayment(_payload: FitnessLedgerPaymentPayload, _tx?: Tx): Promise<void> {
    // GL posting intentionally removed with the accounting module.
  }
}
