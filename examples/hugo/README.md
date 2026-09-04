# Hugo 博客示例

Hugo 使用 TOML/YAML frontmatter，与 Astro 不同。此示例展示如何：

- 转换 Obsidian 的 `publishDate` → Hugo 的 `date`
- 处理 `tags` 数组和 `draft` 字段
- 实现 manifest 驱动的文件清理（改 slug 自动删旧文件）
- 使用 Node.js 标准库（零第三方依赖）

## 特性

✅ **Manifest 清理** — 改标题（slug 变了）或取消发布后，旧文件自动删除  
✅ **Frontmatter 转换** — Obsidian 格式 → Hugo YAML  
✅ **零依赖** — 只用 Node.js 标准库  
✅ **完整协议** — 输出 JSON 哨兵行供插件解析

## 前置条件

- Hugo 0.100.0+（[安装指南](https://gohugo.io/installation/)）
- Node.js 18+
- Obsidian Blog Publisher 插件

## 集成步骤

### 1. 初始化 Hugo 项目

如果你还没有 Hugo 博客：

```bash
hugo new site my-blog
cd my-blog
git init
```

### 2. 复制同步脚本

```bash
# 从插件仓库复制
cp -r <plugin-repo>/examples/hugo/scripts/blog/ scripts/

# 添加 package.json
cp <plugin-repo>/examples/hugo/package.json .
```

### 3. 配置环境变量

创建 `.blog-config.json`（或使用环境变量）：

```json
{
  "vaultRoot": "/path/to/obsidian-vault",
  "articlesFolder": "博客"
}
```

或在 shell 配置中：

```bash
export BLOG_VAULT_ROOT="/path/to/obsidian-vault"
export BLOG_ARTICLES_FOLDER="博客"
```

### 4. 配置插件

打开 Obsidian → 设置 → Blog Publisher：

| 设置项 | 值 |
|--------|-----|
| 博客仓库路径 | `/path/to/my-blog`（Hugo 项目根目录） |
| 文章文件夹 | `博客`（vault 内相对路径） |
| 包管理器 | npm（或 pnpm/yarn） |
| 同步命令 | `run blog` |
| 构建命令 | `run blog:build` |
| 发布命令 | `run blog:publish` |
| 开发预览命令 | `run server -- -D --port <port>` |
| 生产预览命令 | `run server -- --port <port>` |

**注意：** Hugo 的 server 命令用 `--port` 而不是 `-p`，占位符 `<port>` 会被替换为实际端口。

### 5. 测试同步

```bash
# 手动测试同步脚本
npm run blog

# 应该看到输出：
# Syncing articles from Obsidian vault...
# Synced: my-post.md → hello-world.md
# __BLOG_RESULT__{"initialized":[],"published":["博客/my-post.md"],"removed":[],"slugs":{"博客/my-post.md":"hello-world"}}
```

### 6. 在 Obsidian 中使用

- 点击侧边栏的博客图标打开面板
- 点击「预览」启动 Hugo 开发服务器
- 改文章标题，保存后自动同步
- 点击「发布」执行 build + git push

## Frontmatter 映射

| Obsidian 字段 | Hugo 字段 | 说明 |
|--------------|-----------|------|
| `title` | `title` | 文章标题 |
| `publishDate` | `date` | 发布日期（ISO 8601） |
| `draft` | `draft` | 草稿标记 |
| `tags` | `tags` | 标签数组 |
| `description` | `description` | 摘要 |
| `heroImage` | `image` | 封面图 |
| `publish` | （插件用）| 必须为 `true` 才会同步 |

**示例：**

Obsidian frontmatter：
```yaml
---
title: Hello World
publishDate: 2024-01-01
draft: false
tags:
  - hugo
  - tutorial
description: My first Hugo post
publish: true
---
```

转换为 Hugo：
```yaml
---
title: Hello World
date: 2024-01-01
draft: false
tags:
  - hugo
  - tutorial
description: My first Hugo post
---
```

## Manifest 清理示例

**场景：** 你把文章标题从「Hello World」改成「Welcome」

1. 第一次同步：
   - 生成 `content/posts/hello-world.md`
   - manifest: `{"博客/my-post.md": "hello-world.md"}`

2. 改标题后再次同步：
   - 生成 `content/posts/welcome.md`
   - 检测到 `hello-world.md` 不在新 manifest 里
   - 自动删除 `content/posts/hello-world.md`
   - 更新 manifest: `{"博客/my-post.md": "welcome.md"}`

**效果：** 你的 Hugo 站点只有新文件，旧 URL 不会残留。

## 自定义

### 修改输出目录

默认输出到 `content/posts/`，修改 `scripts/blog/cli.mjs` 的 `CONTENT_DIR`：

```javascript
const CONTENT_DIR = join(process.cwd(), 'content/blog')  // 改为 blog
```

### 添加自定义字段

在 `convertFrontmatter` 函数里添加映射：

```javascript
function convertFrontmatter(obsidianFm) {
  const hugoFm = {
    // ... 现有字段
    author: obsidianFm.author || 'Anonymous',  // 新增
    categories: obsidianFm.categories || []     // 新增
  }
  return hugoFm
}
```

### 修改 Slug 生成规则

`generateSlug` 函数使用简单的英文转换。对中文标题，可以集成 [pinyin](https://www.npmjs.com/package/pinyin) 包：

```bash
npm install pinyin
```

```javascript
import pinyin from 'pinyin'

function generateSlug(title) {
  return pinyin(title, { style: pinyin.STYLE_NORMAL })
    .flat()
    .join('-')
    .toLowerCase()
}
```

## 常见问题

### Hugo server 启动失败

检查端口是否被占用，或者在插件设置里改成其他端口（默认 1313）。

### 文章没有同步

确认：
1. Obsidian 文章的 `publish: true`
2. 文章在正确的文件夹下（`articlesFolder` 设置）
3. 环境变量 `BLOG_VAULT_ROOT` 和 `BLOG_ARTICLES_FOLDER` 正确

查看日志：Obsidian 命令面板 → `Blog Publisher: 查看最近任务日志`

### 旧文件没有被删除

manifest 存储在 `.blog-manifest.json`，如果手动删过这个文件，插件会认为是首次同步。保留这个文件让清理逻辑生效。

## 脚本说明

### `cli.mjs sync`
- 读取 vault 中 `publish: true` 的文章
- 转换 frontmatter 格式
- 生成 slug 并写入 `content/posts/`
- 对比旧 manifest，删除不该留的文件
- 输出 JSON 结果供插件解析

### `cli.mjs build`
- 调用 `hugo --minify` 构建站点
- 输出当前 manifest 的文章列表

### `cli.mjs publish`
- `git add . && git commit && git push`
- 适用于 GitHub Pages / Netlify / Vercel 等 git 部署

## 进一步集成

### GitHub Actions 自动部署

Hugo 官方有详细的 GitHub Pages 部署指南：
https://gohugo.io/hosting-and-deployment/hosting-on-github/

同步脚本的输出已经兼容 CI 环境（`--json` 模式不打印进度信息）。

### 图片处理

Hugo 的资源目录是 `static/`，可以在同步脚本里添加图片复制逻辑（参考 Astro 示例的 `copyImages` 函数）。

## 协议输出

符合 [PROTOCOL.md](../../PROTOCOL.md) 规范：

```
__BLOG_RESULT__{"initialized":[],"published":["博客/post1.md"],"removed":["old-slug.md"],"slugs":{"博客/post1.md":"hello-world"}}
```

- `initialized`: 首次同步补齐 frontmatter 的文章（本示例不实现，返回空数组）
- `published`: 本次同步的文章（vault 路径）
- `removed`: 本次删除的文件（输出路径）
- `slugs`: vault 路径 → URL slug 映射

## License

MIT
