# Architecture

Obsidian Blog Publisher 的架构设计围绕三个核心目标：**可定制、可扩展、可靠**。不替你实现转换逻辑，而是驱动你自己的构建脚本，用 manifest 追踪变更，用状态机保证流程一致性。

## 设计原则

### 1. 协议驱动，而非框架适配

**不做框架适配器。** 插件不关心你用 Astro 还是 Hugo，只关心你的脚本是否输出约定的 JSON。

**为什么？**
- 框架适配器很快过时（框架更新、API 变更）
- 每个框架的使用场景差异大（主题、插件、部署方式）
- 用户比插件更了解自己的构建流程

**协议设计：**
```typescript
// 构建脚本输出一行：
__BLOG_RESULT__{"initialized":[],"published":["blog/post.md"],"removed":[],"slugs":{"blog/post.md":"hello-world"}}

// 插件解析后存储为 manifest：
{
  "lastManifest": {
    "blog/post.md": "/blog/hello-world"
  }
}

// 下次同步时对比差异：
const removed = oldPaths.filter(p => !newPaths.includes(p))
// 删除不在新 manifest 里的文件
```

见 [PROTOCOL.md](PROTOCOL.md) 完整规范。

### 2. 运行时抽象，而非硬编码

**支持任意可执行文件。** Bun、npm、pnpm、yarn、Ruby、Python、Go，甚至自己编译的二进制文件。

**架构：**
```typescript
interface RuntimeConfig {
  type: 'bun' | 'npm' | 'pnpm' | 'yarn' | 'custom'
  executable: string  // 解析后的绝对路径
  label: string       // 用于日志显示
}

function spawnCommand(runtime: RuntimeConfig, args: string[], options: SpawnOptions): ChildProcess {
  // 替换占位符：<port> → 4173, <host> → 127.0.0.1
  const resolvedArgs = args.map(arg => arg.replace('<port>', String(port)).replace('<host>', host))
  
  // 组装 PATH：优先用运行时所在目录
  const path = [dirname(runtime.executable), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':')
  
  return spawn(runtime.executable, resolvedArgs, { cwd, env: { ...process.env, PATH } })
}
```

**探测顺序：** Bun → npm → pnpm → yarn（保持最佳体验）

**自定义运行时：** 填绝对路径指向任意可执行文件，配合自定义命令即可集成任意构建工具。

### 3. 状态机保证一致性

**任务生命周期：**
```
idle ─┬─> installing ──> syncing ──> building ──> publishing ──> idle
      │                      │            │
      └──> starting-preview ─┴──> previewing ──> stopping-preview ──> idle
```

**规则：**
- `isBusy(state)` 返回 `true` 时不接受新任务
- 预览中可以同步，但不能构建或发布
- 每个状态有明确的进入条件和退出条件
- 异常时自动回到 `idle`

**实现：**
```typescript
export function isBusy(state: BlogRunnerState): boolean {
  return state !== 'idle' && state !== 'previewing'
}

async publish() {
  if (isBusy(this.state)) throw new Error('任务进行中')
  
  this.setState('installing')
  await this.runCommand(this.settings.commands.install)
  
  this.setState('syncing')
  await this.runCommand(this.settings.commands.sync)
  
  this.setState('building')
  await this.runCommand(this.settings.commands.build)
  
  this.setState('publishing')
  await this.runCommand(this.settings.commands.publish)
  
  this.setState('idle')
}
```

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Obsidian Plugin                        │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │  UI Layer    │   │  Core Logic  │   │   Store      │   │
│  │              │   │              │   │              │   │
│  │ - Panel      │◄──┤ - TaskRunner │◄──┤ - State     │   │
│  │ - StatusBar  │   │ - Runtime    │   │ - Logs       │   │
│  │ - Settings   │   │ - Frontmatter│   │ - Articles   │   │
│  │ - Modals     │   │ - Validator  │   │ - Manifest   │   │
│  └──────────────┘   └──────┬───────┘   └──────────────┘   │
└─────────────────────────────┼───────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Child Process  │
                    │                 │
                    │  User's Build   │
                    │  Script         │
                    │                 │
                    │  (任意语言)     │
                    └────────┬────────┘
                             │
                             ▼ 输出一行 JSON
                    ┌─────────────────┐
                    │   Site Repo     │
                    │                 │
                    │  - content/     │
                    │  - static/      │
                    │  - public/      │
                    └─────────────────┘
