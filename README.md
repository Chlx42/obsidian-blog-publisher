# Obsidian Blog Publisher

在 Obsidian 里驱动你**已有**的静态博客仓库：跑它的构建脚本、预览、发布，
并且在你删掉文章或改了 slug 之后，把站点里的旧文件一起清理干净。

<p align="center">
  <img src="https://img.shields.io/badge/Obsidian-1.5.0+-purple?logo=obsidian" alt="Obsidian">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
</p>

<!-- 截图待补，要点见 docs/README.md。把图放进 docs/ 后取消下面的注释。
<p align="center">
  <img src="docs/screenshot-panel.png" width="720"
       alt="博客面板：文章按状态分组，右侧是实时日志">
</p>
-->

## 这个插件解决什么

大多数 Obsidian 发布类插件是「导出器」：把笔记转成 Markdown 推到仓库，构建交给你。
它们通常有两个共同的缺口——

**删除不会同步。** 你在 vault 里删掉一篇文章，或者改了它的 slug，
站点仓库里的旧文件会留在原地，得手动去删。

**构建过程是黑盒。** 你在 Obsidian 里点了发布，然后切到终端看构建到底成没成。

这个插件反过来做：不替你实现转换逻辑，而是驱动**你自己的**同步脚本，
用一份 manifest 记录每次同步产出了什么，下次同步时把不该留的文件删掉。
构建日志实时显示在 Obsidian 里，退出码非 0 就中断并告诉你哪一步失败。

如果你想要的是「点一下就有网站」，[Digital Garden](https://github.com/oleeskild/obsidian-digital-garden)
更合适。这个插件的前提是你已经有一个能跑的博客仓库。

## 特性

- **删除同步清理** — manifest 驱动，文章下线或改 slug 后自动清理站点里的旧文件和附件
- **实时预览** — 在 Obsidian 里启动开发服务器，日志分类显示，端口自动探测
- **命令全可配** — install / sync / build / publish / 开发预览 / 生产预览，六个都能改
- **多运行时** — Bun / npm / pnpm / yarn，或任意可执行文件路径（Ruby、Go…）
- **可插拔校验** — 指向一个导出 `collectArticleIssues` 的 JS 文件，留空则只检查 `publish`
- **状态分组** — 文章按「可发布 / 草稿 / 需检查 / 未同步」显示，可内联切换

## 插件会改动 vault 里的什么

只有 frontmatter，只有这些字段，只在你主动操作时：

| 字段 | 何时写入 | 说明 |
|------|----------|------|
| `publish` | 你点「发布」/「取消发布」 | `true` 才会同步到站点 |
| `draft` | 你点「转为草稿」/「转为正式」 | 开发预览可见，生产构建隐藏 |

笔记正文永远不会被修改。slug 由同步脚本计算，写在站点仓库里，不回写 vault。

## 安装

### 手动安装（当前方式）

1. 从 [Releases](https://github.com/Chlx42/obsidian-blog-publisher/releases) 下载最新版本
2. 解压到 `.obsidian/plugins/blog-publisher/`
3. 在 Obsidian 设置 → 第三方插件 → 启用「Blog Publisher」

### 社区插件市场

暂无计划提交。这是个前提较强的工具（需要你已有博客仓库并会改构建脚本），
市场里的 `blog-publisher` id 也已被占用。手动安装或 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 即可。

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

四份示例都实现了 manifest 清理：改 `title`（slug 变了）或取消发布之后，
站点里的旧文件会在下次同步时删掉。Jekyll 还会处理改 `publishDate` 导致的
文件名日期前缀变化。Astro 示例额外清理文章附带的图片附件。

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
校验器通过 `require()` 加载，所以必须是 CommonJS 的 `.js`。加载失败时插件降级为只检查
`publish` 字段，并在设置里这一项下面显示原因（找不到文件、没导出函数等）——路径填错的话，
所有文章都会显示「可发布」，所以别忽略那行提示。

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
bun run test      # 单元测试（限定 src/，见下）
bun run build     # 构建插件（生成 main.js 和 validators/astro.js）
```

`test` 脚本是 `bun test src` 而不是 `bun test`：`examples/` 里的脚本各自依赖对应框架的
运行时，在这个仓库里装不全。给示例加测试的话，请单独跑，别指望根目录的 `test` 会带上它们。

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
