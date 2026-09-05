# Obsidian Blog Publisher - 开源推广路线图

## 战略定位

**目标用户：** 技术博主、折腾爱好者、追求完美的开发者
**核心卖点：** 最强大的博客发布工具（不是最简单，而是最可控）
**差异化：** Manifest 驱动的自动清理 + 支持任意框架/运行时/命令

## 竞品分析结论

基于对 11 个同类插件的深入研究（Digital Garden、GitHub Publisher、Static Site MD Exporter 等）：

- **Digital Garden (5.7k stars)**: 零配置但限制死，只能用它的模板
- **Obsidian Git (6.8k stars)**: 通用工具，配置复杂但自由度高
- **GitHub Publisher (1.2k stars)**: 只管推到 git，不管构建

**我们的优势：**
1. Manifest 驱动的删除清理（改 slug、删文章，旧文件自动清理）
2. 实时预览 + 构建日志都在 Obsidian 里
3. 支持任意框架（Astro/Hugo/Hexo/Jekyll/自定义）+ 任意运行时（Bun/npm/pnpm/yarn/custom）

## 第 1 周：基础设施

### ✅ 已完成
- [x] 插件核心功能（多框架支持、运行时抽象、校验器插件化）
- [x] Astro 完整示例
- [x] PROTOCOL.md
- [x] 校验器加载失败提示
- [x] 框架自动识别 + 一键配置

### 📋 待完成

#### 1. 补全框架示例（证明通用性）
- [x] `examples/hugo/` — 完整示例 + README
- [ ] `examples/hexo/` — 完整示例 + README  
- [ ] `examples/jekyll/` — 完整示例 + README
- [ ] 每个示例都包含：
  - 完整的构建脚本（manifest 清理、slug 变更检测、图片处理）
  - frontmatter 校验器
  - README 说明如何集成
  - 可运行的 demo 项目

#### 2. 重写 README（技术化风格）
- [ ] 开头改成"为什么需要这个插件？"（展示痛点）
- [ ] 添加对比表格（vs Digital Garden / GitHub Publisher / Static Site MD Exporter）
- [ ] 强调技术优势（manifest 清理、任意命令、实时日志）
- [ ] 添加 Architecture 章节（系统架构图）
- [ ] 添加 badges（stars、downloads、license）
- [ ] 截图要展示技术细节（实时日志、设置页、文章状态）

#### 3. ✅ 添加文档文件
- [x] `ARCHITECTURE.md` — 设计原理（manifest 如何工作、状态机、运行时抽象）
- [x] `CONTRIBUTING.md` — 贡献指南（如何添加框架示例、如何报 bug）
- [x] `CHANGELOG.md` — 版本历史
- [x] Issues 模板（Bug Report、Feature Request、Framework Example）

#### 4. 提交官方插件市场
- [ ] 修改 manifest.json 的 description（技术化描述）
- [ ] 准备 3-4 张截图（实时日志、设置页、文章列表、框架识别）
- [ ] 提交 PR 到 obsidianmd/obsidian-releases

## 第 2 周：快速改进（UX 增强）

基于 workflow 研究的 7 个快速胜利：

### 1. ✅ 状态栏集成
- [x] 显示当前状态：`⏳ 3/12 同步中` 或 `✅ 已同步 12 篇`
- [x] 点击状态栏打开面板
- [x] 不同阶段用不同图标（sync/build/publish）

### 2. ✅ 操作结果摘要弹窗
- [x] 同步/发布完成后弹出 modal
- [x] 显示：
  ```
  ✅ 同步完成
  
  📄 已发布 3 篇：
    · hello-world.md
    · second-post.md
  
  🗑️ 已下线 1 篇：
    · old-slug.md
  
  [查看详细日志]
  ```
- [x] 点击文件名跳转到笔记

### 3. ✅ 状态分组过滤
- [x] 每个分组标题右侧加折叠/展开按钮
- [x] 默认折叠「已发布」分组（减少噪音）
- [x] 状态持久化到 settings

### 4. ✅ 预览 URL 复制增强
- [x] 预览运行时，每篇文章旁显示 `localhost:4173/blog/slug`
- [x] 一键复制预览 URL
- [x] 支持生产 URL 复制（从 siteUrl 拼接）

### 5. ✅ 键盘快捷键
- [x] `Cmd+Shift+P` — 一键发布
- [x] `Cmd+Shift+D` — 切换预览
- [x] `Cmd+Shift+L` — 打开日志

