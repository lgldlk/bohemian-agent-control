import { useSyncExternalStore } from 'react';
import type { Task } from '@/types';
import i18n from '@/i18n';
import type { SpaceGroup } from '@/space/spaceStore';
import { projectBoardMembership, type BoardCardRef, type BoardMembership } from './boardMembership';

/**
 * Lightweight canvas-membership snapshot consumed by App and board chrome.
 *
 * This module deliberately has no tldraw runtime imports so the first screen
 * does not pull the canvas/editor bundle into the eager entry chunk.
 */
const EMPTY: BoardCardRef[] = [];
let cards: BoardCardRef[] = EMPTY;
const listeners = new Set<() => void>();

function sameCards(a: readonly BoardCardRef[], b: readonly BoardCardRef[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((card, index) =>
    card.taskId === b[index].taskId &&
    card.groupId === b[index].groupId &&
    card.groupName === b[index].groupName,
  );
}

/** Called by the lazy canvas observer after a document/page change. */
export function publishBoardMembership(next: BoardCardRef[]): void {
  if (sameCards(cards, next)) return;
  cards = next;
  listeners.forEach((listener) => listener());
}

export function subscribeBoardMembership(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function cardsSnapshot(): BoardCardRef[] {
  return cards;
}

export function useBoardMembership(tasks: readonly Task[]): BoardMembership {
  const currentCards = useSyncExternalStore(subscribeBoardMembership, cardsSnapshot, () => EMPTY);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return projectBoardMembership(currentCards, byId, i18n.t('board.ungrouped'));
}

export function useBoardGroups(tasks: readonly Task[]): SpaceGroup[] {
  return useBoardMembership(tasks).groups;
}
