# Contributing to Obsidian Blog Publisher

感谢你考虑为这个项目做贡献！这个插件的目标是成为**最强大、最灵活**的 Obsidian 博客发布工具，而不是最简单的。我们欢迎追求技术深度的开发者加入。

## 贡献方式

### 1. 添加新框架示例

这是**最有价值**的贡献。每个新框架示例都能让插件支持更多用户。

**要求：**
- 完整的同步脚本（manifest 清理、slug 生成、frontmatter 转换）
- 符合 [PROTOCOL.md](PROTOCOL.md) 的输出格式
- 详细的 README（安装步骤、配置说明、常见问题）
- 可运行的示例项目（package.json / Gemfile / 配置文件）

**参考现有示例：**
- [examples/astro](examples/astro) - Bun + TypeScript
- [examples/hugo](examples/hugo) - Node.js 标准库（零依赖）
- [examples/hexo](examples/hexo) - 集成 Hexo 自带命令
- [examples/jekyll](examples/jekyll) - 跨语言（Node.js + Ruby）

**提交前检查：**
```bash
# 1. 测试同步脚本
cd examples/your-framework
npm run blog:sync  # 或等效命令

# 2. 验证输出协议
# 应该看到：__BLOG_RESULT__{"initialized":[],"published":[...],"removed":[],"slugs":{...}}

# 3. 测试 manifest 清理
# - 同步一篇文章
# - 改标题（slug 变了）
# - 再次同步，确认旧文件被删除

# 4. 测试构建和发布
npm run blog:build
npm run blog:publish
```

**提 PR 时包含：**
- [ ] `examples/<framework>/` 完整目录
- [ ] README 解释如何集成
- [ ] 主 README 添加到「其他框架」章节
- [ ] CHANGELOG.md 添加条目

### 2. 修复 Bug

