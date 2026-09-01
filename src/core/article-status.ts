import type { ArticleStatus } from '../types'

export type Validator = (frontmatter: Record<string, unknown>) => string[]

export interface ValidatorLoadResult {
  validator: Validator | null
  /** 加载失败的原因，成功或未配置时为 null。用于在设置页显示。 */
  error: string | null
}

/**
 * 加载校验器并回报失败原因。
 *
 * 运行时降级为不校验，但原因必须能显示出来：路径填错时插件会把所有文章都判成
 * 「可发布」，静默失败的表现和一切正常一样，用户没法自己发现。
 */
export function loadValidatorResult(path: string): ValidatorLoadResult {
  const trimmed = path.trim()
  if (!trimmed) return { validator: null, error: null }

  let module: unknown
  try {
    // Obsidian 环境下用 require 而非 import（esbuild 打包后是 CommonJS）
    module = require(trimmed)
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
      ? '找不到这个文件'
      : `加载出错：${(error as Error).message}`
    return { validator: null, error: reason }
  }

  const exported = module as Record<string, unknown>
  const fn = exported?.collectArticleIssues ?? exported?.default
  if (typeof fn !== 'function') {
    return { validator: null, error: '文件没有导出 collectArticleIssues 函数' }
  }
  return { validator: fn as Validator, error: null }
}

/** 动态加载用户的校验函数，失败时返回 null（降级为不校验）。 */
export async function loadValidator(path: string): Promise<Validator | null> {
  return loadValidatorResult(path).validator
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

