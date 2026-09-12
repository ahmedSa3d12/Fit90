import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface JournalInput {
  subscriptionNumber: string;
  paidAmount: number;
  subscriptionValue: number;
  discountValue: number;
  discountEnabled: boolean;
  paymentMethod?: string;
  branchId: number;
  createdBy?: number;
  registrationDate?: string;
  kind?: 'subscription' | 'payment' | 'renewal' | 'refund' | 'transfer';
  sourceDocId?: string;
}

/**
 * Subscription payment ledger poster.
 *
 * The general-ledger / accounting module is not part of the FIT90 product, so GL posting and
 * reversal are no-ops. The class + public method signatures are kept so the subscription,
 * refund and receipt services continue to compile and call it unchanged; receipts/refunds are
 * still recorded by those services themselves.
 */
@Injectable()
export class ClubSubscriptionAccountingService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async reverseReceiptEntry(
    _sourceDocId: string,
    _reason: string,
    _postedBy?: number,
    _tx?: Tx,
  ): Promise<void> {
    // GL reversal intentionally removed with the accounting module.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async postJournal(_input: JournalInput, _tx?: Tx): Promise<void> {
    // GL posting intentionally removed with the accounting module.
  }
}
