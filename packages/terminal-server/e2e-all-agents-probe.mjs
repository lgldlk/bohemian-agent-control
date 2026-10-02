import WebSocket from 'ws';

const token = process.env.E2E_TOKEN;
const mode = process.argv[2];

async function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:19123?token=${token}`, {
      headers: { origin: 'http://127.0.0.1:18720' },
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function rpc(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timeout ${method}`)), 15000);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== 'response' || message.id !== id) return;
      clearTimeout(timeout);
      ws.off('message', onMessage);
      resolve(message);
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ type: 'request', id, method, params }));
  });
}

const AGENTS = [
  { kind: 'pi', session: 'pi-session-1', command: 'pi --session pi-session-1' },
  { kind: 'codex', session: 'codex-session-1', command: 'codex resume codex-session-1' },
  { kind: 'claude-code', session: 'claude-session-1', command: 'claude --resume claude-session-1' },
];

const ws = await connect();

if (mode === 'create') {
  const created = [];
  for (const agent of AGENTS) {
    const response = await rpc(ws, `create-${agent.kind}`, 'terminal.create', {
      shell: '/bin/sh',
      startupCommand: agent.command,
      startupCommandDelivery: 'shell-ready',
      agentKind: agent.kind,
      nodeId: agent.session,
      launchId: agent.session,
      size: { cols: 80, rows: 24 },
    });
    created.push({ kind: agent.kind, id: response.result.id });
  }
  console.log(JSON.stringify(created));
} else if (mode === 'write') {
  const list = await rpc(ws, 'list', 'terminal.list', {});
  const running = list.result.terminals.filter((item) => item.status === 'running');
  for (const item of running) {
    ws.send(JSON.stringify({
      type: 'subscribe', id: `owner-${item.id}`, channel: 'terminal.output', owner: true,
      filter: { terminalId: item.id },
    }));
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  const writes = [];
  for (const item of running) {
    const response = await rpc(ws, `write-${item.id}`, 'terminal.writeAccepted', { terminalId: item.id, data: '' });
    writes.push({ kind: item.agentKind, accepted: response.result?.accepted });
  }
  console.log(JSON.stringify(writes));
} else {
  const list = await rpc(ws, 'list', 'terminal.list', {});
  console.log(JSON.stringify(list.result.terminals.map((item) => ({
    kind: item.agentKind,
    status: item.status,
    startupCommand: item.startupCommand,
  }))));
}

ws.close();
