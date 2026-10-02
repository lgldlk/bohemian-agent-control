import WebSocket from 'ws';

const token = process.env.E2E_TOKEN;

function connect() {
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

function subscribeOwner(ws, terminalId, id) {
  ws.send(JSON.stringify({
    type: 'subscribe', id, channel: 'terminal.output', owner: true, filter: { terminalId },
  }));
}

// Simulates a browser refresh: the old socket stays open while the new one subscribes.
const oldSocket = await connect();
const newSocket = await connect();

const list = await rpc(newSocket, 'list', 'terminal.list', {});
const target = list.result.terminals.find((item) => item.status === 'running' && item.agentKind === 'codex');
if (!target) throw new Error('no running codex terminal');

subscribeOwner(oldSocket, target.id, 'old-owner');
await new Promise((resolve) => setTimeout(resolve, 250));
const oldBefore = await rpc(oldSocket, 'old-before', 'terminal.writeAccepted', { terminalId: target.id, data: '' });

subscribeOwner(newSocket, target.id, 'new-owner');
await new Promise((resolve) => setTimeout(resolve, 250));
const newAfter = await rpc(newSocket, 'new-after', 'terminal.writeAccepted', { terminalId: target.id, data: '' });
const oldAfter = await rpc(oldSocket, 'old-after', 'terminal.writeAccepted', { terminalId: target.id, data: '' });

console.log(JSON.stringify({
  oldBefore: oldBefore.result?.accepted,
  newAfterTakeover: newAfter.result?.accepted,
  oldAfterTakeover: oldAfter.result?.accepted,
}));

oldSocket.close();
newSocket.close();
