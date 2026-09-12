import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toArabicDigits } from '@/lib/utils';
import { useClubT } from '@/hooks/use-club-t';
import type { ClubSubscriptionListItem } from '@/types/club';

export function SubscriptionInvoicePrint({
  open,
  onOpenChange,
  subscription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: ClubSubscriptionListItem | null;
}) {
  const ct = useClubT();
  const printRef = useRef<HTMLDivElement>(null);

  const print = () => {
    if (!printRef.current || !subscription) return;
    const w = window.open('', '_blank', 'width=480,height=720');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>${subscription.subscriptionNumber}</title>
      <style>body{font-family:system-ui;padding:20px;font-size:14px}.nums{font-variant-numeric:tabular-nums}
      .header{text-align:center;margin-bottom:16px;border-bottom:2px solid #111;padding-bottom:12px}
      table{width:100%;margin:12px 0}td{padding:6px 0;border-bottom:1px solid #eee}.total{font-size:18px;font-weight:bold}</style>
      </head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  if (!subscription) return null;

  const net = subscription.subscriptionValue - (subscription.discountEnabled ? subscription.discountValue : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ct('subscriptions.invoiceTitle')}</DialogTitle>
        </DialogHeader>
        <div ref={printRef} className="space-y-3 text-sm">
          <div className="header text-center">
            <p className="text-xl font-bold">FIT90</p>
            <p className="text-muted-foreground">{ct('subscriptions.invoiceSubtitle')}</p>
            <p className="nums mt-2 font-semibold">{toArabicDigits(subscription.subscriptionNumber)}</p>
          </div>
          <table>
            <tbody>
              <tr><td>{ct('subscriptions.customerName')}</td><td className="text-end">{subscription.customerName ?? '—'}</td></tr>
              <tr><td>{ct('subscriptions.subscriptionType')}</td><td className="text-end">{subscription.subscriptionType ?? '—'}</td></tr>
              <tr><td>{ct('subscriptions.startDate')}</td><td className="nums text-end">{toArabicDigits(subscription.subscriptionStartDate)}</td></tr>
              <tr><td>{ct('subscriptions.endDate')}</td><td className="nums text-end">{toArabicDigits(subscription.subscriptionEndDate)}</td></tr>
              <tr><td>{ct('subscriptions.registrationDate')}</td><td className="nums text-end">{toArabicDigits(subscription.registrationDate)}</td></tr>
              <tr><td>{ct('subscriptions.subscriptionValue')}</td><td className="nums text-end">{toArabicDigits(subscription.subscriptionValue.toFixed(2))}</td></tr>
              {subscription.discountEnabled ? (
                <tr><td>{ct('subscriptions.discount')}</td><td className="nums text-end">-{toArabicDigits(subscription.discountValue.toFixed(2))}</td></tr>
              ) : null}
              <tr><td>{ct('subscriptions.netValue')}</td><td className="nums text-end">{toArabicDigits(net.toFixed(2))}</td></tr>
              <tr><td>{ct('subscriptions.paidAmount')}</td><td className="nums text-end">{toArabicDigits(subscription.paidAmount.toFixed(2))}</td></tr>
              <tr><td>{ct('subscriptions.remainingAmount')}</td><td className="nums text-end">{toArabicDigits(subscription.remainingAmount.toFixed(2))}</td></tr>
              {subscription.paymentMethod ? (
                <tr><td>{ct('subscriptions.paymentMethod')}</td><td className="text-end">{subscription.paymentMethod}</td></tr>
              ) : null}
            </tbody>
          </table>
          <p className="text-center text-xs text-muted-foreground">{ct('subscriptions.invoiceFooter')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ct('common.cancel')}</Button>
          <Button onClick={print}>{ct('common.print')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
