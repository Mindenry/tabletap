import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-[0.5px] select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-ink text-paper shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_6px_16px_-10px_rgba(25,23,18,0.6)] hover:bg-ink-soft',
        brand: 'bg-brand text-white hover:bg-brand-deep shadow-[0_8px_20px_-14px_rgba(184,83,46,0.9)]',
        secondary: 'bg-surface text-ink hairline hover:bg-paper-deep',
        ghost: 'text-ink-soft hover:bg-paper-deep hover:text-ink',
        danger: 'bg-danger text-white hover:bg-[#8f2f23]',
        outline: 'border border-line-strong bg-transparent text-ink hover:bg-paper-deep',
        subtle: 'bg-brand-soft text-brand-deep hover:bg-[#f0d8cc]',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'h-9 w-9',
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
