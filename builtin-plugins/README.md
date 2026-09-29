# builtin-plugins

这里存放产品随应用发布的插件实现。插件实现不能被 `src/board` 的业务组件直接导入；它们只能依赖插件公开契约：

- `src/board/plugins/types.ts`
- `src/board/plugins/storage.ts`
- `src/board/plugins/resourceTypes.ts`
- `src/board/plugins/events.ts`

插件注册由本目录的 `index.ts` 完成。画板核心只负责消费 contribution，不知道具体内置插件的 id、业务逻辑或文案。资源插件可以通过 `resourceImporters` 接受拖入文件的只读元数据，并把宿主完成安全导入后的描述符转换为资源引用；插件不会收到浏览器 `File` 字节、API 凭据或 tldraw Editor。

新增插件时：

1. 在本目录新建独立文件夹。
2. 通过 `BoardPlugin` 声明 contribution。
3. 在 `index.ts` 注册。
4. 使用插件自己的 translations、settings 和测试。
