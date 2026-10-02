# Board Plugin System PRD

- **状态**：插件运行时、资源扩展面和用户插件安装器已接入；包含 Token Usage、Kaomoji UI、local-file 与 web-url 内置插件。
- **版本**：v0.5
- **范围**：Evidence Board 的插件注册、事件、命令、工具栏、顶部栏、面板、终端链接和资源扩展
- **关联模块**：`src/board`、`src/board/plugins`、tldraw shape utilities、terminal activity bridge

## 1. 目标

插件实现位于仓库根目录的 `builtin-plugins/`，而 `src/board/plugins/` 只保留插件契约、运行时和宿主 adapter。内置插件不得被画板业务组件直接导入；宿主只消费标准 contribution。

插件不仅能够添加 toolbar、顶部栏和右侧面板，还能够向画板添加自己的组件。这里的“画板组件”分成两类，必须明确区分：

1. **临时画布覆盖组件（Transient Canvas Overlay）**：React UI，锚定在页面坐标、节点或视口上，适合实时状态徽标、统计提示和临时操作。它不代表用户创建的画布内容，因此不进入画布文档复制和持久化。
2. **持久化画布组件（Persistent Canvas Component）**：插件拥有自己的数据模型，但由宿主映射为可持久化的 tldraw shape。它必须支持复制、刷新恢复、移动、选中、删除和撤销/重做。用户创建的插件组件默认属于这一类。

插件系统的宿主负责生命周期、权限、渲染位置和数据边界；插件只声明贡献和实现自己的业务逻辑。

## 2. 插件贡献面

```text
BoardPlugin
├── events       监听画板和终端事件
├── commands     注册可撤销/可调用的业务命令
├── toolbar      画板工具栏按钮
├── topbar       应用顶部栏入口
├── panels       右侧或浮层面板
├── pages        独立应用页面 / Tab
├── overlays     画布覆盖组件
├── terminalOverlays 终端运行时状态覆盖组件
├── terminalLinks 终端文本到资源引用的纯数据解析器
├── resourceImporters 浏览器拖入文件的导入映射贡献
├── resourceProviders 资源文档加载贡献
├── resourceRenderers 资源内容渲染贡献
├── resourceActions 资源操作贡献
├── settings      插件独立设置面板
├── shapes       持久化 tldraw shape 类型
└── tools        创建/编辑插件 shape 的 tldraw tool
```

所有贡献都通过插件注册表进入宿主。`EvidenceBoard.tsx` 不直接了解具体插件 id，也不在组件内写 token usage、统计或第三方业务逻辑。

运行时分为两层：`BoardPluginRuntimeCore` 只负责插件生命周期、事件和命令；`src/board/plugins/runtime.ts` 负责把 tldraw editor、board storage 和 core runtime 连接起来。这样插件核心不再直接依赖 board editor 或应用 i18n。

`terminalOverlays` 是临时 UI，只解释终端初始化、恢复快照、断线重连、缺失会话和错误等用户不可见状态。它不显示 `running` 或 `idle`，因为用户可以直接从终端内容感知这些状态，也不进入 tldraw 文档持久化。

插件可以通过 `settings` 声明独立设置面板。设置面板由宿主统一渲染在应用设置中，数据只能通过插件专属 `BoardPluginSettingsStorage` 读写。

## 3. 画布组件模型

### 3.1 Canvas Overlay

临时覆盖组件是 React 组件，不进入 tldraw 文档，也不参与 shape 的复制和持久化。只有明确声明为临时 UI 的内容才能使用这个模型。

适用场景：

- 任务卡右上角的 token badge
- 终端节点的活动指示器
- 选中 Agent 后出现的快捷摘要
- 画布视口中的统计浮层
- 插件操作的 loading / error 状态

接口建议：

```ts
interface BoardCanvasOverlayContribution {
  id: string;
  anchor: 'viewport' | 'shape' | 'selection' | 'page-point';
  order?: number;
  shouldRender?: (context: BoardPluginContext) => boolean;
  Component: ComponentType<BoardCanvasOverlayProps>;
}

interface BoardCanvasOverlayProps {
  context: BoardPluginContext;
  shapeId?: TLShapeId;
  pagePoint?: { x: number; y: number };
}
```

约束：