### 6. ✅ 错误恢复增强
- [x] 错误时显示「复制日志」按钮
- [x] 失败后显示「重试」按钮
- [x] 记录上次失败的操作，重启后提示「上次同步失败，是否重试？」

### 7. ✅ 乐观 UI 更新
- [x] 点击「发布」「隐藏」「转草稿」时立即更新 UI
- [x] 不等待文件写入完成（更流畅）
- [x] 写入失败时回滚 UI 状态

## 第 3 周：技术展示（内容营销）

### 1. 技术博客：《用 Manifest 解决静态博客的 Slug 变更问题》
- [ ] 讲清楚问题：改了文章标题，URL 变了，旧文件怎么办？
- [ ] 讲清楚别的插件为什么做不到
- [ ] 讲清楚 manifest 的设计原理
- [ ] 给出完整代码示例
- [ ] 发布到：自己的博客、Dev.to、少数派

### 2. 社区推广
- [ ] Reddit r/ObsidianMD 发帖
  - 标题："I built a plugin that actually cleans up old files when you change slugs"
  - 配 30 秒 GIF 演示
  - 重点讲「为什么别的插件做不到」
- [ ] Obsidian 官方论坛发帖
  - 分类：Share & Showcase
  - 标题："Blog Publisher - manifest-driven publishing with automatic cleanup"
- [ ] V2EX 发帖
  - 标题：《做了个 Obsidian 博客插件，解决了改 slug 的痛点》

### 3. 录制演示 GIF（30 秒）
- [ ] 第 1-5 秒：在 Obsidian 改文章标题（slug 变了）
- [ ] 第 6-15 秒：点「一键发布」，显示实时日志
- [ ] 第 16-25 秒：打开博客，旧 URL 404，新 URL 正常
- [ ] 第 26-30 秒：打字："其他插件做不到这个"

## 第 4 周：功能深度

### 1. Manifest Diff 可视化（最能展示技术含量）
- [ ] 同步前显示 modal："即将同步的变更"
- [ ] 显示：
  ```
  将新增 3 篇：
    + hello-world.md → /blog/hello-world
  
  将修改 1 篇：
    ~ second-post.md → /blog/new-slug (slug 变更)
  
  将删除 2 篇：
    - /blog/old-slug (文章已删除)
    - /blog/draft-post (取消发布)
  ```
- [ ] 点击文件名查看 diff
- [ ] 「继续」/「取消」按钮

### 2. 防抖自动同步（可选，适合重度用户）
- [ ] 编辑文章时启动倒计时（如 5 分钟）
- [ ] 每次保存重置倒计时
- [ ] 闲置后自动同步
- [ ] 设置里可开关 + 配置倒计时

### 3. Dry-run 模式
- [ ] 命令：`Dry Run: Test Sync`
- [ ] 执行校验、解析 manifest，但不写文件
- [ ] 显示「将会发生的变更」
- [ ] 用于测试构建脚本

## 第 2 个月：深度内容

### 1. 系列技术文章
- [ ] 《为什么 Obsidian 博客插件都做不好文件清理？》
- [ ] 《从零实现一个 Obsidian 博客同步脚本》
- [ ] 《Obsidian 博客插件的技术对比》（对比 4-5 个插件）

### 2. 视频教程
- [ ] 10 分钟完整教程（B站 + YouTube）
- [ ] 展示：安装 → 配置 → 同步 → 预览 → 发布
- [ ] 讲解 manifest 清理的原理

## 第 3 个月：社区建设

- [ ] 回复所有 GitHub Issues
- [ ] 接受 PR（新框架示例）
- [ ] 发布 v2.0（包含所有快速改进）
- [ ] 写《一年后回顾：做开源插件的经验》

## 一句话卖点（用于推广）

**中文：**
> 唯一能完美处理文章删除/改名/slug变更的 Obsidian 博客插件，
> 支持任意框架（Astro/Hugo/Hexo/Jekyll/自定义），
> 预览和日志都在 Obsidian 里实时显示。

**英文：**
> Manifest-driven blog publisher with automatic cleanup. 
> Supports any static site generator (Astro, Hugo, Hexo, Jekyll) and any build command. 
> Real-time logs, framework detection, and pluggable validators.

## 当前优先级

1. **补全 Hugo/Hexo/Jekyll 示例**（证明通用性）
2. **重写 README**（技术化风格）
3. **实现状态栏 + 摘要弹窗**（立即提升 UX）
4. **写第一篇技术博客**（开始内容营销）
5. **提交官方插件市场**（让 99% 的用户能发现）
