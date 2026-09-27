import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readLocalToken(fileName: string): string {
  try {
    return fs.readFileSync(path.join(os.homedir(), '.bohemian-agent-control', fileName), 'utf8').trim();
  } catch {
    return '';
  }
}

function isBenignProxyError(error: NodeJS.ErrnoException): boolean {
  return error.code === 'EPIPE'
    || error.code === 'ECONNRESET'
    || error.code === 'ECONNREFUSED'
    || error.code === 'ECONNABORTED';
}

/**
 * Vite always logs proxy socket errors. During `tsx watch` restarts the
 * terminal server drops the socket (EPIPE / ECONNRESET) and the browser
 * reconnects. Swallow those, keep real proxy failures.
 */
function quietProxy(proxy: { on: (event: string, listener: (...args: never[]) => void) => void }): void {
  const original = proxy.on.bind(proxy);
  proxy.on = (event: string, listener: (...args: never[]) => void) => {
    if (event === 'error') {
      return original('error', ((error: NodeJS.ErrnoException, req: unknown, res: { end?: () => void; writableEnded?: boolean; headersSent?: boolean; writeHead?: (code: number) => { end: () => void } }) => {
        if (isBenignProxyError(error)) {
          try {
            if (res && 'writeHead' in res && !res.headersSent && !res.writableEnded) res.writeHead?.(502).end();
            else if (!res?.writableEnded) res?.end?.();
          } catch { /* socket already closed */ }
          return;
        }
        listener(error as never, req as never, res as never);
      }) as (...args: never[]) => void);
    }
    if (event === 'proxyReqWs') {
      return original('proxyReqWs', ((proxyReq: unknown, req: unknown, socket: { on: (event: string, listener: (...args: never[]) => void) => void }, options: unknown) => {
        const socketOn = socket.on.bind(socket);
        socket.on = (socketEvent: string, socketListener: (...args: never[]) => void) => {
          if (socketEvent !== 'error') return socketOn(socketEvent, socketListener);
          return socketOn('error', ((error: NodeJS.ErrnoException) => {
            if (isBenignProxyError(error)) return;
            socketListener(error as never);
          }) as (...args: never[]) => void);
        };
        listener(proxyReq as never, req as never, socket as never, options as never);
      }) as (...args: never[]) => void);
    }
    return original(event, listener);
  };
}

function apiProxy(): ProxyOptions {
  return {
    target: 'http://127.0.0.1:18721',
    changeOrigin: true,
    configure: (proxy) => {
      quietProxy(proxy as unknown as { on: (event: string, listener: (...args: never[]) => void) => void });
      proxy.on('proxyReq', (proxyReq) => {
        const token = readLocalToken('api.token');
        if (token) proxyReq.setHeader('x-bohemian-token', token);
      });
    },
  };
}

function terminalProxy(): ProxyOptions {
  return {
    target: 'ws://127.0.0.1:18722',
    ws: true,
    rewrite: (requestPath) => {
      const token = readLocalToken('terminal.token');
      if (!token) return requestPath;
      const sep = requestPath.includes('?') ? '&' : '?';
      return `${requestPath}${sep}token=${encodeURIComponent(token)}`;
    },
    configure: (proxy) => {
      quietProxy(proxy as unknown as { on: (event: string, listener: (...args: never[]) => void) => void });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // tldraw relies on singleton stores and editors. In a pnpm workspace,
    // force every import path to resolve to the same runtime instances.
    dedupe: [
      'react',
      'react-dom',
      'tldraw',
    ],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/@xterm/')) return 'vendor-xterm';
          if (id.includes('/framer-motion/')) return 'vendor-motion';
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/zustand/')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 18720,
    host: '127.0.0.1',
    proxy: {
      '/api': apiProxy(),
      '/ws/terminal': terminalProxy(),
    },
  },
});
