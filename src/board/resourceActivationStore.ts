import { useSyncExternalStore } from 'react';
import type { Editor } from 'tldraw';
import type { ResourceActivationPolicy } from './resourceActivationPolicy';

const EMPTY_POLICY: ResourceActivationPolicy = {
  initialized: false,
  smartEnabled: true,
  resourceCount: 0,
  readableIds: new Set(),
  deferredIds: new Set(),
};

type EditorPolicyState = {
  policy: ResourceActivationPolicy;
  listeners: Set<() => void>;
};

const states = new WeakMap<Editor, EditorPolicyState>();

function stateFor(editor: Editor): EditorPolicyState {
  let state = states.get(editor);
  if (!state) {
    state = { policy: EMPTY_POLICY, listeners: new Set() };
    states.set(editor, state);
  }
  return state;
}

function sameIds(left: ReadonlySet<unknown>, right: ReadonlySet<unknown>): boolean {
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

export function publishResourceActivationPolicy(editor: Editor, policy: ResourceActivationPolicy): void {
  const state = stateFor(editor);
  if (
    state.policy.initialized === policy.initialized
    && state.policy.smartEnabled === policy.smartEnabled
    && state.policy.resourceCount === policy.resourceCount
    && sameIds(state.policy.readableIds, policy.readableIds)
    && sameIds(state.policy.deferredIds, policy.deferredIds)
  ) return;
  state.policy = policy;
  for (const listener of [...state.listeners]) listener();
}

export function clearResourceActivationPolicy(editor: Editor): void {
  const state = states.get(editor);
  if (!state) return;
  state.policy = EMPTY_POLICY;
  for (const listener of [...state.listeners]) listener();
  states.delete(editor);
}

export function useResourceActivationPolicy(editor: Editor): ResourceActivationPolicy {
  return useSyncExternalStore(
    (listener) => {
      const state = stateFor(editor);
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    () => stateFor(editor).policy,
    () => EMPTY_POLICY,
  );
}
