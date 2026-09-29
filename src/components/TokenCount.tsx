import { useTranslation } from 'react-i18next';
import { formatTokenCount } from '@/lib/tokenFormat';

interface TokenCountProps {
  value?: number;
  className?: string;
}

export default function TokenCount({ value, className = '' }: TokenCountProps) {
  const { t } = useTranslation();
  const count = formatTokenCount(value);
  if (!count) return null;
  return (
    <span className={`token-count inline-flex min-w-0 items-center ${className}`} title={t('cards.tokens', { count })}>
      {count}
    </span>
  );
}
