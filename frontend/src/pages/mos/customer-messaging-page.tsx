import { MessageCircle, Send, UserRound, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import type { ClubMemberListItem } from '@/types/club';

type RecipientMode = 'single' | 'all';

const COPY = {
  ar: {
    title: 'مراسلة العملاء',
    description: 'إرسال رسالة واتساب لعميل محدد أو تجهيز قائمة إرسال لكل العملاء.',
    recipient: 'المستلمون',
    single: 'عميل محدد',
    singleHint: 'ابحثي بالاسم أو كود العضو ثم افتحي محادثة واتساب.',
    all: 'كل العملاء',
    allHint: 'تجهيز قائمة العملاء الذين لديهم أرقام واتساب صالحة وإرسال الرسالة لهم بالتتابع.',
    chooseMember: 'اختيار العميل',
    message: 'نص الرسالة',
    placeholder: 'اكتبي الرسالة هنا... يمكنك استخدام {{name}} لإضافة اسم العميل تلقائيًا.',
    openWhatsapp: 'إرسال واتساب',
    sending: 'جارٍ الإرسال...',
    sent: 'تم إرسال رسالة واتساب بنجاح.',
    sendFailed: 'تعذر إرسال رسالة واتساب.',
    prepareAll: 'تجهيز قائمة كل العملاء',
    preparing: 'جارٍ تجهيز القائمة...',
    currentRecipient: 'العميل الحالي',
    progress: 'تقدم الإرسال',
    markNext: 'تم الإرسال والانتقال للتالي',
    previous: 'السابق',
    completed: 'تم الانتهاء من قائمة الإرسال.',
    invalidPhones: 'عملاء بدون رقم صالح',
    validRecipients: 'عملاء جاهزون للإرسال',
    apiNote: 'يتم الإرسال مباشرة من رقم WhatsApp Business المربوط بالنظام بدون فتح واتساب.',
    memberRequired: 'اختاري العميل أولًا.',
    messageRequired: 'اكتبي نص الرسالة أولًا.',
    invalidPhone: 'لا يوجد رقم هاتف صالح لهذا العميل.',
    popupBlocked: 'تعذر فتح واتساب. اسمحي بالنوافذ المنبثقة ثم حاولي مرة أخرى.',
    emptyList: 'لا يوجد عملاء بأرقام هاتف صالحة.',
    loadFailed: 'تعذر تحميل قائمة العملاء.',
  },
  en: {
    title: 'Customer Messaging',
    description: 'Send a WhatsApp message to one customer or prepare a queue for all customers.',
    recipient: 'Recipients',
    single: 'One customer',
    singleHint: 'Search by name or member code, then open the WhatsApp conversation.',
    all: 'All customers',
    allHint: 'Prepare customers with valid WhatsApp numbers and message them in sequence.',
    chooseMember: 'Choose customer',
    message: 'Message',
    placeholder: 'Write your message... Use {{name}} to insert the customer name automatically.',
    openWhatsapp: 'Send WhatsApp',
    sending: 'Sending...',
    sent: 'WhatsApp message sent successfully.',
    sendFailed: 'Could not send the WhatsApp message.',
    prepareAll: 'Prepare all customers',
    preparing: 'Preparing list...',
    currentRecipient: 'Current customer',
    progress: 'Sending progress',
    markNext: 'Sent — go to next',
    previous: 'Previous',
    completed: 'The sending queue is complete.',
    invalidPhones: 'Customers without a valid number',
    validRecipients: 'Customers ready to message',
    apiNote: 'Messages are sent directly from the WhatsApp Business number connected to the system, without opening WhatsApp.',
    memberRequired: 'Choose a customer first.',
    messageRequired: 'Write the message first.',
    invalidPhone: 'This customer has no valid phone number.',
    popupBlocked: 'WhatsApp could not be opened. Allow pop-ups and try again.',
    emptyList: 'No customers have valid phone numbers.',
    loadFailed: 'Could not load the customer list.',
  },
} as const;

function whatsappPhone(phone: string | null | undefined) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `20${digits.slice(1)}`;
  return digits.length >= 8 ? digits : '';
}

function personalizedMessage(message: string, member: ClubMemberListItem) {
  return message.replace(/\{\{name\}\}/g, member.name);
}

