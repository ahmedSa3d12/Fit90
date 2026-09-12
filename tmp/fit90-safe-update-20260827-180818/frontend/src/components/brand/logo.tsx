import { cn } from '@/lib/utils';



const LOGO_SRC = '/fit90-logo.jpg';



interface BrandLogoProps {

  size?: 'sm' | 'md' | 'lg' | 'xl';

  showText?: boolean;

  className?: string;

  imageClassName?: string;

  variant?: 'default' | 'on-dark' | 'sidebar';

}



const SIZES = {

  sm: 'h-9 w-9',

  md: 'h-11 w-11',

  lg: 'h-16 w-16',

  xl: 'h-24 w-24',

};



export function BrandLogo({

  size = 'md',

  showText = true,

  className,

  imageClassName,

  variant = 'default',

}: BrandLogoProps) {

  if (variant === 'sidebar') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <img
          src={LOGO_SRC}
          alt="FIT90"
          className={cn(
            'h-10 w-10 shrink-0 rounded-xl object-contain bg-white p-0.5 shadow-md ring-1 ring-white/15',
            imageClassName,
          )}
        />
        {showText && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold text-white">FIT90</div>
            <div className="truncate text-[9px] font-medium tracking-wider text-white/50">GYM & FITNESS</div>
          </div>
        )}
      </div>
    );
  }



  return (

    <div className={cn('flex items-center gap-3', className)}>

      <img

        src={LOGO_SRC}

        alt="FIT90"

        className={cn(

          'rounded-xl object-contain shadow-md ring-1 ring-black/5',

          SIZES[size],

          imageClassName,

        )}

      />

      {showText && (

        <div className="leading-tight">

          <div className={cn('text-lg font-bold tracking-wide', variant === 'on-dark' ? 'text-white' : 'text-foreground')}>

            FIT90

          </div>

          <div

            className={cn(

              'text-[10px] font-medium tracking-[0.15em]',

              variant === 'on-dark' ? 'text-white/70' : 'text-muted-foreground',

            )}

          >

            GYM &amp; FITNESS HUB

          </div>

        </div>

      )}

    </div>

  );

}



export { LOGO_SRC };

