---
name: Framework Example
about: 提交新框架的示例脚本
title: '[Example] Add <Framework> support'
labels: framework-example
assignees: ''
---

## 框架信息

- **框架名称：** [例如 Eleventy / VuePress / Docusaurus]
- **框架版本：** [例如 2.0.1]
- **官方网站：** [例如 https://11ty.dev]
- **流行度：** [GitHub stars / npm weekly downloads]

## 实现内容

- [ ] 同步脚本（sync 命令）
- [ ] 构建脚本（build 命令）
- [ ] 发布脚本（publish 命令）
- [ ] Manifest 清理逻辑
- [ ] Frontmatter 转换
- [ ] README 文档
- [ ] 示例配置文件

## 技术栈

- **脚本语言：** [Node.js / Bun / Python / Ruby / Go]
- **依赖：** [列出第三方依赖，或注明"零依赖"]
- **输出协议：** [确认符合 PROTOCOL.md]

## 测试清单

- [ ] 同步单篇文章成功
- [ ] 同步多篇文章成功
- [ ] 改文章标题（slug 变了），旧文件被删除
- [ ] 取消发布，站点文件被删除
- [ ] 构建命令生成静态站点
- [ ] 发布命令推送到 git
- [ ] 输出 JSON 哨兵行格式正确

## 特殊处理

这个框架是否有特殊要求？
- [ ] 需要特定的文件名格式（如 Jekyll 的日期前缀）
- [ ] 需要特殊的 frontmatter 字段
- [ ] 需要处理附件/图片
- [ ] 需要自定义 slug 生成规则
- [ ] 其他：___

## 插件配置

列出用户需要在插件设置里填的配置：

```
运行时：[例如 npm]
同步命令：[例如 run blog]
构建命令：[例如 run blog:build]
发布命令：[例如 run blog:publish]
开发预览命令：[例如 run serve -- --port <port>]
生产预览命令：[例如 run preview -- --port <port>]
```

## PR 检查清单

- [ ] 代码已测试，所有场景通过
- [ ] README 完整（安装、配置、常见问题）
- [ ] 符合 PROTOCOL.md 输出格式
- [ ] 已添加到主 README 的「其他框架」章节
- [ ] 已添加到 CHANGELOG.md
- [ ] 遵循 CONTRIBUTING.md 的代码风格

## 示例输出

<details>
<summary>同步命令的输出示例</summary>

```
$ npm run blog

Syncing articles from Obsidian vault...
Synced: post1.md → hello-world.md
Removed: old-slug.md
__BLOG_RESULT__{"initialized":[],"published":["博客/post1.md"],"removed":["old-slug.md"],"slugs":{"博客/post1.md":"hello-world"}}
```

</details>

## 其他说明

其他需要说明的内容（如框架的特殊限制、已知问题等）。