- overlay 不改变 shape 的 identity 和生命周期。
- overlay 不应成为 Agent 身份源。
- overlay 默认 `pointer-events: none`；需要交互时只在内部控件恢复 pointer events。
- overlay 必须跟随 tldraw camera 和 shape page transform。
- overlay 卸载时不能残留订阅、计时器或 DOM 节点。

### 3.2 Persistent Canvas Component

持久化画布组件是插件向画布增加内容的正式方式。它必须通过 `ShapeUtil` 注册，不能只在 `InFrontOfTheCanvas` 里画一个看起来像 shape 的 DOM。

插件的业务数据由插件自己定义和维护，但 shape 的位置、父级、尺寸、选中、复制、删除和历史记录由画布宿主接入 tldraw 文档。插件不能把用户创建的画布组件只放在 React state 或临时 overlay 中，否则刷新后会消失。

```ts
interface BoardShapeContribution {
  type: string;
  util: TLShapeUtilConstructor;
  migrations: TLPropsMigrations;
  defaultProps: Record<string, unknown>;
  canCreate?: (context: BoardPluginContext) => boolean;
  /** 插件负责把 shape props 转换为自己的业务数据，以及从业务数据恢复 props。 */
  serialize?: (shape: BoardShapeSnapshot) => unknown;
  deserialize?: (value: unknown) => Record<string, unknown> | null;
}
```

插件 shape 必须支持：

- 稳定的 shape type 名称，例如 `plugin:notes:card`。
- props schema 和版本迁移。
- 默认尺寸和默认 props。
- `getGeometry`、`component`、`indicator`。
- 是否可编辑、是否可调整尺寸、是否可绑定的明确声明。
- 删除、复制、撤销和持久化。
- 不可用插件打开旧文档时的降级表现。

插件创建持久化组件通过宿主 command：

```ts
context.board.createPluginShape({
  pluginId: 'notes',
  type: 'plugin:notes:card',
  x: 120,
  y: 160,
  props: { text: 'Follow up' },
});
```

插件不直接随意调用 `editor.createShapes`。这样宿主可以校验：

- type 是否由该插件声明
- props 是否符合 schema
- 是否允许当前权限创建
- 是否需要写入 history
- 是否应归属于某个 frame

## 4. Shape 注册的生命周期

`tldraw` 的 `shapeUtils` 在 `Tldraw` 挂载时注册。因此插件 shape 不能只在点击按钮后临时注册。宿主需要在创建 editor 前完成插件发现和注册：

```text
加载插件清单
  -> 校验 plugin id / version / contributions
  -> 收集 shape contributions
  -> 创建 BOARD_SHAPE_UTILS + plugin shape utils
  -> 挂载 Tldraw
  -> 初始化 plugin runtime
  -> 渲染 toolbar / topbar / panel / overlays
```

内置插件继续使用构建时注册。用户插件在应用启动、创建 editor 之前读取已启用清单并加载浏览器 ESM bundle；安装、更新、启停和删除后需要刷新应用，不做 editor 挂载后的热插拔。

未来如果支持运行时启用/禁用：

- 禁用插件不能删除文档里的 plugin shapes。
- 未加载插件的 shape 显示为 Unknown Plugin Shape，占位但保留原始 record。
- 重新启用插件后恢复正常渲染。
- 动态安装新 shape plugin 需要重新创建 editor 或刷新页面，不在第一期做热插拔。

## 5. 插件存储服务

插件可以控制自己的数据模型和序列化方式，但存储入口由宿主提供。这样插件拥有业务数据的定义权，同时保留统一的 schema、版本、错误处理、清理和持久化边界。

```ts
interface BoardPluginSettingsStorage {
  get<T>(key: string, decode: (value: unknown) => T | null, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

interface BoardPluginContentStorage {
  create<T>(input: CreatePluginContentInput<T>): TLShapeId | null;
  read<T>(shapeId: TLShapeId, codec: PluginDataCodec<T>): PluginContentRecord<T> | null;
  update<T>(shapeId: TLShapeId, value: T, codec: PluginDataCodec<T>): boolean;
  remove(shapeId: TLShapeId): boolean;
  list(): PluginContentShape[];
}
```

第一期的 `BoardPluginContentStorage` 以 tldraw shape 为存储载体；插件数据先经过自己的 codec 校验，再写入 `plugin-content` shape 的持久化 props。这样组件和数据会一起进入 tldraw 文档。

存储分两类：

