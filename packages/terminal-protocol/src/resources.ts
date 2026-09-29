/** Serializable resource identity shared by terminal, host UI, and board projections. */
export type TerminalResourceKind = 'local-file' | 'local-directory' | 'remote-url';

export interface TerminalResourceRef {
  kind: TerminalResourceKind;
  raw: string;
  path?: string;
  url?: string;
  /** A URL safe to persist. Sensitive query values are removed. */
  persistentUrl?: string;
  sensitive?: boolean;
  displayText: string;
  cwd: string;
  line: number | null;
  column: number | null;
  endLine?: number | null;
  endColumn?: number | null;
  terminalId?: string;
  agentKind?: string;
  previewKind?: string;
  mimeType?: string;
}
