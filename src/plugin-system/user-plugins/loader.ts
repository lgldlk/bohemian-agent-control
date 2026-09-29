import * as React from 'react';
import type { BoardPlugin } from '@/board/plugins/types';
import { installBoardPluginTranslations } from '@/board/plugins/i18n';
import { registerBoardPlugin } from '@/board/plugins/registry';
import { listUserPlugins } from './client';
import type { InstalledUserPluginDto } from './contracts';

export interface UserPluginHostSdk {
  apiVersion: 1;
  React: typeof React;
}

export type UserPluginLoadState =
  | { status: 'loaded' }
  | { status: 'failed'; error: string };

const loadStates = new Map<string, UserPluginLoadState>();

function isBoardPlugin(value: unknown): value is BoardPlugin {
  if (!value || typeof value !== 'object') return false;
  const plugin = value as Partial<BoardPlugin>;
  return typeof plugin.id === 'string'
    && typeof plugin.version === 'string'
    && typeof plugin.titleKey === 'string';
}

async function instantiatePlugin(module: Record<string, unknown>): Promise<unknown> {
  const exported = module.default ?? module.createPlugin ?? module.plugin;
  if (typeof exported !== 'function') return exported;
  const sdk: UserPluginHostSdk = Object.freeze({ apiVersion: 1, React });
  return exported(sdk);
}

async function loadUserPlugin(plugin: InstalledUserPluginDto): Promise<void> {
  if (!plugin.entryUrl.startsWith(`/api/plugins/${encodeURIComponent(plugin.id)}/files/`)) {
    throw new Error('Plugin entry URL is outside its managed directory');
  }
  const module = await import(/* @vite-ignore */ plugin.entryUrl) as Record<string, unknown>;
  const candidate = await instantiatePlugin(module);
  if (!isBoardPlugin(candidate)) throw new Error('Plugin entry did not export a valid BoardPlugin');
  if (candidate.id !== plugin.id || candidate.version !== plugin.manifest.version) {
    throw new Error('Plugin bundle id or version does not match plugin.json');
  }
  registerBoardPlugin(candidate);
  installBoardPluginTranslations(candidate);
}

export async function loadEnabledUserPlugins(): Promise<void> {
  loadStates.clear();
  let plugins: InstalledUserPluginDto[];
  try {
    plugins = (await listUserPlugins()).plugins;
  } catch (error) {
    console.error('[user-plugins] unable to read installed plugins', error);
    return;
  }
  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    try {
      await loadUserPlugin(plugin);
      loadStates.set(plugin.id, { status: 'loaded' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown plugin load error';
      loadStates.set(plugin.id, { status: 'failed', error: message });
      console.error(`[user-plugin:${plugin.id}] failed to load`, error);
    }
  }
}

export function getUserPluginLoadState(id: string): UserPluginLoadState | undefined {
  return loadStates.get(id);
}
