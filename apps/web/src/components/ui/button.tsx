import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.97] transition-transform duration-100',
  {
    variants: {
      variant: {
        default: 'bg-ink text-ground hover:bg-ink-hover shadow-sm',
        quiet: 'border border-line-strong bg-transparent text-ink hover:bg-ground-2',
        ghost: 'hover:bg-ground-2 text-ink',
        link: 'text-ink underline-offset-4 hover:underline p-0 h-auto',
        held: 'bg-held text-ground hover:bg-held-ink',
      },
      size: {
        default: 'h-11 px-5 py-2 text-base rounded-[2px]',
        sm: 'h-9 px-3 text-sm rounded-[2px]',
        lg: 'h-12 px-8 text-lg rounded-[2px]',
        icon: 'h-10 w-10 rounded-[2px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