- `BoardPluginSettingsStorage`：插件设置、筛选条件、面板状态。使用插件专属 storage key，可跨画布保存。
- `BoardPluginContentStorage`：用户创建的画布组件和业务数据。第一期直接由 tldraw shape 承载，必须随画布刷新恢复，并在复制画布组件时同步复制。

宿主自动加前缀和 schema 版本：

```text
bohemian-agent-control:plugin:<plugin-id>:settings:v1
bohemian-agent-control:plugin:<plugin-id>:content:v1
```

插件组件本身的数据不通过这个 settings key 存储，而是写入 `plugin-content` shape；该 shape 使用现有 `BOARD_PERSIST_KEY` 随 tldraw 文档保存。

插件服务必须：

- 校验读入数据，坏数据回退安全默认值。
- 不允许插件访问其他插件的 key。
- 不允许插件绕过服务直接读写 localStorage 或 IndexedDB。
- tldraw 复制 shape 时复制插件数据和 shape 的位置、父级、尺寸。
- 删除插件 shape 时一并删除该 shape 承载的数据。
- 插件卸载时保留未知插件 shape；重新启用插件后恢复正常渲染。
- codec 解码失败时显示 Unknown Plugin Shape，不把坏数据交给插件组件。

第一期的持久化关系：

```text
plugin business value
  -> plugin codec.encode()
  -> plugin-content shape.props.data
  -> tldraw document / IndexedDB
```

如果未来单个插件数据超过 shape props 适合承载的大小，再增加独立的 `BoardPluginDocumentStorage`。那时 shape 只保存稳定的 `pluginRef`，复制 shape 时由宿主同步复制被引用的记录；该扩展不能改变第一期 shape 复制和刷新恢复的语义。

## 6. Tool 扩展

如果插件 shape 需要用户从 toolbar 拖入画布，插件可以声明 tool：

```ts
interface BoardToolContribution {
  id: string;
  shapeType: string;
  icon: TLUiIconType;
  labelKey: string;
  onCreate?: (context: BoardPluginContext, shapeId: TLShapeId) => void;
}
```

工具行为必须遵守画板现有约定：

- 双击、拖拽和 pointer capture 不能破坏终端输入。
- wheel 事件不能被转成 Agent 状态、PTY 输入或鼠标报告。
- 创建 shape 的默认位置由画板宿主提供，不由插件读取 DOM 坐标猜测。
- shape 创建成功后发布 `shape-created` 事件。

## 7. 插件上下文扩展

现有插件上下文需要增加画布能力，但仍保持受控 facade：

```ts
interface BoardPluginContext {
  editor: BoardEditorFacade;

  tasks: readonly Task[];
  selectedShapeIds: readonly TLShapeId[];
  activeFrameId: TLShapeId | null;

  board: {
    focusTask(taskId: string): void;
    focusShape(shapeId: TLShapeId): void;
    createPluginShape(input: CreatePluginShapeInput): TLShapeId | null;
    updatePluginShape(shapeId: TLShapeId, patch: Record<string, unknown>): boolean;
    deletePluginShape(shapeId: TLShapeId): boolean;
    arrangeBoard(): boolean;
    arrangeGroup(frameId: TLShapeId): boolean;
  };

  terminals: {
    openForTask(taskId: string): Promise<string | null>;
    focus(terminalId: string): boolean;
    getInfo(terminalId: string): TerminalInfo | undefined;
  };

  events: {
    subscribe(listener: (event: BoardEvent) => void): () => void;
  };

  notifications: {
    success(message: string): void;
    error(message: string): void;
    info(message: string): void;
  };
}
```

`BoardEditorFacade` 只暴露经过校验的能力，不暴露所有 tldraw 内部 API：

```ts
interface BoardEditorFacade {
  getShape(id: TLShapeId): BoardShapeSnapshot | undefined;
  getSelectedShapeIds(): readonly TLShapeId[];
  getPagePointFromScreen(point: { x: number; y: number }): { x: number; y: number };
  getShapePageBounds(id: TLShapeId): BoardBounds | undefined;
}
```

## 8. 插件 Shape 的数据归属

插件 shape 是画布投影或用户事实，需要在设计时明确：

| 类型 | 所有者 | 示例 |
| --- | --- | --- |
| 临时状态徽标 | 插件运行时 | 终端状态提示 |
| 工具面板 | 插件运行时 | 插件设置或快捷操作 |
| 用户主动创建的插件组件 | 插件 document storage + board document | 备注卡等内容，必须复制和持久化 |
| 插件设置 | 插件 storage | 筛选条件、面板显示偏好 |
| Agent 身份、session、PTY | 现有核心模块 | 不能由插件接管 |
| 分组归属 | `spaceStore` | 插件只能通过受控 command 修改 |

