import { create } from 'zustand';
import {
  DEFAULT_PIN_H,
  DEFAULT_PIN_W,
  PIN_MIN_H,
  PIN_MIN_W,
  type BoardDoc,
  type BoardPin,
  type BoardWire,
} from './types';

export interface BoardState {
  pins: BoardPin[];
  wires: BoardWire[];
  /** 已存在相同 taskId 则只搬位置并返回旧 id,否则新建并返回新 id */
  addPin(taskId: string, x: number, y: number, w?: number, h?: number): string;
  movePin(id: string, x: number, y: number): void;
  /** clamp 到最小尺寸 */
  resizePin(id: string, w: number, h: number): void;
  /** 同时删除连带 wire */
  removePin(id: string): void;
  clearBoard(): void;
  /** from===to 或已存在同对则返回 '' 不加 */
  addWire(from: string, to: string, opts?: { color?: string; label?: string }): string;
  removeWire(id: string): void;
  /** 替换 pins+wires,groups 忽略(分组走 spaceStore) */
  loadDoc(doc: BoardDoc): void;
  /** 快照；分组由调用方显式传入，避免 board store 读取 space store */
  doc(groups: BoardDoc['groups']): BoardDoc;
}

const STORE_KEY = 'bohemian-agent-control:board:v1';

function clampSize(v: number, min: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(v, min);
}

function isValidPin(v: unknown): v is BoardPin {
  if (v === null || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.taskId === 'string' &&
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y) &&
    typeof p.w === 'number' &&
    Number.isFinite(p.w) &&
    typeof p.h === 'number' &&
    Number.isFinite(p.h)
  );
}

function isValidWire(v: unknown): v is BoardWire {
  if (v === null || typeof v !== 'object') return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w.id === 'string' &&
    typeof w.from === 'string' &&
    typeof w.to === 'string' &&
    typeof w.color === 'string' &&
    typeof w.label === 'string'
  );
}

function loadInitial(): { pins: BoardPin[]; wires: BoardWire[] } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw == null) return { pins: [], wires: [] };
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return { pins: [], wires: [] };
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.pins) || !Array.isArray(obj.wires)) return { pins: [], wires: [] };
    if (!obj.pins.every(isValidPin)) return { pins: [], wires: [] };
    if (!obj.wires.every(isValidWire)) return { pins: [], wires: [] };
    return {
      pins: (obj.pins as BoardPin[]).map((p) => ({ ...p })),
      wires: (obj.wires as BoardWire[]).map((w) => ({ ...w })),
    };
  } catch {
    return { pins: [], wires: [] };
  }
}

function save(pins: BoardPin[], wires: BoardWire[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ pins, wires }));
  } catch {
    /* ignore */
  }
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const initial = loadInitial();

export const useBoardStore = create<BoardState>()((set, get) => ({
  pins: initial.pins,
  wires: initial.wires,

  addPin: (taskId, x, y, w, h) => {
    const cur = get();
    const existing = cur.pins.find((p) => p.taskId === taskId);
    if (existing) {
      const pins = cur.pins.map((p) => (p.id === existing.id ? { ...p, x, y } : p));
      set({ pins });
      save(pins, cur.wires);
      return existing.id;
    }
    const id = nextId('p');
    const pin: BoardPin = {
      id,
      taskId,
      x,
      y,
      w: clampSize(w ?? DEFAULT_PIN_W, PIN_MIN_W),
      h: clampSize(h ?? DEFAULT_PIN_H, PIN_MIN_H),
    };
    const pins = [...cur.pins, pin];
    set({ pins });
    save(pins, cur.wires);
    return id;
  },

  movePin: (id, x, y) => {
    const cur = get();
    const pins = cur.pins.map((p) => (p.id === id ? { ...p, x, y } : p));
    set({ pins });
    save(pins, cur.wires);
  },

  resizePin: (id, w, h) => {
    const cur = get();
    const pins = cur.pins.map((p) =>
      p.id === id ? { ...p, w: clampSize(w, PIN_MIN_W), h: clampSize(h, PIN_MIN_H) } : p,
    );
    set({ pins });
    save(pins, cur.wires);
  },

  removePin: (id) => {
    const cur = get();
    const pins = cur.pins.filter((p) => p.id !== id);
    const wires = cur.wires.filter((w) => w.from !== id && w.to !== id);
    set({ pins, wires });
    save(pins, wires);
  },

  clearBoard: () => {
    set({ pins: [], wires: [] });
    save([], []);
  },

  addWire: (from, to, opts) => {
    if (from === to) return '';
    const cur = get();
    if (cur.wires.some((w) => w.from === from && w.to === to)) return '';
    const id = nextId('w');
    const wire: BoardWire = {
      id,
      from,
      to,
      color: opts?.color ?? '#9ca3af',
      label: opts?.label ?? '',
    };
    const wires = [...cur.wires, wire];
    set({ wires });
    save(cur.pins, wires);
    return id;
  },

  removeWire: (id) => {
    const cur = get();
    const wires = cur.wires.filter((w) => w.id !== id);
    set({ wires });
    save(cur.pins, wires);
  },

  loadDoc: (doc) => {
    const pins = Array.isArray(doc?.pins) ? doc.pins.map((p) => ({ ...p })) : [];
    const wires = Array.isArray(doc?.wires) ? doc.wires.map((w) => ({ ...w })) : [];
    set({ pins, wires });
    save(pins, wires);
  },

  doc: (groups) => {
    const { pins, wires } = get();
    return {
      groups: groups.map((g) => ({ id: g.id, name: g.name })),
      pins: pins.map((p) => ({ ...p })),
      wires: wires.map((w) => ({ ...w })),
    };
  },
}));
