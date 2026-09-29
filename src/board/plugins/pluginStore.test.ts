import { afterEach, describe, expect, it } from 'vitest';
import {
  boardPluginPanelKey,
  closeBoardPluginPage,
  getActiveBoardPluginId,
  getActiveBoardPluginPageId,
  openBoardPluginPage,
  parseBoardPluginPanelKey,
  resetBoardPluginUiForTests,
  toggleBoardPlugin,
} from './pluginStore';

afterEach(() => resetBoardPluginUiForTests());

describe('board plugin panel key', () => {
  it('round-trips plugin and panel ids containing separators', () => {
    const key = boardPluginPanelKey('vendor:usage', 'overview:daily');
    expect(parseBoardPluginPanelKey(key)).toEqual(['vendor:usage', 'overview:daily']);
  });

  it('rejects malformed keys', () => {
    expect(parseBoardPluginPanelKey(null)).toBeNull();
    expect(parseBoardPluginPanelKey('vendor:usage:overview')).toBeNull();
    expect(parseBoardPluginPanelKey('["only-one"]')).toBeNull();
  });

  it('keeps plugin pages independent from core app views', () => {
    const pageId = boardPluginPanelKey('token-usage', 'dashboard');
    openBoardPluginPage(pageId);
    expect(getActiveBoardPluginPageId()).toBe(pageId);
    expect(getActiveBoardPluginId()).toBeNull();
    closeBoardPluginPage();
    expect(getActiveBoardPluginPageId()).toBeNull();
  });

  it('closes an active plugin page when a panel opens', () => {
    openBoardPluginPage(boardPluginPanelKey('token-usage', 'dashboard'));
    toggleBoardPlugin(boardPluginPanelKey('example', 'panel'));
    expect(getActiveBoardPluginPageId()).toBeNull();
    expect(getActiveBoardPluginId()).toBe(boardPluginPanelKey('example', 'panel'));
  });
});