export function MosCustomerMessagingPage() {
  const { locale, t } = useLocale();
  const copy = COPY[locale];
  const [mode, setMode] = useState<RecipientMode>('single');
  const [member, setMember] = useState<ClubMemberListItem | null>(null);
  const [message, setMessage] = useState('');
  const [queue, setQueue] = useState<ClubMemberListItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [loadingAll, setLoadingAll] = useState(false);
  const [sending, setSending] = useState(false);
  const current = queue[queueIndex] ?? null;
  const finished = queue.length > 0 && queueIndex >= queue.length;

  const preview = useMemo(
    () => personalizedMessage(message, mode === 'single' ? member ?? ({ name: copy.single } as ClubMemberListItem) : current ?? ({ name: copy.all } as ClubMemberListItem)),
    [copy.all, copy.single, current, member, message, mode],
  );

  const sendToMember = async (target: ClubMemberListItem | null) => {
    if (!message.trim()) {
      toast.error(copy.messageRequired);
      return;
    }
    if (!target) {
      toast.error(copy.memberRequired);
      return;
    }
    const phone = whatsappPhone(target.phone);
    if (!phone) {
      toast.error(copy.invalidPhone);
      return;
    }
    setSending(true);
    try {
      await api.post('/whatsapp/messages/text', {
        phone,
        message: personalizedMessage(message.trim(), target),
      });
      toast.success(copy.sent);
      if (mode === 'all' && current?.id === target.id) {
        setQueueIndex((value) => Math.min(queue.length, value + 1));
      }
    } catch (error) {
      toast.error(apiError(error, copy.sendFailed));
    } finally {
      setSending(false);
    }
  };

  const prepareAll = async () => {
    if (!message.trim()) {
      toast.error(copy.messageRequired);
      return;
    }
    setLoadingAll(true);
    try {
      const all: ClubMemberListItem[] = [];
      let page = 1;
      let total = 0;
      do {
        const { data } = await api.get<PaginatedResponse<ClubMemberListItem>>('/club-members/select-options', {
          params: { page, pageSize: 200, status: 'all', forSelect: true },
        });
        all.push(...data.data);
        total = data.total;
        page += 1;
      } while (all.length < total);

      const seen = new Set<string>();
      const valid: ClubMemberListItem[] = [];
      let invalid = 0;
      for (const item of all) {
        const phone = whatsappPhone(item.phone);
        if (!phone) {
          invalid += 1;
        } else if (!seen.has(phone)) {
          seen.add(phone);
          valid.push(item);
        }
      }
      setQueue(valid);
      setInvalidCount(invalid);
      setQueueIndex(0);
      if (!valid.length) toast.error(copy.emptyList);
    } catch {
      toast.error(copy.loadFailed);
    } finally {
      setLoadingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} eyebrow={t('nav.mos.extra')} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Card className="border-border/60 shadow-sm">
          <CardHeader><CardTitle>{copy.recipient}</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup value={mode} onValueChange={(value) => setMode(value as RecipientMode)} className="grid gap-3 sm:grid-cols-2">
              <Label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-muted/40">
                <RadioGroupItem value="single" className="mt-1" />
                <UserRound className="mt-0.5 size-5 text-primary" />
                <span><strong className="block">{copy.single}</strong><span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{copy.singleHint}</span></span>
              </Label>
              <Label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-muted/40">
                <RadioGroupItem value="all" className="mt-1" />
                <UsersRound className="mt-0.5 size-5 text-primary" />
                <span><strong className="block">{copy.all}</strong><span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{copy.allHint}</span></span>
              </Label>
            </RadioGroup>

            {mode === 'single' && (
              <div className="grid gap-2"><Label>{copy.chooseMember}</Label><MemberSearchCombobox selectedMember={member} onSelect={setMember} onClear={() => setMember(null)} /></div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="whatsapp-message">{copy.message}</Label>
              <Textarea id="whatsapp-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder={copy.placeholder} rows={7} />
              {message.trim() && <div className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{preview}</div>}
            </div>

            {mode === 'single' ? (
              <Button variant="brand" disabled={sending} onClick={() => void sendToMember(member)}><MessageCircle className="size-4" />{sending ? copy.sending : copy.openWhatsapp}</Button>
            ) : (
              <Button variant="brand" disabled={loadingAll} onClick={() => void prepareAll()}><UsersRound className="size-4" />{loadingAll ? copy.preparing : copy.prepareAll}</Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader><CardTitle>{copy.progress}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-6 text-muted-foreground">{copy.apiNote}</p>
            {mode === 'all' && queue.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl bg-primary/10 p-3"><strong className="block text-xl">{queue.length}</strong><span className="text-xs text-muted-foreground">{copy.validRecipients}</span></div>
                  <div className="rounded-xl bg-muted p-3"><strong className="block text-xl">{invalidCount}</strong><span className="text-xs text-muted-foreground">{copy.invalidPhones}</span></div>
                </div>
                {finished ? <p className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-600">{copy.completed}</p> : current && (
                  <div className="space-y-4 rounded-xl border p-4">
                    <div><span className="text-xs text-muted-foreground">{copy.currentRecipient}</span><p className="font-semibold">{current.name}</p><p className="nums text-sm text-muted-foreground" dir="ltr">{current.phone}</p></div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${((queueIndex + 1) / queue.length) * 100}%` }} /></div>
                    <p className="nums text-xs text-muted-foreground">{queueIndex + 1} / {queue.length}</p>
                    <Button className="w-full" variant="brand" disabled={sending} onClick={() => void sendToMember(current)}><Send className="size-4" />{sending ? copy.sending : copy.openWhatsapp}</Button>
                    <div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={queueIndex === 0} onClick={() => setQueueIndex((value) => Math.max(0, value - 1))}>{copy.previous}</Button><Button variant="outline" onClick={() => setQueueIndex((value) => Math.min(queue.length, value + 1))}>{copy.markNext}</Button></div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
