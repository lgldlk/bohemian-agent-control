import { useCallback, useEffect, useState } from 'react';
import {
  installUserPluginFromGitHub,
  listUserPlugins,
  removeUserPlugin,
  setUserPluginEnabled,
} from './client';
import type { InstalledUserPluginDto } from './contracts';

let reloadRequiredForCurrentAppSession = false;

function sortPlugins(plugins: InstalledUserPluginDto[]): InstalledUserPluginDto[] {
  return [...plugins].sort((a, b) => a.id.localeCompare(b.id));
}

function upsertPlugin(
  plugins: InstalledUserPluginDto[],
  updated: InstalledUserPluginDto,
): InstalledUserPluginDto[] {
  const next = plugins.filter((plugin) => plugin.id !== updated.id);
  next.push(updated);
  return sortPlugins(next);
}

export function useUserPluginManager() {
  const [plugins, setPlugins] = useState<InstalledUserPluginDto[]>([]);
  const [storageRoot, setStorageRoot] = useState('~/.bohemian-agent-control/plugins');
  const [busy, setBusy] = useState<string | null>('loading');
  const [error, setError] = useState('');
  const [reloadRequired, setReloadRequired] = useState(reloadRequiredForCurrentAppSession);

  const markReloadRequired = useCallback(() => {
    reloadRequiredForCurrentAppSession = true;
    setReloadRequired(true);
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await listUserPlugins(signal);
    setPlugins(sortPlugins(response.plugins));
    setStorageRoot(response.storageRoot);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setBusy('loading');
    setError('');
    void refresh(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(null);
      });
    return () => controller.abort();
  }, [refresh]);

  const install = useCallback(async (url: string): Promise<boolean> => {
    if (busy) return false;
    setBusy('install');
    setError('');
    try {
      const installed = await installUserPluginFromGitHub(url);
      setPlugins((current) => upsertPlugin(current, installed));
      markReloadRequired();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(null);
    }
  }, [busy, markReloadRequired]);

  const toggle = useCallback(async (plugin: InstalledUserPluginDto): Promise<void> => {
    if (busy) return;
    setBusy(plugin.id);
    setError('');
    try {
      const updated = await setUserPluginEnabled(plugin.id, !plugin.enabled);
      setPlugins((current) => upsertPlugin(current, updated));
      markReloadRequired();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [busy, markReloadRequired]);

  const remove = useCallback(async (pluginId: string): Promise<void> => {
    if (busy) return;
    setBusy(pluginId);
    setError('');
    try {
      await removeUserPlugin(pluginId);
      setPlugins((current) => current.filter((plugin) => plugin.id !== pluginId));
      markReloadRequired();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [busy, markReloadRequired]);

  return {
    plugins,
    storageRoot,
    busy,
    error,
    reloadRequired,
    install,
    toggle,
    remove,
  };
}
