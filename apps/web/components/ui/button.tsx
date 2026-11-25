import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonStyles = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink-soft',
        brand: 'bg-brand text-white hover:bg-brand-deep',
        secondary: 'border border-line bg-transparent text-ink hover:border-line-strong hover:bg-paper-deep',
        ghost: 'text-ink-soft hover:bg-paper-deep hover:text-ink',
        danger: 'bg-danger text-white hover:bg-[#74261f]',
        outline: 'border border-line-strong bg-transparent text-ink hover:bg-paper-deep',
        subtle: 'bg-brand-soft text-brand-deep hover:bg-[#edd6ce]',
      },
      size: {
        sm: 'h-8 px-2.5 text-[12px]',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-4 text-[13.5px]',
        icon: 'h-8 w-8',
        none: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export { buttonStyles };
