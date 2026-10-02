# Resource Interaction Architecture

## Scope

Paths and HTTP(S) URLs printed by any board terminal are actionable through one provider-independent resource model. The terminal's current runtime `cwd` resolves relative paths; the API server validates and serves local resources; URL resources remain client-side references and are never fetched by the API server.

The board stores resource references and source metadata only. Pinning or deleting a resource shape never copies, moves, deletes, or remotely fetches the source resource.

## Data Flow

```text
xterm output
  -> host-owned link provider and Cmd/Ctrl-click hit-test
  -> independent terminal-link plugin resolvers
       -> local-file plugin: path + line/column + latest cwd
       -> web-url plugin: normalized HTTP(S) URL
  -> board host creates or focuses ResourceShape beside the terminal
  -> provider / renderer registry loads directly inside the shape
  -> inline board preview for text, images, media, PDF, directories, or URLs
  -> optional shape double-click opens ResourceInspector for secondary actions

Finder / Explorer files
  -> board capture-phase Drop boundary
  -> resourceImporters metadata match
  -> authenticated streaming import into managed storage
  -> ResourceShape creation, grid placement, selection, and focus
```

`packages/terminal-ui` owns xterm registration, coordinate hit-testing, click handling, bounded row caches, resolver error isolation, and normalized callbacks. It does not parse file paths itself, read the filesystem, fetch remote pages, open the resource inspector, or mutate tldraw. The board terminal host converts the callback into a `ResourceShape` creation or focus operation; terminal activation no longer opens a modal.

The shared serializable `TerminalResourceRef` lives in `@bohemian/terminal-protocol`. `src/board/plugins` contributes data-only terminal resolvers and resource providers/renderers/actions. `src/resources` owns host capability adapters, the inspector, and the activation bus. `src/board` owns the generic resource shape and placement.

## Plugin Contributions

Resource plugins are build-time built-ins registered through the existing Board Plugin Registry. They may contribute:

- `terminalLinks`: synchronous text-to-resource candidates, plus optional asynchronous validation through host capabilities.
- `resourceImporters`: accept dropped browser file metadata and convert a host-uploaded descriptor into a resource reference; plugins never receive browser `File` bytes.
- `resourceProviders`: load a normalized resource document through host-owned capabilities.
- `resourceRenderers`: render a compatible resource document.
- `resourceActions`: declare actions executed through host-owned capabilities.

Contribution ids are unique inside a plugin and across plugins for each resource slot. Priority resolves overlapping terminal candidates and provider/renderer selection. Plugin parser and matcher failures are isolated so one contribution cannot stop the remaining contributions.

A plugin never receives xterm, a terminal client, `ResourceInspector`, the tldraw `Editor`, `fetch`, or direct filesystem access. The host injects narrow capabilities such as `statLocalPath`, `inspectLocalPath`, `openLocalPath`, `openExternal`, and `pinToBoard`.

The built-in local-file and web-url plugins do not depend on one another.

## Parsing Performance

Terminal parsing is bounded and cached:

- Only the first 4,096 characters of a terminal row are offered to resolvers.
- Resolver order is calculated once per terminal options object.
- Parsed rows use a 64-entry bounded cache keyed by runtime context and text.
- Provider rendering and the Cmd/Ctrl-click fallback share the same parsed-row cache, so `mousedown`, `mouseup`, and xterm link queries do not repeatedly run every regex.
- Async local-file validation is deduplicated by resolver, cwd, and resource identity.
- Local-file and URL parsers use early rejection to avoid claiming each other's candidates.

These limits prevent pathological pasted lines from monopolizing the terminal while keeping ordinary terminal rows effectively constant-sized.

## Unified Resource Context

Pi, Claude Code, and Codex use the same source context:

```text
TerminalInfo.cwd
  -> Task.workingDir
  -> Agent session workingDir
```

Resolvers read the latest runtime context so cwd updates do not require rebuilding xterm. Local paths may be relative or absolute, use `file://`, include spaces, or carry `:line[:column]`, `:startLine-endLine`, `:startLine:startColumn-endLine:endColumn`, and GitHub-style `#Lstart-Lend` locations.

For plugin-enabled board terminals, normal URL activation opens the external browser while modified Cmd-click on macOS or Ctrl-click on Windows/Linux enters the application resource flow. Modified local-path clicks enter the resource flow. Ordinary terminal input and selection remain terminal behavior. Terminal surfaces without plugin resolvers retain xterm's standard external web-link addon as a compatibility fallback.

## Local File API and Security

The API server exposes authenticated endpoints:

- `GET /api/fs/stat?path=&cwd=`: validated metadata and preview kind.
- `GET /api/fs/read?path=&cwd=`: bounded text preview.
- `GET /api/fs/preview?path=&cwd=`: bounded binary/image/PDF/audio/video stream.
- `GET /api/fs/download?path=&cwd=`: bounded download stream.
- `POST /api/fs/import?name=&mimeType=`: stream a user-dropped file into content-addressed managed storage.
- `POST /api/fs/open?path=&cwd=` and `/api/fs/reveal?path=&cwd=`: open with the host default application or reveal in the file manager.

Allowed roots derive from known Agent workspaces, session working directories, and the app-managed import directory. A file located under the current user's `os.tmpdir()` receives an exact-path exception so clipboard captures such as `pi-clipboard-*.png` can be rendered. A user may also drag any browser-readable file from outside those roots onto the board; the host streams it into a content-addressed directory under `~/.bohemian-agent-control/imports`, preserving the original filename and deduplicating identical content. Imports use at most four concurrent requests, never buffer the complete file in API memory, and have a 2 GB per-file disk-safety boundary. Binary previews and downloads support HTTP byte ranges so large video, audio, and PDF resources can seek without loading the whole file. Paths are checked before and after `realpath` resolution, so symlink escapes remain rejected. Responses use `nosniff`. Host operations use parameterized process arguments with shell execution disabled.

