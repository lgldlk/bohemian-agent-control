/**
 * Legacy cleanup for snapshots recorded before identity replies were blocked at
 * the xterm parser. New live output is protected by terminalQueryPolicy.ts.
 */

const DA1_QUERY_ECHO = /(?:\u001b\[)?(?:\?1;2c)+/g;
const DA2_QUERY_ECHO = /(?:\u001b\[>)?(?:0;276;0c)+/g;
const XTVERSION_DCS = /\u001bP>\|xterm\.js\([^)]*\)(?:\u001b\\|\u0007)/g;
const XTVERSION_PAYLOAD = />\|xterm\.js\([^)]*\)/g;
const XTVERSION_LINE = /^xterm\.js\([0-9][^)]*\)$/;

interface LinePart {
  text: string;
  ending: string;
}

function splitLines(data: string): LinePart[] {
  const chunks = data.split(/(\r\n|\n|\r)/);
  const lines: LinePart[] = [];
  for (let index = 0; index < chunks.length; index += 2) {
    lines.push({ text: chunks[index] ?? '', ending: chunks[index + 1] ?? '' });
  }
  return lines;
}

export function sanitizeTerminalOutput(data: string): string {
  if (!data.includes('?1;2c') && !data.includes('0;276;0c') && !data.includes('xterm.js') && !data.includes('\u001bP>|')) return data;

  const lines = splitLines(data.replace(XTVERSION_DCS, ''));
  let output = '';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const original = line.text;
    const cleaned = original
      .replace(XTVERSION_PAYLOAD, '')
      .replace(DA1_QUERY_ECHO, '')
      .replace(DA2_QUERY_ECHO, '');
    const next = lines[index + 1];

    // Wrapped XTVERSION: repeated inline payloads may leave `>|`, followed by
    // an indented version line. Remove both physical lines, including spacing.
    if (cleaned.trim() === '>|' && next && XTVERSION_LINE.test(next.text.trim())) {
      index += 1;
      continue;
    }

    const wasIdentityOnly = (
      (original.includes('xterm.js(') || original.includes('?1;2c') || original.includes('0;276;0c'))
      && cleaned.trim() === ''
    );
    if (wasIdentityOnly || XTVERSION_LINE.test(cleaned.trim())) continue;

    output += cleaned + line.ending;
  }
  return output;
}
