import { create } from 'zustand';

/** 小地图空白点击 / 其他程序化导航的目标点 */
export interface SpaceJump {
  x: number;
  z: number;
  seq: number;
}

export interface SpaceViewState {
  /** 当前聚焦的任务 id,无聚焦时为 null */
  focusId: string | null;
  /** 小地图每 500ms 读相机位置时 +1,触发重绘 */
  miniTick: number;
  /** 侧边栏是否展开,默认 true */
  sidebarOpen: boolean;
  /** 程序化导航目标,seq 递增,CameraRig 消费 */
  jump: SpaceJump | null;
  setFocus: (id: string | null) => void;
  bumpMini: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  jumpTo: (x: number, z: number) => void;
}

export const useSpaceView = create<SpaceViewState>()((set) => ({
  focusId: null,
  miniTick: 0,
  sidebarOpen: false,

  jump: null,
  setFocus: (id) => set({ focusId: id }),
  jumpTo: (x, z) =>
    set((s) => ({ jump: { x, z, seq: (s.jump?.seq ?? 0) + 1 } })),
  bumpMini: () => set((s) => ({ miniTick: s.miniTick + 1 })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
