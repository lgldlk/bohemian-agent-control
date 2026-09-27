import type { TerminalOutputFrame } from './types';

const MAGIC = new Uint8Array([0x42, 0x41, 0x43, 0x31]);
const HEADER_BYTES = 9;

/** Binary transport for terminal output. Metadata is typed JSON; terminal bytes avoid JSON escaping. */
export function encodeTerminalOutputFrame(frame: TerminalOutputFrame): Uint8Array {
  const { data, ...metadata } = frame;
  const header = new TextEncoder().encode(JSON.stringify(metadata));
  const body = new TextEncoder().encode(data);
  const result = new Uint8Array(HEADER_BYTES + header.length + body.length);
  result.set(MAGIC, 0);
  result[4] = 1;
  new DataView(result.buffer).setUint32(5, header.length);
  result.set(header, HEADER_BYTES);
  result.set(body, HEADER_BYTES + header.length);
  return result;
}

export function decodeTerminalOutputFrame(value: ArrayBuffer | Uint8Array): TerminalOutputFrame | null {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.length < HEADER_BYTES || !MAGIC.every((byte, index) => bytes[index] === byte) || bytes[4] !== 1) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(5);
  const headerEnd = HEADER_BYTES + headerLength;
  if (headerEnd > bytes.length) return null;
  try {
    const metadata = JSON.parse(new TextDecoder().decode(bytes.subarray(HEADER_BYTES, headerEnd))) as Omit<TerminalOutputFrame, 'data'>;
    const data = new TextDecoder().decode(bytes.subarray(headerEnd));
    if (!metadata || metadata.terminalId === undefined || metadata.sourceEnd === undefined) return null;
    return { ...metadata, data } as TerminalOutputFrame;
  } catch {
    return null;
  }
}
