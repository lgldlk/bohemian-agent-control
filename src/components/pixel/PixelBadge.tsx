import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import '@/styles/pixel.css';

const pixelBadgeVariants = cva('px-badge px-2 py-1 text-[8px]', {
  variants: {
    variant: {
      // 纯黑白:default/primary/success/warn 统一白底黑字,dark/danger 黑底白字
      default: 'bg-zinc-100 text-black',
      primary: 'bg-zinc-100 text-black',
      success: 'bg-zinc-100 text-black',
      warn: 'bg-zinc-100 text-black',
      danger: 'bg-black text-zinc-100',
      dark: 'bg-zinc-800 text-zinc-200',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface PixelBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pixelBadgeVariants> {}

function PixelBadge({ className, variant, ...props }: PixelBadgeProps) {
  return <span className={cn(pixelBadgeVariants({ variant }), className)} {...props} />;
}

export { PixelBadge, pixelBadgeVariants };
