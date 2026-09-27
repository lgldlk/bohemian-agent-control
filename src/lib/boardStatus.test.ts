import { describe, expect, it } from 'vitest';
import { iconStatus, resolveStatusAxes } from './boardStatus';

describe('resolveStatusAxes', () => {
  it('keeps process, TUI activity, and session record on separate axes', () => {
    expect(resolveStatusAxes({
      processState: 'running',
      activity: null,
      record: 'completed',
    })).toEqual({ process: 'live', activity: 'unknown', record: 'completed' });

    expect(resolveStatusAxes({
      processState: 'running',
      activity: 'idle',
      record: 'pending',
    })).toEqual({ process: 'live', activity: 'idle', record: 'pending' });
  });

  it('does not invent TUI activity from a live process or a pending record', () => {
    const axes = resolveStatusAxes({ processState: 'running', activity: null, record: 'pending' });
    expect(axes.activity).toBe('unknown');
    expect(axes.process).toBe('live');
    expect(axes.record).toBe('pending');
  });

  it('keeps a provider running record, and ignores paused', () => {
    expect(resolveStatusAxes({ record: 'running' }).record).toBe('running');
    expect(resolveStatusAxes({ record: 'paused' }).record).toBe('unknown');
  });
});

describe('iconStatus', () => {
  it('does not call an open terminal a running task', () => {
    expect(iconStatus(resolveStatusAxes({
      processState: 'running',
      activity: null,
      record: 'completed',
    }))).toBe('idle');
  });

  it('does not use the API running overlay as task activity', () => {
    expect(iconStatus(resolveStatusAxes({ record: 'running' }))).toBe('unknown');
  });

  it('shows running only when the Agent reports a task in progress', () => {
    expect(iconStatus(resolveStatusAxes({
      processState: 'running',
      activity: 'working',
      record: 'completed',
    }))).toBe('running');
  });

  it('keeps an idle agent idle even if the API record says running', () => {
    expect(iconStatus(resolveStatusAxes({
      processState: 'running',
      activity: 'idle',
      record: 'running',
    }))).toBe('idle');
  });

  it('stays idle when the agent says it is idle', () => {
    expect(iconStatus(resolveStatusAxes({
      processState: 'running',
      activity: 'idle',
      record: 'completed',
    }))).toBe('idle');
  });

  it('leaves a session completed when it has no running terminal', () => {
    expect(iconStatus(resolveStatusAxes({
      processState: null,
      record: 'completed',
    }))).toBe('completed');
    expect(iconStatus(resolveStatusAxes({
      processState: 'exited',
      record: 'completed',
    }))).toBe('completed');
  });

  it('treats provider running as an observed record, not activity', () => {
    expect(resolveStatusAxes({ record: 'running' }).record).toBe('running');
  });

  it('keeps a placeholder pending only when no process has been observed', () => {
    expect(iconStatus(resolveStatusAxes({ record: 'pending' }))).toBe('pending');
  });

  it('does not treat process exit as deletion', () => {
    expect(iconStatus(resolveStatusAxes({
      processState: 'exited',
      record: 'completed',
    }))).not.toBe('deleted');
  });
});
