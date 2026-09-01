# Jekyll 示例

同步脚本用 Node 写（不用装额外 Ruby 依赖就能跑），构建和预览交给 Jekyll 自己的
`bundle exec` 命令。

## 字段映射

| Obsidian | Jekyll | 说明 |
|----------|--------|------|
| `publish` | — | 插件用它决定同步与否，不写进输出 |
| `title` | `title` | 缺失时用文件名 |
| `publishDate` | `date` + 文件名前缀 | Jekyll 要求 `_posts/YYYY-MM-DD-slug.md` |
| `description` | `description` | |
| `tags` | `tags` | |
| `heroImage` | `image` | 主题相关，按需改 |
| `draft` | `published: false` | Jekyll 用 `published` 控制可见性 |

缺 `publishDate` 时用当天日期作文件名前缀，避免 Jekyll 直接忽略这篇。

## 使用方法

1. 复制 `scripts/blog.mjs` 到你的 Jekyll 项目

2. 在 `package.json` 添加脚本

   ```json
   {
     "scripts": {
       "blog": "node scripts/blog.mjs sync",
       "blog:build": "node scripts/blog.mjs build",
       "blog:publish": "node scripts/blog.mjs publish"
     }
   }
   ```

3. 手动运行

   ```bash
   BLOG_VAULT_ROOT=/path/to/vault BLOG_ARTICLES_FOLDER=blog npm run blog
   ```

## 插件配置

Jekyll 的预览命令不走 npm，有两种配法。

### 方案 A：npm 包一层（推荐）

在 `package.json` 里加

```json
{
  "scripts": {
    "dev": "bundle exec jekyll serve --unpublished",
    "preview": "bundle exec jekyll serve"
  }
}
```

插件设置：

| 字段 | 值 |
|------|-----|
| 包管理器 | npm |
| 同步 | `run blog` |
| 构建 | `run blog:build` |
| 发布 | `run blog:publish` |
| 开发预览 | `run dev -- --host <host> --port <port>` |
| 生产预览 | `run preview -- --host <host> --port <port>` |

同步脚本把草稿写成 `published: false` 留在 `_posts/` 里（不是 `_drafts/`），
所以开发预览要 `--unpublished` 才能看到，`--drafts` 对它无效。

### 方案 B：直接用 bundle

插件设置：

| 字段 | 值 |
|------|-----|
| 包管理器 | 自定义路径 |
| 可执行文件路径 | `bundle` 的绝对路径（`which bundle` 查） |
| 同步 | `exec node scripts/blog.mjs sync` |
| 构建 | `exec jekyll build` |
| 开发预览 | `exec jekyll serve --unpublished --host <host> --port <port>` |
| 生产预览 | `exec jekyll serve --host <host> --port <port>` |

方案 B 把所有命令都套在同一个可执行文件下，同步那步得靠 `bundle exec node`
绕一圈，不如方案 A 直观。

## 已知取舍

- `blog:build` 和 `blog:publish` 依赖 `bundle` 在 PATH 里。插件会把
  `/opt/homebrew/bin`、`/usr/local/bin` 补进 PATH，rbenv/rvm 装的 Ruby
  可能还是找不到——那种情况用方案 B，填 `bundle` 的绝对路径
- 中文标题的 slug 会退化成 `post-<hex>`，要拼音就装 `pinyin-pro`，
  参考 [Astro 示例](../astro/scripts/blog/core.ts)
