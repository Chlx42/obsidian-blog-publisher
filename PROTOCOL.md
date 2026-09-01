# 输出协议

插件通过解析构建脚本的 stdout 获取同步结果。这份文档定义了脚本需要遵守的约定。

## 1. 哨兵行

在命令的 stdout 输出一行：

```
<prefix><json>
```

- `<prefix>`：可配置，默认 `__BLOG_RESULT__`
- `<json>`：紧跟前缀的 JSON 对象，中间无空格

插件只解析包含前缀的那一行，其余输出作为日志显示。前缀设为空时不解析结果，
其他功能照常工作。

### JSON Schema

```typescript
{
  initialized: string[]           // 本次补齐了 frontmatter 的文章（vault 相对路径）
  published: string[]             // 本次同步/构建的文章（vault 相对路径）
  removed: string[]               // 本次移除的文章（slug 或路径）
  slugs: Record<string, string>   // vault 相对路径 → URL slug
}
```

四个字段都必填。没有内容时给空数组或空对象，不要省略字段。

`slugs` 用于「复制博客地址」功能：插件把博客地址和 slug 拼成完整 URL。

### 完整示例

```
同步中...
已处理 3 篇文章
__BLOG_RESULT__{"initialized":[],"published":["blog/post1.md","blog/post2.md"],"removed":["old-slug"],"slugs":{"blog/post1.md":"hello-world","blog/post2.md":"second-post"}}
构建完成
```

## 2. 命令约定

### 退出码

- `0`：成功
- 非 `0`：失败，插件显示错误并中断当前任务

插件把退出码作为成败的唯一权威来源。即使 stdout 里没有任何错误信息，
非零退出码也会中断任务。

### 标准流

- **stdout**：人类可读的进度信息 + 哨兵行
- **stderr**：警告和错误信息

插件同时捕获两个流，按内容分类成 info / error 两级。注意不是按流分类——
git 和 bun 都往 stderr 写进度信息，按流分会把正常进度标成错误。

判定为 error 的模式：

- 中文：`失败`、`错误`、`无法`、`不能为空`、`冲突`、`找不到`
- 英文（需词边界）：`error`、`failed`、`fail`、`fatal`、`cannot`、`unexpected`、`✗`

### 占位符

命令配置里可以用：

| 占位符 | 替换为 |
|--------|--------|
| `<port>` | 插件设置的预览端口 |
| `<host>` | `127.0.0.1` |

例如 `run dev --host <host> --port <port>` 会展开成
`run dev --host 127.0.0.1 --port 4173`。

每个参数里只替换第一次出现的占位符。

## 3. 环境变量

插件调用命令时注入：

| 变量 | 内容 |
|------|------|
| `BLOG_VAULT_ROOT` | Obsidian vault 的绝对路径 |
| `BLOG_ARTICLES_FOLDER` | 文章文件夹（vault 内相对路径，已去掉首尾斜杠） |

脚本用这两个变量定位源文件。插件设置是文章目录的唯一来源，脚本不该再维护
一份自己的配置——否则两边不一致时很难排查。

另外插件会把这些目录补进 `PATH`：运行时所在目录、`/opt/homebrew/bin`、
`/usr/local/bin`、`/usr/bin`、`/bin`。macOS 上图形应用拿不到 shell 的 PATH，
子进程里的 `git`、`node` 都靠这个兜底。rbenv / nvm / asdf 这类版本管理器装的
可执行文件不在上述路径里，需要在设置里填绝对路径。

## 4. 预览启动判定

插件认为预览启动成功的条件（任一满足）：

- 日志里出现预览地址（`http://127.0.0.1:<port>/`）
- 端口可以建立 TCP 连接

超时 30 秒。所以预览命令要么把地址打到 stdout，要么真的监听端口——
两个都不满足会报启动超时。

停止预览时插件先对整个进程组发 SIGTERM，2 秒内没退再 SIGKILL。
命令在独立进程组里运行，`astro dev` 这种会 fork 子进程的也能一起收掉。

## 5. 可选：文章校验

在插件设置里配置「文章校验器」后，插件加载该文件并调用导出的函数：

```javascript
// validator.js
exports.collectArticleIssues = function (frontmatter) {
  const issues = []
  if (!frontmatter.title?.trim()) {
    issues.push('title 不能为空')
  }
  if (!frontmatter.description?.trim()) {
    issues.push('description 不能为空')
  }
  return issues
}
```

返回空数组表示通过。插件把返回的每条 issue 显示在面板的文章条目下。

### 注意事项

- 插件用 `require()` 加载，所以必须是 **CommonJS** 格式的 `.js` 文件。
  TypeScript 源码要先编译：

  ```bash
  bun build validator.ts --target=node --format=cjs --outfile=validator.js
  ```

- 函数必须同步返回，不支持 Promise
- 优先读 `collectArticleIssues` 导出，没有则回落到 `default`
- 参数是纯对象（Obsidian metadataCache 里的 frontmatter），不含 Obsidian API
- 加载失败时插件静默降级为不校验，不会中断使用

### 文章状态

插件按以下顺序判定文章状态：

| 状态 | 条件 |
|------|------|
| 未初始化 | 没有 frontmatter |
| 未同步 | `publish !== true` |
| 需检查 | 校验器返回了 issues |
| 草稿 | `draft === true` |
| 可发布 | 以上都不满足 |

没配校验器时「需检查」这档不会出现。

## 6. 参考实现

| 框架 | 脚本 | 特点 |
|------|------|------|
| Astro | [examples/astro/scripts/blog/cli.ts](examples/astro/scripts/blog/cli.ts) | 完整实现，含图片处理和拼音 slug |
| Hugo | [examples/hugo/scripts/blog.mjs](examples/hugo/scripts/blog.mjs) | 零依赖，最小可用示例 |
| Hexo | [examples/hexo/scripts/blog.mjs](examples/hexo/scripts/blog.mjs) | 只做同步，构建交给 Hexo |
| Jekyll | [examples/jekyll/scripts/blog.mjs](examples/jekyll/scripts/blog.mjs) | 日期前缀文件名 |

写新框架的脚本时，从 Hugo 示例改起最快——它是最小的完整实现。
