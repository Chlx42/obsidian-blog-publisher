# Hexo 示例

Hexo 自带 `generate` 和 `deploy`，脚本只做 vault → `source/_posts/` 的同步，
构建和部署串在 npm script 里交给 Hexo。

## 字段映射

| Obsidian | Hexo | 说明 |
|----------|------|------|
| `publish` | — | 插件用它决定同步与否，不写进输出 |
| `title` | `title` | 缺失时用文件名 |
| `publishDate` | `date` | |
| `description` | `excerpt` | Hexo 的摘要字段 |
| `tags` | `tags` | 写成 YAML 列表，主题兼容性更好 |
| `draft` | `published: false` | Hexo 没有 `draft` 字段，用 `published` 控制 |

## 使用方法

1. 复制 `scripts/blog.mjs` 到你的 Hexo 项目

2. 在 `package.json` 添加脚本。build 和 publish 要先同步再调 Hexo，
   因为插件只发一条命令

   ```json
   {
     "scripts": {
       "blog": "node scripts/blog.mjs sync",
       "blog:build": "npm run blog && hexo generate",
       "blog:publish": "npm run blog && hexo generate && hexo deploy",
       "preview": "hexo server"
     }
   }
   ```

3. 手动运行

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
| 开发预览 | `run preview -- -p <port>` |
| 生产预览 | `run preview -- -p <port>` |

`hexo server` 就是即时渲染，没有独立的生产预览模式，两个预览命令填一样的即可。

## 已知取舍

- `deploy` 依赖 `_config.yml` 里配好 `deploy:` 段，否则 `hexo deploy` 会失败
- 中文标题的 slug 会退化成 `post-<hex>`，要拼音就装 `pinyin-pro`，
  参考 [Astro 示例](../astro/scripts/blog/core.ts)