```

## 核心模块

### 1. BlogStore - 事件驱动的状态管理

**职责：** 集中管理插件状态，所有 UI 组件订阅更新。

**状态结构：**
```typescript
interface BlogState {
  task: BlogRunnerState           // 当前任务状态
  logs: LogEntry[]                // 构建日志（最近 300 行）
  lastResult: SyncSummary | null  // 最近一次同步结果
  articles: ArticleIndex | null   // 文章列表和分组
  previewUrl: string | null       // 预览服务器 URL
}
```

**订阅机制：**
```typescript
// UI 组件订阅
this.register(this.store.subscribe(() => {
  this.renderStatusBar()
}))

// 状态更新
this.store.setTask('syncing')
this.store.appendLog('Syncing articles...', 'info')
```

**优势：**
- 解耦：UI 组件不知道彼此存在
- 统一：所有状态变更走同一个通道
- 可测试：Store 是纯逻辑，无 Obsidian API 依赖

### 2. TaskRunner - 状态机驱动的任务调度

**职责：** 执行构建命令，管理进程生命周期，解析输出。

**关键方法：**
```typescript
class TaskRunner {
  async togglePreview(): Promise<boolean>    // 启动/停止预览
  async publish(): Promise<void>             // 完整发布流程
  async syncPreviewContent(): Promise<void>  // 预览中增量同步
  
  private async runCommand(args: string[]): Promise<void>
  private handleLine(line: string): void     // 解析输出行
  private parseResult(line: string): SyncSummary | null
}
```

**进程管理：**
- 预览服务器：detached 模式，插件退出时自动清理
- 构建任务：attached 模式，等待完成
- 端口冲突：自动探测 + 1 重试
- 退出码：非 0 立即中断并抛异常

**输出解析：**
```typescript
private handleLine(line: string) {
  const trimmed = line.trim()
  
  // 解析结果行
  if (trimmed.startsWith(this.settings.resultLinePrefix)) {
    const json = trimmed.slice(this.settings.resultLinePrefix.length)
    this.result = JSON.parse(json)
    return
  }
  
  // 分类日志
  const level = classifyLine(trimmed)  // 'info' | 'error'
  this.store.appendLog(trimmed, level)
}
```

### 3. Runtime Abstraction - 跨运行时支持

**探测逻辑：**
```typescript
function detectRuntime(settings: BlogPublisherSettings): RuntimeConfig | null {
  if (settings.runtime === 'custom') {
    return existsSync(settings.customRuntimePath) 
      ? { type: 'custom', executable: settings.customRuntimePath, label: basename(settings.customRuntimePath) }
      : null
  }
  
  const candidates = getRuntimeCandidates(settings.runtime)  // Bun 优先
  for (const { paths, type, label } of candidates) {
    for (const path of paths) {
      const resolved = isAbsolute(path) ? path : resolve(homedir(), path)
      if (existsSync(resolved)) return { type, executable: resolved, label }
    }
  }
  return null
}
```

**命令组装：**
- npm/pnpm/yarn：直接传参（`['run', 'blog']`）
- Bun：直接传参（`['run', 'blog']`）
- 自定义：用户自己写完整命令

**PATH 组装：**
```typescript
const path = [
  dirname(runtime.executable),  // 运行时所在目录
  '/opt/homebrew/bin',          // Homebrew (macOS)
  '/usr/local/bin',             // 常见二进制目录
  '/usr/bin',
  process.env.PATH ?? ''
].join(':')
```

### 4. Article Index - 文章扫描和分组

**扫描流程：**
```typescript
function buildIndex(): ArticleIndex {
  const folder = vault.getAbstractFileByPath(articlesFolder)
  // 文章目录内的 md + 目录外标记 publish: true 的 md（frontmatter 全部来自 metadataCache）
  const files = getAllMarkdownFiles(folder).concat(getPublishMarkedFilesOutside(folder))
  
  const entries = files.map(file => {
    const frontmatter = metadataCache.getFileCache(file)?.frontmatter
    const status = inspectArticle(frontmatter, validator)
    
    return {
      path: file.path,
      basename: file.basename,
      title: frontmatter?.title || file.basename,
      frontmatter,
      status
    }
  })
  
  return groupByStatus(entries)
}
```

**状态分组：**
```typescript
type ArticleStatusCode = 'uninitialized' | 'unpublished' | 'invalid' | 'draft' | 'pending' | 'live'

