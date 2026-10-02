import { useEffect } from 'react';
import { useEditor, useValue } from 'tldraw';
import { useResourcePerformanceSettings } from '@/plugin-system';
import { getResourceActivationPolicy } from './resourceActivationPolicy';
import { clearResourceActivationPolicy, publishResourceActivationPolicy } from './resourceActivationStore';

/** Computes one shared resource policy per editor instead of once per ResourceShape. */
export function ResourceActivationRuntime() {
  const editor = useEditor();
  const settings = useResourcePerformanceSettings();
  const policy = useValue(
    'resource activation policy',
    () => getResourceActivationPolicy(editor, settings),
    [editor, settings.enabled, settings.resourceThreshold],
  );

  useEffect(() => {
    publishResourceActivationPolicy(editor, policy);
  }, [editor, policy]);
  useEffect(() => () => clearResourceActivationPolicy(editor), [editor]);
  return null;
}
