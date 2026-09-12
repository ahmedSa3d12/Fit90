type SubscriptionTypeFormRequirements = {
  nameAr: string;
  nameEn: string;
  durationValue: string;
  price: string;
  packageType?: string;
};

export function hasRequiredSubscriptionTypeFields(form: SubscriptionTypeFormRequirements): boolean {
  return Boolean(
    form.nameAr.trim()
    && form.nameEn.trim()
    && form.durationValue
    && form.price !== '',
  );
}