interface ArticleGroup {
  code: ArticleStatusCode
  label: string
  items: ArticleEntry[]
}

// 面板显示顺序（需要动手的排前面）：
// 1. invalid - 需检查（publish: true, 有 issue）
// 2. pending - 待发布（publish: true，还没推送，或上线后内容有修改）
// 3. live - 已上线（publish: true，推送成功且内容未再修改）
// 4. draft - 草稿（publish: true, 无 issue, draft: true）
// 5. unpublished - 未发布（publish !== true）
// 6. uninitialized - 未初始化（无 frontmatter）
//
// 「已上线」的依据是插件在每次推送成功后记录的快照
// （source key → { slug, mtime }，持久化在 data.json）。
// 文件 mtime 和快照不一致就视为有修改，回到「待发布」。
```

### 5. Validator System - 可插拔的校验规则

**加载机制：**
```typescript
async function loadValidator(path: string): Promise<Validator | null> {
  if (!path.trim()) return null
  try {
    const module = require(path)  // CommonJS require
    const fn = module.collectArticleIssues ?? module.default
    return typeof fn === 'function' ? fn : null
  } catch {
    return null  // 降级为不校验
  }
}
```

**校验函数签名：**
```typescript
type Validator = (frontmatter: Record<string, unknown>) => string[]

// 示例：Astro 规则
export function collectArticleIssues(fm: Record<string, unknown>): string[] {
  const issues: string[] = []
  
  if (!fm.title?.trim()) issues.push('title 不能为空')
  if (!fm.description?.trim()) issues.push('description 不能为空')
  if (!fm.publishDate) issues.push('publishDate 必填')
  if (!Array.isArray(fm.tags) || fm.tags.length === 0) issues.push('tags 至少一个')
  
  return issues
}
```

**默认行为：** 不配置校验器时，只检查 `publish` 字段。

**错误处理：** 加载失败时在设置页显示原因，插件继续运行。

## 数据流

### 发布流程

```
用户点击「发布」
  ↓
TaskRunner.publish()
  ↓
Store.setTask('installing')
  ↓
spawnCommand(['install', '--frozen-lockfile'])
  ↓ 输出
handleLine() → Store.appendLog()
  ↓ 完成
Store.setTask('syncing')
  ↓
spawnCommand(['run', 'blog', '--json'])
  ↓ 输出哨兵行
parseResult() → Store.setResult(summary)
  ↓ 输出普通行
handleLine() → Store.appendLog()
  ↓ 完成
Store.setTask('building')
  ↓
spawnCommand(['run', 'blog:build', '--json'])
  ↓ 输出
handleLine() → Store.appendLog()
  ↓ 完成
Store.setTask('publishing')
  ↓
spawnCommand(['run', 'blog:publish', '--json'])
  ↓ 输出
handleLine() → Store.appendLog()
  ↓ 完成
Store.setTask('idle')
  ↓
SummaryModal.open(summary)
```

### 预览流程

```
用户点击「预览」
  ↓
TaskRunner.togglePreview()
  ↓
isPortOpen(4173) ? 否
  ↓
Store.setTask('installing')
  ↓
spawnCommand(['install', '--frozen-lockfile'])
  ↓
Store.setTask('syncing')
  ↓
spawnCommand(['run', 'blog', '--json'])
  ↓
Store.setTask('starting-preview')
  ↓
spawnCommand(['run', 'dev', '--host', '127.0.0.1', '--port', '4173'])
  ↓ detached 模式，不等待完成
detectServerReady() → 轮询端口直到可访问
  ↓
Store.setTask('previewing')
Store.setPreviewUrl('http://127.0.0.1:4173')
  ↓
window.open(previewUrl, '_blank')
```

### 自动同步流程

```
用户保存文章
  ↓
app.vault.on('modify')
  ↓
scheduleAutoSync()
  ↓ debounce 800ms
autoSyncTimer 触发
  ↓
TaskRunner.syncPreviewContent()
  ↓ 只在 previewing 状态下执行
Store.setTask('syncing')
  ↓
spawnCommand(['run', 'blog', '--json'])
  ↓
Store.setTask('previewing')
```

## Manifest 清理原理

这是插件的**核心价值**。详细算法：

```typescript
// 1. 同步前加载旧 manifest
const oldManifest = loadManifest()  // { "blog/post1.md": "/blog/hello-world" }