## 9. 安全和稳定性

插件不能：

- 直接读取 Agent 原始历史文件。
- 直接读取 API token、私钥或 terminal-server 凭据。
- 直接持有 `TerminalClient` 并向 PTY 写入。
- 通过 `useSpaceStore.getState()` 拼装 Agent 生命周期。
- 修改 task-card 的 Agent identity。
- 静默删除其他插件的 shape。
- 注册重复的 shape type，或同一槽位内重复的 toolbar id、topbar id、command id 或 panel id。同一动作可以同时出现在 toolbar 和 topbar，两者 id 互不占用。
- 直接持有 xterm、`ResourceInspector`、tldraw `Editor`、`fetch` 或本地文件系统能力。
- 依赖另一个结果插件来完成终端链接、资源预览或画板固定；共享能力必须来自宿主 facade。

注册表必须在启动时做校验：

- id 唯一
- type 唯一
- plugin shape 有 migration
- contribution 的 owner plugin 一致
- `terminalLinks`、`resourceImporters`、`resourceProviders`、`resourceRenderers` 和 `resourceActions` 在各自槽位内跨插件唯一
- 依赖插件存在
- 循环依赖被拒绝

插件异常不能让画板崩溃：

- toolbar 插件渲染失败只隐藏该按钮。
- panel 渲染失败显示插件错误边界。
- overlay 出错只移除该 overlay。
- shape component 出错显示 Unknown Plugin Shape 或错误占位。

## 10. 推荐目录

```text
src/plugin-system/
├── index.ts                 # 插件公开 SDK facade
└── user-plugins/
    ├── contracts.ts         # HTTP DTO 与本地化文本选择
    ├── client.ts            # 用户插件 HTTP client
    ├── loader.ts            # 启动阶段 ESM 加载与注册
    └── useUserPluginManager.ts # 设置页状态和命令编排

src/board/plugins/
├── types.ts                 # 契约
├── registry.ts              # 纯注册表
├── runtimeCore.ts           # editor 无关 runtime core
├── activeRuntimeRegistry.ts # 当前 editor runtime 选择与事件广播
├── contextFactory.ts        # 受控插件 context 工厂
├── editorEventBridge.ts     # tldraw 事件到插件事件的桥接
├── runtime.ts               # runtime 组合入口和兼容 facade
├── runtimeScope.tsx         # editor-scoped React runtime
├── hosts/
│   ├── hostRuntime.ts       # 宿主回调错误隔离与 UI 订阅
│   ├── BoardPluginToolbarHost.tsx
│   ├── BoardPluginTopbarHost.tsx
│   ├── BoardPluginOverlayHost.tsx
│   ├── BoardPluginPanelHost.tsx
│   └── BoardPluginSettingsHost.tsx
├── storage/
│   ├── contracts.ts         # settings/content storage 契约
│   ├── settingsStorage.ts   # 插件设置存储和变更通知
│   └── contentStorage.ts    # tldraw plugin-content 数据服务
├── BoardPluginHost.tsx      # 旧宿主 import 的兼容 facade
├── storage.ts               # 旧 storage import 的兼容 facade
└── index.ts

packages/api-server/src/plugins/
├── contracts.ts             # manifest、registry 和安装包契约
├── validation.ts            # manifest、路径与安装记录校验
├── githubSource.ts          # GitHub 来源解析、固定 commit 和下载
├── storage.ts               # 磁盘 registry 与原子文件事务
├── manager.ts               # 安装、更新、来源冲突的业务编排
└── index.ts                 # 服务端插件公开入口

builtin-plugins/
├── index.ts
├── terminalStatus/
├── terminalPerformance/
├── localFile/
├── tokenUsage/
└── webUrl/
```

## 11. 当前实现状态

第一版已实现以下基础设施：

