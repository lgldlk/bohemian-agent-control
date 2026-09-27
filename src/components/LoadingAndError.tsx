import { useTranslation } from 'react-i18next';
import { PixelButton } from '@/components/pixel/PixelButton';

export function LoadingQuest() {
  return (
    <div className="tl-board-loading">
      <div className="tl-board-loading__bricks">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="tl-board-loading__brick" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
      <div className="tl-board-loading__label">
        LOADING<span className="px-blink">_</span>
      </div>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="px-card mx-auto mt-20 max-w-md p-8 text-center">
      <div className="pixel-font mb-3 text-xs text-zinc-100">{t('load.lost')}</div>
      <p className="mb-4 text-sm leading-relaxed text-zinc-400">{message}</p>
      <PixelButton variant="primary" onClick={onRetry}>
        {t('load.retry')}
      </PixelButton>
    </div>
  );
}
