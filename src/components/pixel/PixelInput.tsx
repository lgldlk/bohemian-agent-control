import * as React from 'react';
import { cn } from '@/lib/utils';
import '@/styles/pixel.css';

export interface PixelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const PixelInput = React.forwardRef<HTMLInputElement, PixelInputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn('px-input box-shadow-margin px-3 py-2.5 text-sm', className)}
      {...props}
    />
  )
);
PixelInput.displayName = 'PixelInput';

export { PixelInput };