The local-file plugin receives only metadata returned by the host's bounded capability facade. It cannot issue arbitrary API requests.

## Remote URL Security

The web-url plugin accepts only HTTP(S) URLs. It rejects credential-bearing URLs and does not claim `javascript:`, `data:`, `file:`, SSH, FTP, email addresses, or common source-file names. Explicit URLs, `www.` links, high-confidence bare domains, localhost, `*.localhost`, loopback IPv4, and `[::1]` are supported.

The API server never fetches remote URLs, preventing the URL plugin from becoming an SSRF proxy. The browser renderer attempts a direct iframe and always exposes an external Open action; websites may still refuse embedding through browser-enforced `X-Frame-Options` or CSP. Markdown HTTP(S), protocol-relative, and supported data-image sources load directly in the browser.

Complete HTTP(S) URLs—including query parameters and credentials—are preserved in the local board document, displayed, copied, and opened without application-level redaction. A `sensitive` marker may still be derived for UI or auditing, but it no longer changes the URL. Users should treat exported/shared board documents as potentially credential-bearing.

## Resource Providers and Renderers

The host selects the highest-priority provider whose `canHandle` predicate accepts the resource, then selects the highest-priority compatible renderer. The same renderer contract receives a `surface` value and can adapt between the compact board shape and the optional inspector surface.

The initial built-ins provide:

- Local directories: directory summary.
- Source code and text: Shiki tokenization loaded on demand, real line numbers, bounded rendering, horizontal scrolling, and highlighted Agent-reported line ranges with surrounding context. A `file.tsx:1-15` reference is treated as a focused source window, not a fabricated diff; a true red/green diff requires explicit before/after content.
- Markdown: `react-markdown` with GFM tables, task lists, links, quotes, and safe HTML handling; a Markdown line-range reference falls back to highlighted source lines instead of rendered prose.
- JSON/CSV/configuration files: syntax-aware or structured source preview with line numbers.
- Images: native image rendering on a checkerboard surface with MIME and size metadata.
- Audio and video: native browser controls.
- PDF: same-origin preview frame.
- Other binary files: metadata and download/open actions.
- HTTP(S) URLs: safe external-link card without remote fetch or embedding.

Shiki core, individual language grammars, and the Markdown renderer are dynamically imported. Only a constrained language set and one theme are bundled as on-demand chunks; unknown/plain-text files avoid loading Shiki. Future spreadsheet and true diff renderers should follow the same pattern and keep large content outside tldraw and Zustand stores.

## Smart Resource Loading

The built-in `resource-performance` plugin contributes settings for smart resource loading and a configurable resource-window threshold (2–100, default 8). The host owns the runtime policy:

- Below the threshold, every resource node remains loaded.
- At or above the threshold, every resource whose page bounds intersect the viewport at a readable physical size remains loaded, even when that count exceeds the configured threshold.
- Nodes outside the viewport or rendered too small to read compete for the remaining keep-alive slots; the closest nodes remain loaded and only the excess nodes are deferred.
- Deferred nodes retain their lightweight shape reference but do not fetch text, instantiate Shiki/Markdown, decode media, or mount remote iframes.
- Moving a deferred node into the readable viewport or zooming it to a readable size automatically restores its provider and renderer.

For example, with threshold 5 and six resource nodes where two are readable in the viewport, those two are always kept alive, the three nearest offscreen nodes fill the remaining slots, and only the farthest sixth node is disconnected. When zoomed far enough out that all nodes are unreadable, the nearest five remain alive.

## Board References

`ResourceShape` is a host-owned generic shape. It records resource kind, local path or complete persistent URL, cwd, display name, preview metadata, optional start/end line and column targets, and originating terminal/Agent. It does not embed preview bytes, file contents, or a remote page. On mount, the shape loads its provider document and renders the selected plugin renderer directly inside the board node. Reopening the same file with a different range updates the existing Shape's target instead of creating a duplicate.

Pinning an existing local path or persistent URL selects its existing shape instead of creating a duplicate. New shapes carry a transient host-side focus request; after their provider finishes loading or reports an error, the shape selects itself and the editor animates the viewport to it. Default sizes are chosen for actual reading and interaction: web pages 1100×720, code/Markdown 900×620, PDF/video 1000×680, images 900×650, audio 720×300, and directories 420×240. Mixed multi-file drops are laid out from their real recommended dimensions rather than fixed card offsets. Removing a shape only removes the board reference. A migration adds URL and sensitivity fields to existing local-only resource shapes without rewriting unrelated shapes.

## Terminal and Canvas Events

Terminal-local events are stopped at the terminal container after xterm's target handlers have run, while pointer-down and wheel retain their dedicated board-node and xterm handling. This keeps normal terminal focus, selection, paste, TUI mouse input, and scrolling inside the terminal instead of triggering tldraw gestures.

The modified-click fallback hit-tests the visible xterm screen using its painted bounds and renderer cell dimensions, including when the board is zoomed. It intercepts `mousedown` before TUI mouse forwarding and activates on `mouseup` without exposing the terminal instance to any resource plugin.

`ResourceShape` follows the same host event boundary: the header remains a tldraw drag handle, while the content surface enters shape edit mode and stops wheel, pointer, mouse, touch, keyboard, context-menu, and click propagation after internal controls receive them. Code and Markdown scrollers use contained overscroll, so hovering the node and scrolling moves its content instead of zooming or panning the board. Text selection, links, audio/video controls, and PDF iframe interaction remain available.