- `registry.ts`：纯插件注册、重复 id 校验、贡献 id 校验、查询和注销通知，不依赖 i18n 或 editor。
- `runtimeCore.ts`：editor 无关的生命周期、setup/cleanup、命令上下文、事件隔离和插件注销清理。
- `activeRuntimeRegistry.ts`：只管理已挂载 runtime、当前 runtime 和跨 runtime 事件广播。
- `contextFactory.ts`：只把 editor、任务快照和隔离后的 storage 组装成插件 context。
- `editorEventBridge.ts`：只负责把 tldraw shape/selection 事件转成插件事件，并提供成对卸载。
- `runtime.ts`：组合上述模块，负责 mount/unmount 顺序并保留公开 API；不再承载具体 context 或 editor 事件实现。
- `runtimeScope.tsx`：为每个 editor 提供独立 runtime scope；顶部栏通过 active runtime bridge 读取当前画板 runtime。
- `events.ts`：隔离监听器的事件总线。
- `hosts/`：按 toolbar、topbar/page button、overlay、panel/page overlay、settings 分槽位渲染；每个宿主只依赖对应 contribution，插件回调和渲染错误统一在 `hostRuntime.ts` 隔离。
- `PluginContentShape.tsx`：统一的可持久化插件画布组件；插件只接收受控 context 和内容 storage，不直接拿到 tldraw editor。
- `storage/settingsStorage.ts`：插件 settings storage 与变更通知；`storage/contentStorage.ts`：plugin content 的 codec、所有权、几何校验和 tldraw 持久化。
- `index.ts`：插件公开 API 入口。

用户插件链路也按职责分层：浏览器端 `client.ts` 不保存 UI 状态，`loader.ts` 不发管理请求，`useUserPluginManager.ts` 不解析 bundle；服务端 route 不访问 GitHub 或文件系统，`GitHubPluginSource`、`UserPluginStorage` 和 `UserPluginManager` 分别负责远程来源、磁盘事务和业务编排。

内置插件由 `main.tsx` 在应用渲染前统一注册，不依赖宿主组件的 import side effect。`App.tsx` 不得硬编码插件 id、插件页面 id 或插件专属 view。插件注册 `pages` 后，`BoardPluginPageButtons` 自动生成顶部页面入口，`BoardPluginPageOverlayHost` 在画板宿主内渲染当前页面。Token Usage 只贡献独立 `pages` 页面，不注册 toolbar、topbar 或 panel contribution；画板内不会出现重复入口或侧栏弹窗。顶部栏插件按钮仍由通用宿主渲染，位于 `<Tldraw />` 树外，因此不能调用 `useEditor` 或 `TldrawUiButtonIcon`；active/disabled/badge 通过 `subscribeBoardPluginUi` 跟随 runtime 挂载、选区和插件事件更新，topbar 使用插件声明的 Lucide icon。

插件 context 的 editor 能力是只读 facade；overlay 只收到 context、任务快照和选区，不直接持有 tldraw `Editor`。插件 event bus 对插件只开放订阅，事件发布仍由宿主负责。注销插件时，已挂载 runtime 会执行其 cleanup 并移除 context。

资源扩展面也已落地：`terminalLinks` 只接收终端行文本和只读运行上下文；xterm 注册、坐标命中、点击 fallback 和缓存由终端宿主管理。`resourceImporters` 只接收浏览器文件元数据，并把宿主完成流式导入后的描述符转换成资源引用；插件不接触 File 字节。`resourceProviders`、`resourceRenderers`、`resourceActions` 由资源宿主选择和隔离执行。内置 local-file 与 web-url 插件彼此独立，分别贡献路径、拖入文件和 HTTP(S) URL 能力；插件不直接访问文件 API、资源检查器或 tldraw editor。终端激活或用户拖入由宿主创建或聚焦通用 `ResourceShape`，provider/renderer 在 Shape 内加载和渲染内容；按引用类型保存本地路径或完整 URL。弹窗检查器只作为 Shape 双击后的二级操作界面。

第一版仍有明确边界：用户插件安装后需要刷新应用；plugin-content 的业务数据仍缺少独立的 schema migration/version ledger；topbar 需要插件提供 Lucide icon；终端事件已接入打开、关闭和状态变化，更多终端活动事件以后继续补充。

## 12. 用户插件安装与存储

设置页提供“从 GitHub 安装”入口。安装器只接受 `https://github.com` 的仓库、tree 子目录或指向 `plugin.json` 的 blob 地址；服务端通过 GitHub Contents API 读取声明文件和文件列表，不执行 `git clone`、`npm install`、仓库脚本或 TypeScript 编译。

用户插件保存在本机应用状态目录：

