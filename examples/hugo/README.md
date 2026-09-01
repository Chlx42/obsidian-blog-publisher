# Hugo 示例

零第三方依赖，只用 Node 标准库。演示怎么把 Obsidian 的字段名映射到 Hugo 的约定。

## 字段映射

| Obsidian | Hugo | 说明 |
|----------|------|------|
| `publish` | — | 插件用它决定同步与否，不写进输出 |
| `title` | `title` | 缺失时用文件名 |
| `publishDate` | `date` | Hugo 用 `date` 排序 |
| `description` | `description` | |
| `tags` | `tags` | 数组原样传递 |
| `heroImage` | `featured_image` | 主题相关，按需改 |
| `draft` | `draft` | Hugo 原生支持，`hugo --minify` 会跳过草稿 |

## 使用方法

1. 复制 `scripts/blog.mjs` 到你的 Hugo 项目

2. 在 `package.json` 添加脚本

   ```json
   {
     "scripts": {
       "blog": "node scripts/blog.mjs sync",
       "blog:build": "node scripts/blog.mjs build",
       "blog:publish": "node scripts/blog.mjs publish",
       "dev": "hugo server -D --bind",
       "preview": "hugo server --bind"
     }
   }
   ```

   `dev` 带 `-D` 显示草稿，对应插件的 development 预览模式；`preview` 不带，
   对应 production 模式。

3. 手动运行时需要自己给路径，插件调用时会自动注入

   ```bash
   BLOG_VAULT_ROOT=/path/to/vault BLOG_ARTICLES_FOLDER=blog npm run blog
   ```

## 插件配置

| 字段 | 值 |
|------|-----|
| 包管理器 | npm |
| 同步 | `run blog` |
| 构建 | `run blog:build` |
| 发布 | `run blog:publish` |
| 开发预览 | `run dev -- <host> --port <port>` |
| 生产预览 | `run preview -- <host> --port <port>` |

`hugo server --bind` 后面直接跟主机地址，所以 `<host>` 不需要额外的 `--host` 参数。
要预览 `public/` 里的构建成品，把生产预览换成 `npx http-server public -p <port>`。

## 已知取舍

`slugify` 只做 ASCII 转换，中文标题会退化成 `post-<hex>` 这种基于路径哈希的
slug——唯一且稳定，但不好看。要中文转拼音就装 `pinyin-pro`，参考
[Astro 示例](../astro/scripts/blog/core.ts) 的实现。
