# Astro 示例

这是插件的参考实现，也是默认命令预设针对的目标。

## 脚本说明

| 文件 | 职责 |
|------|------|
| `scripts/blog/cli.ts` | 主入口，实现 `sync` / `build` / `publish` 三个子命令 |
| `scripts/blog/core.ts` | markdown 解析、slug 生成、图片处理、manifest 同步 |
| `scripts/blog/config.ts` | 从环境变量或 `.blog-config.json` 读取路径 |
| `scripts/blog/article-rules.ts` | frontmatter 校验规则，可作为插件的校验器 |

## 使用方法

1. 复制 `scripts/blog/` 到你的 Astro 项目

2. 安装依赖

   ```bash
   bun add pinyin-pro yaml
   ```

3. 在 `package.json` 添加脚本

   ```json
   {
     "scripts": {
       "blog": "bun run scripts/blog/cli.ts sync",
       "blog:build": "bun run scripts/blog/cli.ts build",
       "blog:publish": "bun run scripts/blog/cli.ts publish"
     }
   }
   ```

4. 配置路径。插件会自动传入 `BLOG_VAULT_ROOT` 和 `BLOG_ARTICLES_FOLDER`，
   命令行单独运行时才需要 `.blog-config.json`

   ```bash
   cp .blog-config.example.json .blog-config.json
   ```

   附件目录不在插件设置里，只能通过 `.blog-config.json` 的 `attachmentsFolder`
   或环境变量 `BLOG_ATTACHMENTS_FOLDER` 指定，默认 `attachments`。如果你的
   vault 用的是别的名字，即使从插件运行也要建这个文件。

5. 运行

   ```bash
   bun run blog
   ```

## 插件配置

| 字段 | 值 |
|------|-----|
| 博客仓库路径 | 这个项目的绝对路径 |
| 文章文件夹 | `blog`（vault 内相对路径） |
| 包管理器 | Bun |
| 博客地址 | `https://yourblog.com` |
| 文章校验器 | 可选，指向编译后的 `article-rules.js`，留空则只检查 `publish` |

命令配置保持默认即可——默认值就是上面这套 npm scripts。

## 校验器说明

`article-rules.ts` 导出 `collectArticleIssues`，签名符合插件协议。但插件用
`require()` 动态加载，只能吃 CommonJS 的 `.js`，所以要先编译：

```bash
bun build scripts/blog/article-rules.ts --target=node --format=cjs --outfile=.obsidian-validator.js
```

然后在插件设置的「文章校验器」里填这个 `.js` 的绝对路径。
