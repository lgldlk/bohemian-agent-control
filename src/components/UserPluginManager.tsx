import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FolderOpen, Github, Power, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import {
  getUserPluginLoadState,
  localizedUserPluginText,
  useUserPluginManager,
  type InstalledUserPluginDto,
} from '@/plugin-system/user-plugins';

export function UserPluginManager() {
  const { t, i18n } = useTranslation();
  const [githubUrl, setGithubUrl] = useState('');
  const [trusted, setTrusted] = useState(false);
  const manager = useUserPluginManager();

  const install = async () => {
    if (!githubUrl.trim() || !trusted || manager.busy) return;
    if (await manager.install(githubUrl.trim())) {
      setGithubUrl('');
      setTrusted(false);
    }
  };

  const toggle = async (plugin: InstalledUserPluginDto) => {
    await manager.toggle(plugin);
  };

  const remove = async (plugin: InstalledUserPluginDto) => {
    const name = localizedUserPluginText(plugin.manifest.name, i18n.resolvedLanguage ?? i18n.language, plugin.id);
    if (!window.confirm(t('settings.pluginManager.removeConfirm', { name }))) return;
    await manager.remove(plugin.id);
  };

  const language = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="space-y-5">
      <section className="rounded-[10px] border border-zinc-800 bg-[#101014] p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center border border-zinc-700 bg-zinc-950 text-zinc-300">
            <Github className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-zinc-200">{t('settings.pluginManager.githubTitle')}</div>
            <p className="mt-1 text-[10px] leading-4 text-zinc-600">{t('settings.pluginManager.githubHint')}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            type="url"
            value={githubUrl}
            onChange={(event) => setGithubUrl(event.target.value)}
            placeholder="https://github.com/owner/repository"
            aria-label={t('settings.pluginManager.githubUrl')}
            className="min-w-0 border border-zinc-700 bg-[#08080b] px-3 py-2.5 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-zinc-400"
          />
          <button
            type="button"
            onClick={() => void install()}
            disabled={!githubUrl.trim() || !trusted || Boolean(manager.busy)}
            className="flex min-h-9 items-center justify-center gap-2 whitespace-nowrap border border-zinc-300 bg-zinc-100 px-3 text-[10px] text-zinc-950 hover:bg-white active:translate-y-px disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
          >
            {manager.busy === 'install' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {manager.busy === 'install' ? t('settings.pluginManager.installing') : t('settings.pluginManager.install')}
          </button>
        </div>
        <label className="mt-3 flex items-start gap-2 border-t border-zinc-800 pt-3 text-[10px] leading-4 text-amber-200/70">
          <input
            type="checkbox"
            checked={trusted}
            onChange={(event) => setTrusted(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-200"
          />
          <span>{t('settings.pluginManager.trustWarning')}</span>
        </label>
      </section>

      {manager.error ? (
        <div role="alert" className="flex items-start gap-2 rounded-[10px] border border-red-900/70 bg-red-950/30 px-3 py-2.5 text-[10px] leading-4 text-red-300">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {manager.error}
        </div>
      ) : null}
      {manager.reloadRequired ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-amber-800/70 bg-amber-950/20 px-3 py-2.5 text-[10px] text-amber-200">
          <span className="flex-1">{t('settings.pluginManager.reloadRequired')}</span>
          <button type="button" onClick={() => window.location.reload()} className="flex items-center gap-1.5 border border-amber-700 px-2 py-1.5 hover:border-amber-300 active:translate-y-px">
            <RefreshCw className="h-3 w-3" />
            {t('settings.pluginManager.reloadNow')}
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <div className="text-[12px] font-medium text-zinc-200">{t('settings.pluginManager.installed')}</div>
            <div className="mt-1 flex max-w-full items-center gap-1.5 font-mono text-[9px] text-zinc-700" title={manager.storageRoot}>
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="truncate">{manager.storageRoot}</span>
            </div>
          </div>
          <span className="border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[9px] tabular-nums text-zinc-600">
            {manager.plugins.length}
          </span>
        </div>
        {manager.busy === 'loading' ? (
          <div className="space-y-2">
            {[0, 1].map((item) => <div key={item} className="h-24 animate-pulse rounded-[10px] border border-zinc-800 bg-zinc-900/40" />)}
            <span className="sr-only">{t('settings.pluginManager.loading')}</span>
          </div>
        ) : null}
        {!manager.busy && manager.plugins.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-zinc-800 px-4 py-8 text-center text-[10px] leading-5 text-zinc-600">
            {t('settings.pluginManager.empty')}
          </div>
        ) : null}
        <div className="grid gap-2 2xl:grid-cols-2">
          {manager.plugins.map((plugin) => {
          const name = localizedUserPluginText(plugin.manifest.name, language, plugin.id);
          const description = localizedUserPluginText(plugin.manifest.description, language, '');
          const loadState = getUserPluginLoadState(plugin.id);
          return (
            <article key={plugin.id} className="space-y-3 rounded-[10px] border border-zinc-800 bg-[#101014] p-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[12px] text-zinc-100">{name}</span>
                    <span className="font-mono text-[10px] text-zinc-600">{plugin.id} · v{plugin.manifest.version}</span>
                  </div>
                  {description ? <p className="mt-1 text-[11px] leading-5 text-zinc-500">{description}</p> : null}
                  <a
                    href={`https://github.com/${plugin.source.owner}/${plugin.source.repository}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[10px] text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300"
                  >
                    {plugin.source.owner}/{plugin.source.repository} · {plugin.source.commit.slice(0, 7)}
                  </a>
                </div>
                <span className={`shrink-0 border px-2 py-1 text-[9px] uppercase ${plugin.enabled ? 'border-zinc-500 bg-zinc-100 text-zinc-950' : 'border-zinc-800 text-zinc-600'}`}>
                  {plugin.enabled ? t('settings.pluginManager.enabled') : t('settings.pluginManager.disabled')}
                </span>
              </div>
              {plugin.manifest.permissions.length ? (
                <p className="text-[10px] leading-4 text-zinc-600">
                  {t('settings.pluginManager.permissions')}: {plugin.manifest.permissions.join(', ')}
                </p>
              ) : null}
              {loadState?.status === 'failed' ? (
                <p role="alert" className="text-[10px] leading-4 text-red-400">
                  {t('settings.pluginManager.loadFailed')}: {loadState.error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  disabled={Boolean(manager.busy)}
                  onClick={() => void toggle(plugin)}
                  className="flex items-center gap-1.5 border border-zinc-700 px-2 py-1.5 text-[10px] text-zinc-300 hover:border-zinc-400 active:translate-y-px disabled:text-zinc-600"
                >
                  <Power className="h-3 w-3" />
                  {plugin.enabled ? t('settings.pluginManager.disable') : t('settings.pluginManager.enable')}
                </button>
                <button
                  type="button"
                  disabled={Boolean(manager.busy)}
                  onClick={() => void remove(plugin)}
                  className="flex items-center gap-1.5 border border-red-950 px-2 py-1.5 text-[10px] text-red-400 hover:border-red-700 active:translate-y-px disabled:text-zinc-600"
                >
                  <Trash2 className="h-3 w-3" />
                  {t('settings.pluginManager.remove')}
                </button>
              </div>
            </article>
          );
          })}
        </div>
      </div>
    </div>
  );
}