// 2. 同步所有 publish: true 的文章
const newManifest = {}
for (const file of publishedFiles) {
  const slug = generateSlug(file.title)
  const outputPath = `/blog/${slug}`
  writeFile(contentDir, `${slug}.md`, convertedContent)
  newManifest[file.vaultPath] = outputPath
}

// 3. 计算需要删除的文件
const removed = []
for (const [vaultPath, outputPath] of Object.entries(oldManifest)) {
  if (!newManifest[vaultPath]) {
    // vault 里的文章不存在了，或者取消发布了
    unlinkFile(contentDir, outputPath)
    removed.push(outputPath)
  }
}

// 4. 保存新 manifest
saveManifest(newManifest)

// 5. 输出结果
console.log(`__BLOG_RESULT__${JSON.stringify({ published: Object.keys(newManifest), removed, slugs: newManifest })}`)
```

**场景覆盖：**
- ✅ 改标题（slug 变）→ 新旧都在 `newManifest`，但 key 不同 → 旧的被删
- ✅ 取消发布 → 不在 `newManifest` → 被删
- ✅ 删除文章 → 不在 `newManifest` → 被删
- ✅ 恢复发布 → 重新进入 `newManifest` → 重新生成

**特殊处理（Jekyll）：**
```typescript
// Jekyll 的文件名包含日期前缀：2024-01-01-hello-world.md
// 改 publishDate 会导致文件名变化

const oldFile = `${oldDate}-${slug}.md`
const newFile = `${newDate}-${slug}.md`

if (oldFile !== newFile) {
  unlinkFile(contentDir, oldFile)
  removed.push(oldFile)
}
```

## 扩展点

### 添加新框架支持

1. **写同步脚本**（任意语言）
   - 读取 vault 文章
   - 转换 frontmatter
   - 生成 slug
   - 写入站点目录
   - 对比 manifest 清理旧文件

2. **输出协议**
   ```
   __BLOG_RESULT__{"initialized":[],"published":[],"removed":[],"slugs":{}}
   ```

3. **添加示例**
   - `examples/<framework>/` 目录
   - README 说明配置
   - 可选：自定义校验器

见 [CONTRIBUTING.md](CONTRIBUTING.md) 详细步骤。

### 添加新校验规则

```typescript
// my-validator.js
export function collectArticleIssues(frontmatter) {
  const issues = []
  
  // 自定义规则
  if (!frontmatter.author) issues.push('author 必填')
  if (frontmatter.wordCount < 500) issues.push('字数不足 500')
  
  return issues
}
```

编译后在插件设置里填路径即可。

### 集成新运行时

在插件设置里选「自定义路径」，填可执行文件绝对路径：
- Python: `/usr/bin/python3`
- Ruby: `/usr/bin/ruby`
- Deno: `/usr/local/bin/deno`
- 自定义二进制: `/path/to/my-blog-cli`

配合自定义命令（例如 `['scripts/sync.py', '--json']`）即可。

## 设计取舍

### 为什么用 child_process 而不是直接集成 Astro API？

**决策：** 进程隔离，协议驱动。

**理由：**
1. **框架无关** - 不被任何框架的 API 锁定
2. **安全隔离** - 构建脚本崩溃不会让插件崩溃
3. **升级独立** - 框架更新不影响插件
4. **语言无关** - 支持 Node/Bun/Python/Ruby/Go

**代价：**
- 进程启动开销（~100ms）
- 无法直接调用框架 API（需要写脚本包装）

### 为什么用 manifest 而不是 git diff？

**决策：** Manifest 文件记录产出。

**理由：**
1. **不依赖 git** - 用户可能用 Rsync、FTP、云存储部署
2. **语义明确** - manifest 记录「这个 vault 文章对应那个站点文件」
3. **兼容性** - git diff 在子模块、sparse checkout 场景下不可靠
4. **可预测** - 看 manifest 就知道下次会删什么

**代价：**
- 额外文件（`.blog-manifest.json`）
- 手动删除 manifest 会导致清理失效

### 为什么校验器用 require() 而不是 import()？

**决策：** CommonJS require，运行时加载。

**理由：**
1. **兼容性** - 用户的校验器不需要 build 步骤
2. **沙箱** - require 不执行顶层代码，import 会
3. **同步** - 校验是同步过程，不需要 async

**代价：**
- 校验器必须是 `.js`（不能是 `.ts`）
- 需要手动编译 TypeScript 校验器

### 为什么状态栏不显示错误详情？

**决策：** 状态栏只显示摘要，详情在日志弹窗。

**理由：**
1. **空间有限** - 状态栏只能容纳一行文字
2. **降低噪音** - 多数时候用户不关心日志
3. **渐进展示** - 需要时点击状态栏打开详细日志

**代价：**
- 用户需要点两次才能看到错误（状态栏 → 日志弹窗）

## 性能考虑

### 文章扫描

**当前实现：** 每次文件变更全量重建索引：文章目录内的 md + 目录外标记
`publish: true` 的 md（frontmatter 读内存里的 metadataCache，不碰文件）。
vault 级的目录外扫描只在同步脚本里做，插件不重复扫盘。

**优化空间：**
- 增量扫描（只更新变更的文章）
- 缓存 frontmatter 解析结果
- 虚拟滚动（文章超过 1000 篇时）

**现状：** 100 篇文章扫描耗时 ~50ms，暂不需要优化。

### 日志存储

**当前实现：** 内存存储最近 300 行。

**限制：**
```typescript
const MAX_LOG_LINES = 300