```text
~/.bohemian-agent-control/plugins/
├── registry.json
├── installed/
│   └── <plugin-id>/
│       ├── plugin.json
│       ├── install.json
│       ├── bundle.js
│       └── <manifest-declared-files>
└── staging/
```

- `installed/<plugin-id>`：当前激活版本。更新使用 staging + rename 原子替换，失败时恢复旧版本。
- `install.json`：来源仓库、固定 commit、文件摘要、启用状态和安装时间；`registry.json` 损坏时可据此重建。
- `staging/`：安装、更新和删除的临时目录，不作为运行时加载来源。
- 默认根目录可用 `BOHEMIAN_PLUGIN_DIR` 改写；私有仓库或更高 GitHub API 配额可在 API 服务环境中配置 `BOHEMIAN_GITHUB_TOKEN`，token 不进入前端或日志。

用户插件必须提交已经构建好的浏览器 ESM，不允许安装器在本机运行包管理器或构建命令。manifest 最小格式：

```json
{
  "schemaVersion": 1,
  "id": "example-plugin",
  "name": {
    "en": "Example plugin",
    "zh-CN": "示例插件"
  },
  "version": "1.0.0",
  "entry": "bundle.js",
  "files": ["bundle.js"],
  "permissions": [],
  "integrity": {
    "bundle.js": "sha256-BASE64_DIGEST"
  }
}
```

`files` 最多 32 个；单文件最多 1 MiB，整个包最多 4 MiB。文件路径必须是插件目录内的 POSIX 相对路径，GitHub symlink、目录、路径穿越、未声明文件和 integrity 不匹配都会被拒绝。GitHub ref 会先解析为 commit SHA，所有文件从同一 commit 下载。相同 plugin id 只能由原仓库更新，换仓库必须先移除旧插件。

插件入口可直接导出 `BoardPlugin`，也可导出 `default`/`createPlugin` factory；factory 会收到 `{ apiVersion: 1, React }`。bundle id 和 version 必须与 `plugin.json` 一致。插件可以按声明的相对路径加载拆分后的 ESM 文件，但不能依赖 Vite alias、Node API 或未打包的 npm bare import。

用户插件是受信任代码，不是安全沙箱。它在浏览器主线程运行，技术上拥有与应用页面相同的 Web API 访问能力；设置页安装前必须显式确认信任，界面持续显示来源仓库和固定 commit。插件 runtime 仍只向业务实现提供受控 board context，但这不能替代浏览器级隔离。未来若要支持不受信任插件，需要单独设计 iframe/worker capability sandbox，不能把 `permissions` 声明当作已强制执行的权限边界。

## 13. 实施顺序

1. 先把插件 metadata、registry、runtime、context 和贡献类型定下来。
2. 把 toolbar / topbar / panel 从 `EvidenceBoard.tsx` 抽成 host。
3. 增加 overlay host，但先只支持只读、锚定已有 shape 的 React overlay。
4. 增加 plugin shape registry，在 Tldraw 挂载前合并 shape utils。
5. 增加插件 shape facade、schema 校验、migration 和 Unknown Plugin Shape。
6. 用一个简单的示例插件验证持久化 shape、toolbar tool、overlay 和 command 的完整链路。

## 14. 验收标准

- 插件可以注册 toolbar、topbar、panel、overlay 和 command。
- 插件可以声明一个自定义持久化 shape，并通过工具栏创建到画布。
- 用户创建的插件组件参与移动、选择、复制、删除、撤销/重做和刷新后恢复。
- 插件业务数据通过宿主提供的插件存储服务保存，不直接读写 localStorage 或 IndexedDB。
- 复制画布组件时，插件 document data 和 shape 引用一起复制。
- 未加载插件时，旧 shape 和插件数据不丢失，显示可识别的占位，插件重新启用后恢复。
- 插件卸载后不会遗留事件订阅、toolbar 按钮、panel 或 DOM overlay。
- 重复初始化不会重复注册。
- 插件不能直接修改 Agent identity、PTY、workspace 或 space 生命周期。
- 页面型插件只依赖公开任务快照和受控 board capability。
- `App.tsx` 不包含任何具体插件 id、页面 id、插件专属分支或插件专属 view；新增或删除页面插件不修改核心 App。
- 设置页可以安装、更新、启用、停用和移除 GitHub 用户插件，并在需要时提示刷新。
- 用户插件只从固定 commit 下载 manifest 声明的文件，安装失败不会破坏当前已安装版本。
