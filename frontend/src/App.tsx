import { useEffect } from 'react';
import { AppRouter } from '@/app/router';
import { BrandLogo, LOGO_SRC } from '@/components/brand/logo';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

export function App() {
  const { bootstrap, status } = useAuth();
  const { ui } = useLocale();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#170B0B]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src={LOGO_SRC} alt="" className="login-logo-float h-16 w-16 rounded-2xl bg-white p-1.5 shadow-lg" />
          <BrandLogo size="sm" showText className="[&_div]:text-white" />
          <p className="text-sm text-white/50">{ui('جاري التحميل…')}</p>
        </div>
      </div>
    );
  }

  return <AppRouter />;
}
