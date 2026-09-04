# Hexo 博客示例

Hexo 是基于 Node.js 的静态博客框架，使用 YAML frontmatter。此示例展示如何：

- 同步 Obsidian 文章到 Hexo 的 `source/_posts/`
- 转换 frontmatter（`publishDate` → `date`，`heroImage` → `cover`）
- 实现 manifest 驱动的清理（改 slug 自动删旧文件）
- 集成 Hexo 自己的 `generate` 和 `deploy` 命令

## 特性

✅ **Manifest 清理** — 改标题或取消发布后，旧文件自动删除  
✅ **Hexo 原生命令** — 使用 `hexo generate` 和 `hexo deploy`  
✅ **零额外依赖** — 只用 Node.js 标准库 + Hexo 自带工具  
✅ **草稿过滤** — `draft: true` 的文章不会同步

## 前置条件

- Node.js 18+
- Hexo CLI（`npm install -g hexo-cli`）
- Obsidian Blog Publisher 插件

## 集成步骤

### 1. 初始化 Hexo 项目

如果你还没有 Hexo 博客：

```bash
hexo init my-blog
cd my-blog
npm install
```

### 2. 复制同步脚本

```bash
# 从插件仓库复制
cp <plugin-repo>/examples/hexo/scripts/sync.mjs scripts/

# 或者直接把整个 package.json 替换
cp <plugin-repo>/examples/hexo/package.json .
```

### 3. 配置环境变量

创建 `.blog-config.json`：

```json
{
  "vaultRoot": "/path/to/obsidian-vault",
  "articlesFolder": "博客"
}
```

或使用环境变量：

```bash
export BLOG_VAULT_ROOT="/path/to/obsidian-vault"
export BLOG_ARTICLES_FOLDER="博客"
```

### 4. 配置部署方式

编辑 `_config.yml` 的 `deploy` 部分：

```yaml
deploy:
  type: git
  repo: https://github.com/yourusername/yourusername.github.io.git
  branch: main
```

支持的部署方式：GitHub Pages、Netlify、Vercel 等。详见 [Hexo 部署文档](https://hexo.io/docs/one-command-deployment)。

### 5. 配置插件

打开 Obsidian → 设置 → Blog Publisher：

| 设置项 | 值 |
|--------|-----|
| 博客仓库路径 | `/path/to/my-blog`（Hexo 项目根目录） |
| 文章文件夹 | `博客`（vault 内相对路径） |
| 包管理器 | npm（或 pnpm/yarn） |
| 同步命令 | `run blog:sync` |
| 构建命令 | `run blog:build` |
| 发布命令 | `run blog:publish` |
| 开发预览命令 | `run server -- -p <port>` |
| 生产预览命令 | `run server -- -p <port>` |

**注意：** Hexo 用 `-p` 指定端口，`<port>` 占位符会被替换。

### 6. 测试同步

```bash
# 安装依赖
npm install

# 手动测试同步
npm run blog:sync

# 应该看到输出：
# Syncing articles from Obsidian vault...
# Synced: my-post.md → hello-world.md
# __BLOG_RESULT__{"initialized":[],"published":["博客/my-post.md"],"removed":[],"slugs":{"博客/my-post.md":"hello-world"}}
```

### 7. 在 Obsidian 中使用

- 点击侧边栏的博客图标打开面板
- 点击「预览」启动 Hexo 开发服务器
- 改文章，保存后自动同步
- 点击「发布」执行 `hexo generate && hexo deploy`

## Frontmatter 映射

| Obsidian 字段 | Hexo 字段 | 说明 |
|--------------|-----------|------|
| `title` | `title` | 文章标题 |
| `publishDate` | `date` | 发布日期（ISO 8601） |
| `tags` | `tags` | 标签数组 |
| `categories` | `categories` | 分类数组（Hexo 特有） |
| `description` | `description` | 摘要 |
| `heroImage` | `cover` | 封面图 |
| `publish` | （插件用）| 必须为 `true` 才会同步 |
| `draft` | （插件用）| `true` 时不会同步（Hexo 草稿用独立文件夹） |

**示例：**

Obsidian frontmatter：
```yaml
---
title: Hexo 入门
publishDate: 2024-01-01
tags:
  - hexo
  - tutorial
categories:
  - 技术
description: Hexo 博客搭建指南
publish: true
draft: false
---
```

转换为 Hexo：
```yaml
---
title: Hexo 入门
date: 2024-01-01
tags:
  - hexo
  - tutorial
categories:
  - 技术
description: Hexo 博客搭建指南
---
```

## Manifest 清理原理

与 Hugo 示例相同，通过对比新旧 manifest 自动删除改名或取消发布的文章。详见主 README 的「Manifest 清理原理」章节。

## 与 Hexo 自带命令的集成

### 同步脚本做什么

- 读取 Obsidian vault 的文章
- 转换 frontmatter 格式
- 写入 `source/_posts/`
- 清理旧文件

### Hexo 自带命令做什么

- `hexo generate`：生成静态 HTML 到 `public/`
- `hexo deploy`：部署到配置的 git 仓库或服务器
- `hexo server`：本地预览服务器

**集成方式：** 同步脚本在 `build` 和 `publish` 命令里调用 Hexo：

```javascript
// build
execSync('npx hexo generate', { stdio: 'inherit' })

// publish
execSync('npx hexo deploy', { stdio: 'inherit' })
```

## 常见问题

### Hexo server 启动失败

检查端口占用或改端口。Hexo 默认 4000。

### 文章没有同步

确认：
1. `publish: true`
2. `draft` 不是 `true`（草稿不会同步）
3. 文章在正确的文件夹下
4. 环境变量正确

### 部署失败

检查 `_config.yml` 的 `deploy` 配置，确保 git 仓库地址和分支正确。首次部署需要配置 git 凭证。

### 中文标题的 slug

默认转换只保留英文字母。对中文标题，建议：
1. 手动在 frontmatter 里加 `slug: my-slug`
2. 或安装 `pinyin` 包（见 Hugo 示例的「自定义 Slug 生成」）

## 自定义

### 修改输出目录

默认 `source/_posts/`，改 `scripts/sync.mjs` 的 `CONTENT_DIR`：

```javascript
const CONTENT_DIR = join(process.cwd(), 'source/_drafts')  // 改为草稿文件夹
```

### 添加自定义字段

在 `convertFrontmatter` 里添加：

```javascript
function convertFrontmatter(obsidianFm) {
  const hexoFm = {
    // ... 现有字段
    author: obsidianFm.author || 'Anonymous',
    top: obsidianFm.pinned === true  // 置顶
  }
  return hexoFm
}
```

### 图片处理

Hexo 的图片放在 `source/images/` 或启用 `post_asset_folder`。可以在同步脚本里添加图片复制逻辑（参考 Astro 示例）。

## Hexo 主题

Hexo 有丰富的主题生态：[Themes](https://hexo.io/themes/)

安装主题后，在 `_config.yml` 改 `theme` 字段：

```yaml
theme: next  # 或其他主题名
```

## 协议输出

符合 [PROTOCOL.md](../../PROTOCOL.md)：

```
__BLOG_RESULT__{"initialized":[],"published":["博客/post1.md"],"removed":["old-slug.md"],"slugs":{"博客/post1.md":"hello-world"}}
```

## 参考资源

- [Hexo 官方文档](https://hexo.io/docs/)
- [Hexo GitHub](https://github.com/hexojs/hexo)
- [部署到 GitHub Pages](https://hexo.io/docs/github-pages)

## License

MIT
