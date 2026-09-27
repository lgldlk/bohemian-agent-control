import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { parseAgentKind } from '@/lib/agentBrand';
import { ensureProviderSprite } from '@/lib/providerSprite';

interface AgentMarkProps {
  kind?: string;
  className?: string;
  /** Show the agent name next to the icon. */
  withLabel?: boolean;
}

/** Agent 来源图标（Codex / Claude Code / Pi），与型号图标共用 sprite。 */
export default function AgentMark({ kind, className = '', withLabel = false }: AgentMarkProps) {
  const { t } = useTranslation();
  const brand = parseAgentKind(kind);
  ensureProviderSprite();

  useEffect(() => {
    ensureProviderSprite();
  }, []);

  if (!brand) return null;
  const label = t(brand.labelKey);

  return (
    <span className={`agent-mark ${className}`} title={label} aria-label={label}>
      <svg className="agent-mark__icon" aria-hidden viewBox="0 0 24 24">
        <use href={`#${brand.iconId}`} />
      </svg>
      {withLabel ? <span className="agent-mark__label">{label}</span> : null}
    </span>
  );
}