this.patch({ 
  logs: logs.length > MAX_LOG_LINES 
    ? logs.slice(-MAX_LOG_LINES) 
    : logs 
})
```

**原因：** 长构建输出（如 Webpack 打包）会产生几千行日志，全保存会占用大量内存。

### 自动同步防抖

**当前实现：** 800ms debounce。

```typescript
const AUTO_SYNC_DEBOUNCE_MS = 800

this.autoSyncTimer = window.setTimeout(() => {
  void this.runner.syncPreviewContent()
}, AUTO_SYNC_DEBOUNCE_MS)
```

**可配置：** 未来可以让用户自己设置（Week 4 计划）。

## 测试策略

### 单元测试

- `core/` 模块全覆盖（无 Obsidian API 依赖）
- Mock `spawn()` 验证命令组装
- Mock `fs` 验证 manifest 读写

### 集成测试

- 框架示例脚本独立测试（`examples/<framework>/test/`）
- 真实运行 sync/build/publish
- 验证输出格式和文件清理

### 手动测试

- 不同操作系统（macOS / Windows / Linux）
- 不同运行时（Bun / npm / pnpm / yarn）
- 不同框架（Astro / Hugo / Hexo / Jekyll）

**回归测试矩阵：** 见 [CONTRIBUTING.md](CONTRIBUTING.md#测试)

## 安全考虑

### 命令注入

**风险：** 用户配置的命令可能包含恶意代码。

**缓解：** 不拼接字符串，使用数组传参：
```typescript
// ❌ 危险
exec(`${runtime} ${command}`)

// ✅ 安全
spawn(runtime, args, { cwd })
```

### 路径遍历

**风险：** 构建脚本可能写入 vault 外的文件。

**缓解：**
1. 插件只读 vault，只写博客仓库
2. 路径校验（`blogRepository` 必填且存在）
3. 进程 `cwd` 限定在 `blogRepository`

### 校验器代码执行

**风险：** 用户指定的校验器是任意 JavaScript。

**缓解：**
1. 校验器在主进程运行（无沙箱）
2. 依赖用户信任自己的文件
3. 文档明确说明风险

**未来：** 可以用 Worker 隔离（Obsidian API 限制较多）。

## 未来方向

### Week 2（已排期）
- 状态分组折叠/展开
- 预览 URL 复制增强
- 键盘快捷键
- 错误恢复 UI
- 乐观 UI 更新

### Week 3-4（计划中）
- Manifest diff 可视化（同步前显示变更预览）
- Dry-run 模式（测试构建脚本）
- 自动同步配置（防抖时间、启用条件）

### 长期
- 多博客项目切换（workspace 概念）
- 图形化命令配置（下拉选项 + 参数填空）
- 模板项目生成器（`npx create-obsidian-blog-publisher`）
- 远程 dev server 支持（通过 SSH 隧道）
- Worker 沙箱校验器（安全隔离）

## 参考资料

- [Obsidian Plugin API](https://docs.obsidian.md/Plugins)
- [Node.js child_process](https://nodejs.org/api/child_process.html)
- [YAML Frontmatter](https://jekyllrb.com/docs/front-matter/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
