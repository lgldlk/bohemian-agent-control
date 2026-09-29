import { describe, expect, it, vi } from 'vitest';
import { installNestedTerminalQueryPolicy } from './terminalQueryPolicy';

describe('nested terminal query policy', () => {
  it('suppresses identity queries without intercepting keyboard negotiation', () => {
    const registrations: Array<{
      id: { prefix?: string; final: string };
      callback: (params: (number | number[])[]) => boolean | Promise<boolean>;
      dispose: ReturnType<typeof vi.fn>;
    }> = [];
    const parser = {
      registerCsiHandler(
        id: { prefix?: string; final: string },
        callback: (params: (number | number[])[]) => boolean | Promise<boolean>,
      ) {
        const dispose = vi.fn();
        registrations.push({ id, callback, dispose });
        return { dispose };
      },
    };

    const policy = installNestedTerminalQueryPolicy(parser);

    expect(registrations.map(({ id }) => id)).toEqual([
      { final: 'c' },
      { prefix: '>', final: 'c' },
      { prefix: '>', final: 'q' },
    ]);
    expect(registrations.some(({ id }) => id.final === 'u')).toBe(false);
    expect(registrations[0].callback([])).toBe(true);
    expect(registrations[1].callback([])).toBe(true);
    expect(registrations[2].callback([])).toBe(true);

    policy.dispose();
    expect(registrations.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
  });
});