**报告 Bug：**
1. 搜索 [Issues](https://github.com/Chlx42/obsidian-blog-publisher/issues) 确认未重复
2. 使用 Bug Report 模板
3. 提供：
   - Obsidian 版本
   - 插件版本
   - 操作系统
   - 复现步骤
   - 预期行为 vs 实际行为
   - 日志（命令面板 → `Blog Publisher: 查看最近任务日志`）

**修复 Bug：**
1. Fork 仓库
2. 创建分支：`git checkout -b fix/issue-123-description`
3. 写测试验证修复（如果适用）
4. 提交：`fix: 描述问题和解决方案`
5. 提 PR 引用 issue 编号

### 3. 新功能

**提议新功能：**
1. 先开 Issue 讨论，避免白做
2. 使用 Feature Request 模板
3. 说明：
   - 用户场景（什么人在什么情况下需要）
   - 现有方案为什么不够（如果有）
   - 期望的实现方式

**实现新功能：**
1. 等 Issue 被标记为 `accepted`
2. Fork 并创建分支：`git checkout -b feat/feature-name`
3. 实现时遵循现有代码风格
4. 更新文档（README / CHANGELOG / 相关 .md 文件）
5. 提 PR 并链接到原 Issue

### 4. 改进文档

文档改进不需要开 Issue，直接提 PR：
- 修正错别字、语法错误
- 补充缺失的说明
- 添加更清晰的示例
- 翻译（如果你想添加英文文档）

## 开发环境设置

### 前置条件
- Bun 1.0+ 或 Node.js 18+
- Obsidian 1.5.0+
- Git

### 克隆和构建

```bash
# 克隆仓库
git clone https://github.com/Chlx42/obsidian-blog-publisher.git
cd obsidian-blog-publisher

# 安装依赖
bun install

# 类型检查
bun run check

# 运行测试
bun test

# 构建插件
bun run build
```

构建产物：
- `main.js` - 插件主文件
- `manifest.json` - 插件元数据
- `styles.css` - 样式
- `validators/astro.js` - 内置校验器

### 本地测试

有两种方式：

**方式 1：手动复制（适合快速迭代）**

```bash
# 构建后手动复制到 vault
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/blog-publisher/
cp -r validators /path/to/vault/.obsidian/plugins/blog-publisher/

# 重启 Obsidian 或重新加载插件
```

**方式 2：自动安装脚本**

```bash
# 设置环境变量
export BLOG_VAULT_ROOT=/path/to/your/vault
export BLOG_REPOSITORY=/path/to/your/blog
export BLOG_ARTICLES_FOLDER=博客  # vault 内相对路径

# 构建并安装
bun run install:plugin
```

脚本会：
- 复制产物到 `.obsidian/plugins/blog-publisher/`
- 如果 `data.json` 不存在，创建并填入环境变量的配置
- 保留已有配置（不覆盖）

### 调试

**查看日志：**
1. 打开 Obsidian 开发者工具：`Cmd+Opt+I`（Mac）/ `Ctrl+Shift+I`（Windows/Linux）
2. Console 标签页会显示插件日志

**常见日志前缀：**
- `[BlogPublisher]` - 插件主逻辑
- `[TaskRunner]` - 任务执行
- `[BunProcess]` - 进程管理（已改名为 RuntimeProcess，但旧日志可能还有）
- `[ArticleIndex]` - 文章扫描
- `[Store]` - 状态管理

**断点调试：**
- 在代码里加 `debugger`
- 构建后重新加载插件
- 开发者工具会在断点处暂停

## 代码风格

### TypeScript

遵循项目现有风格：
- 使用 `interface` 定义数据结构
- 使用 `type` 定义联合类型和别名
- 函数优先用具名函数，回调用箭头函数
- 异步操作用 `async/await`，不用 `.then()`

**示例：**
```typescript
// Good
export async function syncArticles(settings: BlogPublisherSettings): Promise<SyncResult> {
  const files = await readdir(articlesDir)
  return { published: files.length, removed: 0 }
}

// Avoid
export const syncArticles = (settings: BlogPublisherSettings) => {
  return readdir(articlesDir).then(files => {
    return { published: files.length, removed: 0 }
  })
}
```

### 命名约定

- 文件名：kebab-case（`article-index.ts`, `status-bar.ts`）
- 类名：PascalCase（`BlogPublisher`, `TaskRunner`）
- 函数名：camelCase（`syncArticles`, `handleClick`）
- 常量：UPPER_SNAKE_CASE（`RESULT_LINE_PREFIX`, `DEFAULT_PORT`）
- 私有方法：前缀下划线（`_cleanup`, `_validatePath`）

### 文件组织

```
src/
  core/          # 核心逻辑（无 Obsidian API 依赖）
    runtime.ts   # 运行时抽象
    task-runner.ts
    store.ts
    article-index.ts
    frontmatter.ts
  ui/            # UI 组件（依赖 Obsidian API）
    panel.ts
    settings-tab.ts
    status-bar.ts
    log-modal.ts
  validators/    # 内置校验器
    astro.ts
  types.ts       # 类型定义
  main.ts        # 插件入口
```

### 注释

**需要注释的：**
- 复杂算法的思路
- 非显而易见的业务逻辑
- Hack 或临时方案的原因
- 公共 API 的参数和返回值

**不需要注释的：**
- 显而易见的代码（`// 创建按钮` 配 `new ButtonComponent()`）
- 重复类型签名的内容（TypeScript 已经表达清楚）

**示例：**
```typescript
// Good - 解释为什么这样做
// Obsidian 的 Modal 在关闭时不会自动清理 DOM，需要手动移除
this.contentEl.empty()

// Avoid - 重复代码内容
// 清空内容元素
this.contentEl.empty()
```

## 测试

### 单元测试

使用 Bun 的内置测试框架：

```typescript
// src/core/__tests__/article-index.test.ts
import { describe, it, expect } from 'bun:test'
import { inspectArticle } from '../article-status'

describe('inspectArticle', () => {
  it('should return uninitialized when no frontmatter', () => {
    const result = inspectArticle(undefined)
    expect(result.code).toBe('uninitialized')
  })

  it('should return unpublished when publish is false', () => {
    const result = inspectArticle({ publish: false })
    expect(result.code).toBe('unpublished')
  })
})
```

运行测试：
```bash
bun test                # 全部测试
bun test src/core       # 只测 core 目录
bun test article-index  # 匹配文件名
```

### 集成测试

框架示例脚本的测试：
```bash
cd examples/astro
bun test scripts/blog/core.test.ts
```

**注意：** `examples/` 里的脚本依赖各自框架的运行时，在插件根目录跑 `bun test` 不会包含它们（见 package.json 的 test 脚本限定 `src/`）。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>: <description>

[optional body]

[optional footer]
```

**Type：**
- `feat` - 新功能
- `fix` - Bug 修复
- `docs` - 文档改动
- `style` - 代码格式（不影响功能）
- `refactor` - 重构（不改变功能）
- `test` - 测试相关
- `chore` - 构建/工具链改动

**示例：**
```
feat: add Hugo framework example

- Node.js sync script with zero dependencies
- TOML frontmatter conversion
- Manifest-driven cleanup for slug changes
- Complete README with setup instructions

Closes #42
```

```
fix: status bar not updating after sync completes

The store event listener was being removed prematurely.
Now it stays subscribed for the entire plugin lifecycle.

Fixes #58
```

## Pull Request 流程

1. **Fork 并创建分支**
   ```bash
   git checkout -b feat/your-feature
   ```

2. **开发并自测**
   ```bash
   bun run check      # 类型检查
   bun test           # 单元测试
   bun run build      # 构建
   # 在 Obsidian 里手动测试
   ```

3. **提交**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feat/your-feature
   ```

4. **创建 Pull Request**
   - 标题：简洁描述改动
   - 描述：
     - 解决了什么问题？
     - 如何测试？
     - 截图/GIF（如果改了 UI）
     - 关联的 Issue 编号

5. **代码审查**
   - 维护者会审查并提出反馈
   - 根据反馈修改后推送到同一分支
   - CI 检查通过后合并

## 发布流程

（仅维护者可用）

1. 更新版本号：`manifest.json` 和 `package.json`
2. 更新 `CHANGELOG.md`，把 `[Unreleased]` 改为版本号
3. 提交：`chore: bump version to x.y.z`
4. 打标签：`git tag vx.y.z && git push --tags`
5. 创建 GitHub Release：
   ```bash
   gh release create vx.y.z \
     --title "vx.y.z - Release Title" \
     --notes "See CHANGELOG.md" \
     main.js manifest.json styles.css
   ```
6. 提交到 Obsidian 官方插件市场（PR 到 obsidianmd/obsidian-releases）

## 行为准则

- **尊重技术讨论** - 这是技术项目，评判标准是代码质量和设计合理性
- **保持专业** - 不要人身攻击，就事论事
- **欢迎新手** - 新手可能不熟悉流程，耐心引导而不是嘲讽
- **开放讨论** - 技术决策应该公开讨论，而不是黑箱

## 许可证

贡献代码即表示同意以 MIT 协议授权你的代码。

## 问题？

- 开发问题：开 [Discussion](https://github.com/Chlx42/obsidian-blog-publisher/discussions)
- Bug 报告：开 [Issue](https://github.com/Chlx42/obsidian-blog-publisher/issues)
- 功能请求：先开 Issue 讨论再实现

感谢你的贡献！🎉
