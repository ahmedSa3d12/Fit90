import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { useUi } from '@/store/locale';
import { SELECT_CLS } from '../club/fitness/shared';

type CatalogService = {
  id: number;
  name: string;
  price: string;
  status: 'active' | 'inactive';
};

export function SpaAdditionalServicesAdmin() {
  const ui = useUi();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: services = [], isFetching } = useQuery({
    queryKey: ['admin-additional-services'],
    queryFn: async () => (await api.get<CatalogService[]>('/admin/additional-services?status=all')).data,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-additional-services'] });
  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPrice('');
    setStatus('active');
  };
  const save = async () => {
    if (!name.trim() || price === '' || Number(price) < 0) return;
    setSaving(true);
    try {
      if (editingId == null) {
        await api.post('/admin/additional-services', {
          name: name.trim(),
          price: Number(price),
          durationMin: 60,
          isActive: status === 'active',
        });
        toast.success(ui('تم حفظ الخدمة الإضافية'));
      } else {
        const original = services.find((service) => service.id === editingId);
        await api.patch(`/admin/additional-services/${editingId}`, {
          name: name.trim(),
          price: Number(price),
          durationMin: 60,
        });
        if (original && original.status !== status) {
          await api.patch(`/admin/additional-services/${editingId}/status`, { status });
        }
        toast.success(ui('تم تعديل الخدمة الإضافية'));
      }
      resetForm();
      await refresh();
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };

  const toggle = async (service: CatalogService) => {
    try {
      await api.patch(`/admin/additional-services/${service.id}/status`, {
        status: service.status === 'active' ? 'inactive' : 'active',
      });
      await refresh();
    } catch (error) { toast.error(apiError(error)); }
  };

  const startEdit = (service: CatalogService) => {
    setEditingId(service.id);
    setName(service.name);
    setPrice(String(service.price));
    setStatus(service.status);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteService = async (service: CatalogService) => {
    if (!window.confirm(ui(`هل تريد حذف الخدمة الإضافية «${service.name}»؟`))) return;
    setDeletingId(service.id);
    try {
      await api.delete(`/admin/additional-services/${service.id}`);
      if (editingId === service.id) resetForm();
      toast.success(ui('تم حذف الخدمة الإضافية'));
      await refresh();
    } catch (error) { toast.error(apiError(error)); } finally { setDeletingId(null); }
  };

  return <div className="space-y-5">
    <Card>
      <CardHeader><CardTitle>{ui(editingId == null ? 'إضافة خدمة إضافية' : 'تعديل خدمة إضافية')}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-4">
        <div className="space-y-1"><Label>{ui('اسم الخدمة')}</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={ui('اسم الخدمة')} /></div>
        <div className="space-y-1"><Label>{ui('السعر')}</Label><Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></div>
        <div className="space-y-1"><Label>{ui('الحالة')}</Label><select className={SELECT_CLS} value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'inactive')}><option value="active">{ui('مفعل')}</option><option value="inactive">{ui('غير مفعل')}</option></select></div>
        <div className="flex self-end gap-2"><Button className="flex-1" disabled={saving || !name.trim() || price === '' || Number(price) < 0} onClick={() => void save()}>{ui(editingId == null ? 'حفظ' : 'حفظ التعديل')}</Button>{editingId != null && <Button variant="outline" disabled={saving} onClick={resetForm}>{ui('إلغاء')}</Button>}</div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>{ui('جدول الخدمات الإضافية')}</CardTitle></CardHeader>
      <CardContent>
        {isFetching ? <div className="p-8 text-center text-muted-foreground">{ui('جارٍ التحميل...')}</div>
          : services.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{ui('لا توجد خدمات إضافية')}</div>
            : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm">
              <thead className="bg-muted/60"><tr>{['اسم الخدمة', 'السعر', 'الحالة', 'الإجراءات'].map((heading) => <th key={heading} className="p-3 text-start">{ui(heading)}</th>)}</tr></thead>
              <tbody>{services.map((service) => <tr key={service.id} className="border-t">
                <td className="p-3 font-semibold">{service.name}</td>
                <td className="p-3">{Number(service.price).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="p-3"><StatusBadge status={service.status === 'active' ? 'active' : 'expired'} label={ui(service.status === 'active' ? 'مفعل' : 'غير مفعل')} /></td>
                <td className="p-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void toggle(service)}>{ui(service.status === 'active' ? 'تعطيل' : 'تفعيل')}</Button><Button size="sm" variant="outline" onClick={() => startEdit(service)}>{ui('تعديل')}</Button><Button size="sm" variant="destructive" disabled={deletingId === service.id} onClick={() => void deleteService(service)}>{ui('حذف')}</Button></div></td>
              </tr>)}</tbody>
            </table></div>}
      </CardContent>
    </Card>
  </div>;
}
