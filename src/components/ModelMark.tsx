import { useEffect } from 'react';
import { parseModel } from '@/lib/modelBrand';
import { ensureProviderSprite } from '@/lib/providerSprite';

interface ModelMarkProps {
  model?: string;
  provider?: string;
  className?: string;
}

/** 厂商图标 + 型号 — 原生模型名。图标来自 lobehub/icons（与 pi-web 同款）。 */
export default function ModelMark({ model, provider, className = '' }: ModelMarkProps) {
  const brand = parseModel(model, provider);
  const title = brand.raw ? `${brand.short} — ${brand.raw}` : brand.short;

  useEffect(() => {
    ensureProviderSprite();
  }, []);

  return (
    <span className={`model-mark ${className}`} title={title}>
      {brand.iconId ? (
        <svg className="model-mark__icon" aria-hidden viewBox="0 0 24 24">
          <use href={`#${brand.iconId}`} />
        </svg>
      ) : null}
      {brand.raw ? (
        <span className="model-mark__id">{brand.raw}</span>
      ) : (
        <span className="model-mark__id">{brand.short}</span>
      )}
    </span>
  );
}
