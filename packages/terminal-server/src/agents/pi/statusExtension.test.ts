import { describe, expect, it } from 'vitest';
import { PI_STATUS_EXTENSION_SOURCE } from './statusExtension';

describe('pi status extension', () => {
  it('publishes session and prompt lifecycle changes', () => {
    expect(PI_STATUS_EXTENSION_SOURCE).toContain("pi.on('session_start'");
    expect(PI_STATUS_EXTENSION_SOURCE).toContain("pi.on('ui_prompt_start'");
    expect(PI_STATUS_EXTENSION_SOURCE).toContain("pi.on('ui_prompt_end'");
    expect(PI_STATUS_EXTENSION_SOURCE).toContain('postEndOnce()');
    expect(PI_STATUS_EXTENSION_SOURCE).toContain("enqueue('working')");
    expect(PI_STATUS_EXTENSION_SOURCE).toContain("pi.on('session_shutdown'");
  });
});
