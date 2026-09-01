import type { ArticleStatus } from '../types'

export type Validator = (frontmatter: Record<string, unknown>) => string[]

/** 动态加载用户的校验函数，失败时返回 null（降级为不校验）。 */
export async function loadValidator(path: string): Promise<Validator | null> {
  if (!path.trim()) return null
  try {
    // Obsidian 环境下用 require 而非 import（esbuild 打包后是 CommonJS）
    const module = require(path)
    const fn = module.collectArticleIssues ?? module.default
    return typeof fn === 'function' ? fn : null
  } catch {
    return null
  }
}

export function inspectArticle(
  frontmatter?: Record<string, unknown>,
  validator?: Validator | null
): ArticleStatus {
  if (!frontmatter) {
    return {
      code: 'uninitialized',
      label: '文章：未初始化',
      issues: ['还没有 frontmatter，运行一次同步会自动补齐']
    }
  }

  if (frontmatter.publish !== true) {
    return {
      code: 'not-published',
      label: '文章：未同步',
      issues: ['publish 不是 true，当前文章不会同步到博客']
    }
  }

  // 只有配置了校验器才校验
  const issues = validator ? validator(frontmatter) : []
  if (issues.length) {
    return { code: 'invalid', label: '文章：需检查', issues }
  }

  if (frontmatter.draft === true) {
    return {
      code: 'draft',
      label: '文章：草稿',
      issues: ['开发预览中可见，正式发布时会隐藏']
    }
  }

  return { code: 'ready', label: '文章：可发布', issues: [] }
}

