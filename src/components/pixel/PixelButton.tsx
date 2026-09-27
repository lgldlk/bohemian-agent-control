import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import '@/styles/pixel.css';

const pixelButtonVariants = cva('px-btn box-shadow-margin', {
  variants: {
    variant: {
      default: 'px-btn-default',
      primary: 'px-btn-primary',
      success: 'px-btn-success',
      danger: 'px-btn-danger',
      warn: 'px-btn-warn',
      dark: 'px-btn-dark',
    },
    size: {
      sm: 'h-8 px-3 text-[8px]',
      default: 'h-10 px-4 text-[10px]',
      lg: 'h-12 px-6 text-xs',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface PixelButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof pixelButtonVariants> {}

const PixelButton = React.forwardRef<HTMLButtonElement, PixelButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(pixelButtonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
PixelButton.displayName = 'PixelButton';

export { PixelButton, pixelButtonVariants };
