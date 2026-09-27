import sprite from '@/assets/provider-icons.svg?raw';

let ready = false;

/** Inject the shared lobehub/provider sprite once. Used by ModelMark + AgentMark. */
export function ensureProviderSprite() {
  if (ready || typeof document === 'undefined') return;
  ready = true;
  if (document.getElementById('provider-icon-sprite')) return;
  const wrap = document.createElement('div');
  wrap.id = 'provider-icon-sprite';
  wrap.setAttribute('hidden', '');
  wrap.innerHTML = sprite;
  document.body.appendChild(wrap);
}
