import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Dumbbell,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { LOGO_SRC } from '@/components/brand/logo';
import { PreferenceToggles } from '@/components/layout/preference-toggles';
import RotatingText from '@/components/ui/rotating-text';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { WorkspaceConfig } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { useTheme } from '@/store/theme';
import './login.css';

type FormValues = { username: string; password: string };

const FEATURES = [
  { icon: Dumbbell, key: 'login.feature1' as const },
  { icon: CalendarDays, key: 'login.feature2' as const },
  { icon: Users, key: 'login.feature3' as const },
] as const;

const ROTATING_KEYS = [
  'login.rotate1',
  'login.rotate2',
  'login.rotate3',
  'login.rotate4',
  'login.rotate5',
  'login.rotate6',
] as const;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t, isRtl } = useLocale();
  const { theme } = useTheme();
  const [showPw, setShowPw] = useState(false);
  const [mounted, setMounted] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        username: z.string().min(1, t('login.usernameRequired')),
        password: z.string().min(1, t('login.passwordRequired')),
      }),
    [t],
  );

  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      await login(values.username, values.password);
      toast.success(t('login.success'));
      try {
        const { data } = await api.get<WorkspaceConfig>('/me/workspace');
        navigate(data.homeRoute, { replace: true });
      } catch {
        navigate('/dashboard', { replace: true });
      }
    } catch (error) {
      toast.error(apiError(error, t('login.error')));
    }
  };

  const copyright = t('login.copyright', { year: new Date().getFullYear() });
  const SubmitArrow = isRtl ? ArrowLeft : ArrowRight;
  const rotatingTexts = useMemo(() => ROTATING_KEYS.map((key) => t(key)), [t]);

  return (
    <main className={cn('login-page', theme === 'light' && 'login-page-light')}>
      <div className="login-shell">
        <div className="login-preferences">
          <PreferenceToggles variant={theme === 'dark' ? 'on-dark' : 'default'} />
        </div>

        <section className="login-hero" aria-label="FIT90">
          <div className="login-hero-texture" aria-hidden="true" />
          <Dumbbell className="login-watermark login-watermark-top" aria-hidden="true" />
          <Dumbbell className="login-watermark login-watermark-bottom" aria-hidden="true" />

          <div
            className={cn(
              'login-hero-content',
              mounted ? 'login-entered' : 'login-before-enter',
            )}
          >
            <div className="login-brand-lockup">
              <div className="login-brand-copy">
                <strong>FIT90</strong>
                <span>GYM &amp; FITNESS HUB</span>
              </div>
              <img src={LOGO_SRC} alt="FIT90" className="login-brand-logo" />
            </div>

            <div className="login-badge">
              <Sparkles className="size-3.5" />
              {t('login.badge')}
            </div>

            <div className="login-hero-copy">
              <h1>
                {t('login.titlePrefix')}{' '}
                <RotatingText
                  texts={rotatingTexts}
                  mainClassName="login-rotate-word"
                  staggerFrom="last"
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '-120%', opacity: 0 }}
                  staggerDuration={isRtl ? 0 : 0.025}
                  splitLevelClassName="overflow-hidden"
                  elementLevelClassName="login-rotate-char"
                  animatePresenceInitial
                  transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                  rotationInterval={2400}
                  splitBy={isRtl ? 'words' : 'characters'}
                  auto
                  loop
                />
              </h1>
              <p>{t('login.subtitle')}</p>
            </div>

            <div className="login-features">
              {FEATURES.map(({ icon: Icon, key }) => (
                <div className="login-feature-card" key={key}>
                  <span>{t(key)}</span>
                  <span className="login-feature-icon">
                    <Icon className="size-[19px]" strokeWidth={1.75} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-form-texture" aria-hidden="true" />
          <div
            className={cn(
              'login-form-card',
              mounted ? 'login-entered' : 'login-before-enter',
            )}
          >
            <div className="login-mobile-logo">
              <img src={LOGO_SRC} alt="FIT90" />
            </div>

            <div className="login-form-heading">
              <h2>{t('login.formTitle')}</h2>
              <p>{t('login.formSubtitle')}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="login-form" noValidate>
              <div className="login-control">
                <Label htmlFor="username">{t('login.username')}</Label>
                <div className="login-input-wrap">
                  <User className="login-input-icon" />
                  <input
                    id="username"
                    autoComplete="username"
                    placeholder={t('login.username')}
                    className={cn('login-field', errors.username && 'login-field-error')}
                    {...register('username')}
                  />
                </div>
                {errors.username && <p role="alert">{errors.username.message}</p>}
              </div>

              <div className="login-control">
                <Label htmlFor="password">{t('login.password')}</Label>
                <div className="login-input-wrap">
                  <Lock className="login-input-icon" />
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={cn('login-field', errors.password && 'login-field-error')}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((value) => !value)}
                    className="login-password-toggle"
                    aria-label={showPw ? t('login.hidePassword') : t('login.showPassword')}
                  >
                    {showPw ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {errors.password && <p role="alert">{errors.password.message}</p>}
              </div>

              <Button
                type="submit"
                variant="brand"
                size="lg"
                className="login-submit group/btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <>
                    {t('login.submit')}
                    <SubmitArrow className="size-5 transition-transform group-hover/btn:translate-x-0.5 rtl:group-hover/btn:-translate-x-0.5" />
                  </>
                )}
              </Button>
            </form>
          </div>

          <p className="login-copyright">{copyright}</p>
        </section>
      </div>
    </main>
  );
}
