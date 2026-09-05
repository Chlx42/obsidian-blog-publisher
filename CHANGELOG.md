# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **发布网络重试** - 发布器的 `git fetch` / `git push` 遇到代理链路抖动
  （`Connection closed by 198.18.x.x`、`SSL_ERROR_SYSCALL`）时自动重试两次，
  每次间隔 3 秒，不再让一次网络抖动中断整个发布。

## [1.0.1] - 2026-09-05

### Added
- **一键加入博客** - 状态栏「＋ 加入博客」按钮（或命令「当前笔记加入博客」，
  默认 `Cmd/Ctrl+Shift+I`）把当前笔记加入博客：自动补齐缺失的 frontmatter
  （`publish: true`、`draft: true`、title、description、publishDate、tags），
  description 取正文第一段作草稿。只补缺失键，已有内容不覆盖；slug 和
  language 仍由发布器计算。
- **文章留在原地** - 文章目录之外的笔记只要 frontmatter 标记 `publish: true` 也会被识别，
  进入面板、预览和发布流程，无需移动到博客文件夹。目录外笔记只读取、不回写；
  manifest source key 以 `../` 前缀与目录内路径区分（详见 PROTOCOL.md「同步范围」）。

## [1.0.0] - 2024-09-04

### Added

#### Core Features
- **Multi-framework support** - Works with any static site generator (Astro, Hugo, Hexo, Jekyll, custom)
- **Manifest-driven cleanup** - Automatically removes old files when articles are renamed, unpublished, or deleted
- **Real-time preview** - Start development server from Obsidian with live logs
- **Runtime abstraction** - Support for Bun, npm, pnpm, yarn, and custom executables
- **Command customization** - Configure all six lifecycle commands (install, sync, build, publish, dev, preview)
- **Pluggable validation** - Custom JavaScript validators for frontmatter validation

#### Framework Examples
- Complete Astro example with Bun integration
- Complete Hugo example using Node.js standard library (zero dependencies)
- Complete Hexo example integrating with hexo generate/deploy
- Complete Jekyll example with date-prefixed filenames and cross-language support

#### User Interface
- **Blog panel** - Article list grouped by status (ready/draft/invalid/unpublished)
- **Inline actions** - Toggle publish/draft status, copy URL without leaving Obsidian
- **Status bar integration** - Live progress indicators with article counts
- **Summary modal** - Post-operation summary showing published/initialized/removed files
- **Log modal** - Real-time build logs with error highlighting

#### Developer Experience
- Protocol specification (PROTOCOL.md) for build script integration
- Architecture documentation (ARCHITECTURE.md)
- Contributing guidelines (CONTRIBUTING.md)
- Complete README with technical focus and competitor comparison
- Issue templates for bugs, features, and framework examples

### Technical Details

#### Architecture
- Event-driven state management (BlogStore)
- State machine for task lifecycle (idle → syncing → building → publishing)
- Process lifecycle management with automatic cleanup
- Port detection and conflict resolution
- Structured log output with stage grouping

#### Validation System
- Dynamic validator loading via require()
- Graceful fallback when validator fails to load
- Built-in Astro validator as reference implementation
- Status codes: uninitialized, not-published, invalid, draft, ready

#### Manifest System
- JSON manifest tracking vault → site file mapping
- Diff-based cleanup on every sync
- Handles slug changes, file deletions, and unpublish operations
- Jekyll-specific: date prefix change detection

### Configuration

Default settings target Astro + Bun for out-of-box experience:
```json
{
  "runtime": "bun",
  "commands": {
    "install": ["install", "--frozen-lockfile"],
    "sync": ["run", "blog", "--json"],
    "build": ["run", "blog:build", "--json"],
    "publish": ["run", "blog:publish", "--json"],
    "devPreview": ["run", "dev", "--host", "<host>", "--port", "<port>"],
    "prodPreview": ["run", "preview", "--host", "<host>", "--port", "<port>"]
  },
  "resultLinePrefix": "__BLOG_RESULT__",
  "previewPort": 4173,
  "previewMode": "development",
  "autoSyncOnSave": true
}
```

### For Plugin Developers

If you're building a similar plugin or integrating with this one:
- See PROTOCOL.md for the build script output format
- See ARCHITECTURE.md for system design and extension points
- All framework examples follow the same protocol for consistency

### Breaking Changes

None - this is the initial release.

### Known Issues

- Auto-sync debounce may fire while user is still typing (800ms threshold)
- Custom validator errors are only shown in settings, not in article status
- Preview URL assumes localhost - no support for remote dev servers yet

### Migration Guide

N/A - initial release.

---

## [Unreleased]

### Planned
- Status group collapse/expand with persistence
- Preview URL copy buttons per article
- Keyboard shortcuts (Cmd+Shift+P for publish, etc.)
- Error recovery UI (retry button, copy logs)
- Optimistic UI updates for toggle operations
- Manifest diff visualization before sync
- Dry-run mode for testing build scripts
- Auto-sync with configurable debounce timer
