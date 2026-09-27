import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import '@/styles/pixel.css';

const pixelCardVariants = cva('px-card', {
  variants: {
    // 纯黑白阅读版:accent 保留 API 兼容,实际不再配色
    accent: {
      none: '',
      active: 'border-t-2 border-t-zinc-100',
      blue: '',
      violet: '',
      emerald: '',
      amber: '',
      rose: '',
      cyan: '',
      orange: '',
      fuchsia: '',
    },
  },
  defaultVariants: { accent: 'none' },
});

export interface PixelCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof pixelCardVariants> {
  hover?: boolean;
}

function PixelCard({ className, accent, hover, ...props }: PixelCardProps) {
  return (
    <div
      className={cn(pixelCardVariants({ accent }), hover && 'px-card-hover', className)}
      {...props}
    />
  );
}

function PixelCardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pb-2', className)} {...props} />;
}

function PixelCardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('pixel-font text-[11px] text-zinc-100', className)} {...props} />;
}

function PixelCardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-2', className)} {...props} />;
}

function PixelCardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center gap-2 border-t border-zinc-800 p-3', className)} {...props} />
  );
}

export { PixelCard, PixelCardHeader, PixelCardTitle, PixelCardContent, PixelCardFooter };
