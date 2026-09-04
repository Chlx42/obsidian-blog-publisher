# Jekyll 博客示例

Jekyll 是 Ruby 生态的静态博客框架，使用 YAML frontmatter 和特殊的文件命名规范（`YYYY-MM-DD-slug.md`）。此示例展示如何：

- 同步 Obsidian 文章到 Jekyll 的 `_posts/` 目录
- 自动生成日期前缀文件名
- 处理 `publishDate` 变化导致的文件名变化（自动重命名并删旧文件）
- 实现 manifest 驱动的清理

## 特性

✅ **日期前缀处理** — 自动生成 `YYYY-MM-DD-slug.md` 格式文件名  
✅ **改日期自动重命名** — 改 `publishDate` 后删除旧文件，创建新文件  
✅ **Manifest 清理** — 改标题或取消发布后，旧文件自动删除  
✅ **跨语言集成** — 同步脚本用 Node.js，构建用 Ruby

## 前置条件

- Ruby 3.0+（[安装指南](https://www.ruby-lang.org/en/documentation/installation/)）
- Bundler（`gem install bundler`）
- Node.js 18+（用于同步脚本）
- Obsidian Blog Publisher 插件

## 集成步骤

### 1. 初始化 Jekyll 项目

如果你还没有 Jekyll 博客：

```bash
gem install jekyll bundler
jekyll new my-blog
cd my-blog
```

### 2. 复制同步脚本和配置

```bash
# 从插件仓库复制
cp -r <plugin-repo>/examples/jekyll/scripts/ scripts/
cp <plugin-repo>/examples/jekyll/package.json .

# 如果你是全新项目，也可以复制 Gemfile 和 _config.yml
cp <plugin-repo>/examples/jekyll/Gemfile .
cp <plugin-repo>/examples/jekyll/_config.yml .
```

### 3. 安装依赖

```bash
# Ruby 依赖
bundle install

# npm（用于运行同步脚本）
npm install  # 虽然 package.json 里没有依赖，但用 npm scripts 方便
```

### 4. 配置环境变量

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

### 5. 配置插件

打开 Obsidian → 设置 → Blog Publisher：

| 设置项 | 值 |
|--------|-----|
| 博客仓库路径 | `/path/to/my-blog`（Jekyll 项目根目录） |
| 文章文件夹 | `博客`（vault 内相对路径） |
| 包管理器 | npm（或 pnpm/yarn） |
| 同步命令 | `run blog:sync` |
| 构建命令 | `run blog:build` |
| 发布命令 | `run blog:publish` |
| 开发预览命令 | `run server -- -P <port>` |
| 生产预览命令 | `run server -- -P <port>` |

**注意：** Jekyll 用 `-P` 指定端口（大写），`<port>` 占位符会被替换。

### 6. 测试同步

```bash
# 手动测试
npm run blog:sync

# 应该看到输出：
# Syncing articles from Obsidian vault...
# Synced: my-post.md → 2024-01-01-hello-world.md
# __BLOG_RESULT__{"initialized":[],"published":["博客/my-post.md"],"removed":[],"slugs":{"博客/my-post.md":"hello-world"}}
```

### 7. 在 Obsidian 中使用

- 点击侧边栏的博客图标打开面板
- 点击「预览」启动 Jekyll 开发服务器
- 改文章，保存后自动同步
- 点击「发布」执行 build + git push

## Frontmatter 映射

| Obsidian 字段 | Jekyll 字段 | 说明 |
|--------------|-----------|------|
| `title` | `title` | 文章标题 |
| `publishDate` | `date` | 发布日期（用于文件名和排序） |
| `tags` | `tags` | 标签数组 |
| `categories` | `categories` | 分类数组 |
| `description` | `description` | 摘要 |
| `heroImage` | `image` | 封面图 |
| `publish` | （插件用）| 必须为 `true` 才会同步 |
| `draft` | （插件用）| `true` 时不会同步 |
| — | `layout` | 自动设为 `post` |

**示例：**

Obsidian frontmatter：
```yaml
---
title: Jekyll 入门
publishDate: 2024-01-15
tags:
  - jekyll
  - tutorial
categories:
  - 技术
description: Jekyll 博客搭建指南
publish: true
draft: false
---
```

转换为 Jekyll（文件名：`2024-01-15-jekyll-入门.md`）：
```yaml
---
layout: post
title: Jekyll 入门
date: 2024-01-15
tags:
  - jekyll
  - tutorial
categories:
  - 技术
description: Jekyll 博客搭建指南
---
```

## 日期前缀处理

Jekyll 要求文章文件名格式为 `YYYY-MM-DD-slug.md`。同步脚本会：

1. 从 `publishDate` 提取日期
2. 从 `title` 生成 slug
3. 组合成 `2024-01-15-hello-world.md`

**改日期的特殊处理：**

场景：你把文章的 `publishDate` 从 `2024-01-01` 改成 `2024-01-15`

1. 第一次同步：生成 `2024-01-01-hello-world.md`
2. 改日期后再次同步：
   - 生成 `2024-01-15-hello-world.md`
   - 检测到旧文件 `2024-01-01-hello-world.md` 的日期前缀不同
   - 自动删除旧文件

**效果：** 你的 Jekyll 站点只有正确日期的文件，旧日期的文件不会残留。

## Manifest 清理原理

与其他示例相同，通过对比新旧 manifest 自动删除改名或取消发布的文章。

**额外处理：** Jekyll 示例还会检测日期前缀变化，即使 slug 不变，只要日期改了，也会删除旧文件。

```javascript
// 检查日期前缀变化
const oldFile = oldManifest[vaultPath]
if (oldFile && oldFile !== outputFile) {
  // 旧文件的日期前缀和新文件不同，删除
  unlinkSync(join(CONTENT_DIR, oldFile))
}
```

## Jekyll 主题

默认使用 `minima` 主题。更换主题：

1. 在 `Gemfile` 添加主题 gem：
   ```ruby
   gem "jekyll-theme-hacker"
   ```

2. 运行 `bundle install`

3. 在 `_config.yml` 改 `theme`：
   ```yaml
   theme: jekyll-theme-hacker
   ```

更多主题：[Jekyll Themes](https://jekyllrb.com/docs/themes/)

## 部署

### GitHub Pages

Jekyll 原生支持 GitHub Pages。只需：

1. 推送代码到 GitHub 仓库
2. 在仓库设置 → Pages → Source 选择分支
3. GitHub 自动构建和部署

详见：[GitHub Pages 文档](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll)

### 其他平台

- **Netlify**：连接 git 仓库，构建命令 `bundle exec jekyll build`
- **Vercel**：同上
- **自己的服务器**：构建后部署 `_site/` 目录

## 常见问题

### Jekyll serve 启动失败

检查：
1. Ruby 和 Bundler 已安装
2. 运行过 `bundle install`
3. 端口未被占用

### 文章没有显示

确认：
1. 文件名格式正确：`YYYY-MM-DD-slug.md`
2. frontmatter 包含 `layout: post`
3. `publishDate` 不在未来（Jekyll 默认不显示未来日期的文章）

### 中文 slug

默认转换只保留英文。对中文标题，建议：
1. 在 Obsidian 文章里手动加 `slug` 字段（需修改同步脚本支持）
2. 或安装 `pinyin` 包生成拼音 slug（见 Hugo 示例）

### 图片路径

Jekyll 的图片放在 `assets/images/` 或 `images/` 目录。可以在同步脚本里添加图片复制逻辑（参考 Astro 示例）。

## 自定义

### 修改输出目录

默认 `_posts/`，改 `scripts/blog/sync.mjs` 的 `CONTENT_DIR`：

```javascript
const CONTENT_DIR = join(process.cwd(), '_drafts')  // 改为草稿文件夹
```

### 添加自定义字段

在 `convertFrontmatter` 里添加：

```javascript
function convertFrontmatter(obsidianFm) {
  const jekyllFm = {
    // ... 现有字段
    author: obsidianFm.author || 'Anonymous',
    comments: obsidianFm.enableComments !== false
  }
  return jekyllFm
}
```

### 支持手动 slug

如果 Obsidian 文章里有 `slug` 字段，优先使用：

```javascript
const slug = frontmatter.slug || generateSlug(frontmatter.title || basename(file, '.md'))
```

## 协议输出

符合 [PROTOCOL.md](../../PROTOCOL.md)：

```
__BLOG_RESULT__{"initialized":[],"published":["博客/post1.md"],"removed":["2024-01-01-old-slug.md"],"slugs":{"博客/post1.md":"hello-world"}}
```

**注意：** `slugs` 里的值是去掉日期前缀的纯 slug（`hello-world`，不是 `2024-01-15-hello-world`）。

## 参考资源

- [Jekyll 官方文档](https://jekyllrb.com/docs/)
- [Jekyll GitHub](https://github.com/jekyll/jekyll)
- [GitHub Pages 指南](https://docs.github.com/en/pages)

## License

MIT
