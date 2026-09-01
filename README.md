# Obsidian Blog Publisher

从 Obsidian 预览和发布静态博客的通用插件。支持 Astro、Hugo、Hexo、Jekyll 等任意框架。

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.5.0+-purple?logo=obsidian" alt="Obsidian">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
</p>

## 特性

✅ **实时预览** — 在 Obsidian 里启动博客开发服务器  
✅ **内联操作** — 切换发布/草稿状态、复制博客地址、跳转文件  
✅ **灵活配置** — 支持自定义构建命令和运行时  
✅ **文章状态可视化** — 按状态分组显示所有文章  
✅ **框架无关** — 只要能输出约定的 JSON，就能集成

## 安装

### 手动安装（当前方式）

1. 从 [Releases](https://github.com/Chlx42/obsidian-blog-publisher/releases) 下载最新版本
2. 解压到 `.obsidian/plugins/blog-publisher/`
3. 在 Obsidian 设置 → 第三方插件 → 启用「Blog Publisher」

### 社区插件市场

待提交审核后可用。

## 快速开始

### 前置条件

- Obsidian 1.5.0+
- 博客项目已配置好构建脚本（npm scripts 或其他命令）
- 运行时：Bun / npm / pnpm / yarn 之一，或任意可执行文件

### Astro 项目（开箱即用）

插件的默认命令预设针对 Astro + Bun。详见 [examples/astro/](examples/astro/)。

1. 复制 `examples/astro/scripts/blog/` 到你的项目
2. 在 `package.json` 添加：

   ```json
   {
     "scripts": {
       "blog": "bun run scripts/blog/cli.ts sync",
       "blog:build": "bun run scripts/blog/cli.ts build",
       "blog:publish": "bun run scripts/blog/cli.ts publish"
     }
   }
   ```

3. 插件设置：
   - **博客仓库路径**：Astro 项目的绝对路径
   - **文章文件夹**：`blog`（vault 内相对路径）
   - **包管理器**：Bun
   - 其余保持默认

4. 点击左侧边栏的博客图标，在面板里点击「预览」

### 其他框架

- [Hugo 示例](examples/hugo/) — Node 标准库，零第三方依赖
- [Hexo 示例](examples/hexo/) — 串联 Hexo 自己的 generate/deploy
- [Jekyll 示例](examples/jekyll/) — 同步脚本用 Node，构建交给 bundle

## 配置说明

插件设置分三组：

### 基础配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| 博客仓库路径 | 包含 package.json 的本地目录 | 空 |
| 文章文件夹 | vault 内的相对路径 | 空 |
| 预览端口 | 开发服务器端口 | 4173 |
| 预览模式 | development（草稿可见）或 production | development |
| 保存后自动同步 | 开发预览运行时自动同步 | true |
| 博客地址 | 用于复制 URL 功能 | 空 |

### 运行时配置

| 字段 | 说明 |
|------|------|
| 包管理器 | bun / npm / pnpm / yarn / 自定义路径 |
| 自定义路径 | 选择「自定义路径」时必填，指向任意可执行文件 |

插件优先探测 Bun（保持最佳体验），找不到时按顺序尝试 npm / pnpm / yarn。
自动探测失败时会在设置页显示提示。

### 命令配置（高级）

自定义各个阶段的命令，支持 `<port>` 和 `<host>` 占位符。

| 命令 | 默认值（Astro + Bun） |
|------|---------------------|
| 安装依赖 | `install --frozen-lockfile` |
| 同步 | `run blog --json` |
| 构建 | `run blog:build --json` |
| 发布 | `run blog:publish --json` |
| 开发预览 | `run dev --host <host> --port <port>` |
| 生产预览 | `run preview --host <host> --port <port>` |

点击「恢复默认命令」可重置为 Astro + Bun 预设。

### 文章校验（可选）

指向一个导出 `collectArticleIssues` 的 JS 文件，用于自定义 frontmatter 校验。
留空则只检查 `publish` 字段。

插件自带一份 Astro 规则，构建后位于插件目录的 `validators/astro.js`，
校验 `title`、`description`、`publishDate`、`tags`、`draft`、`heroImage`。
要启用就把这个路径填进设置：

```
<vault>/.obsidian/plugins/blog-publisher/validators/astro.js
```

源码见 [src/validators/astro.ts](src/validators/astro.ts)，可复制改成自己的规则。
校验器通过 `require()` 加载，所以必须是 CommonJS 的 `.js`；加载失败时插件静默降级为不校验。

## 输出协议

构建脚本需要输出一行结构化结果（默认前缀 `__BLOG_RESULT__`）：

```
__BLOG_RESULT__{"initialized":[],"published":["post1.md"],"removed":[],"slugs":{"blog/post1.md":"hello-world"}}
```

详见 [PROTOCOL.md](PROTOCOL.md)。

## 开发

```bash
bun install
bun run check     # 类型检查
bun test          # 单元测试
bun run build     # 构建插件（生成 main.js 和 validators/astro.js）
```

构建后可以直接装进 vault 迭代：

```bash
BLOG_VAULT_ROOT=/path/to/vault bun run install:plugin
```

脚本会复制产物、启用插件，并保留 `data.json` 里已有的配置。
可选的 `BLOG_REPOSITORY` 和 `BLOG_ARTICLES_FOLDER` 只在对应字段为空时才填入。

构建产物在根目录：`main.js`、`manifest.json`、`styles.css`。

## 贡献

欢迎提交：
- 新框架的示例脚本（examples/）
- Bug 修复和功能改进
- 文档翻译和完善

提交 PR 前请运行 `bun run check && bun test` 确保通过。

## License

MIT © [Chlx](https://github.com/Chlx42)
