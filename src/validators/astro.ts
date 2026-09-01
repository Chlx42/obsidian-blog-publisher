/**
 * 发布器和 Obsidian 插件共用的 frontmatter 校验规则。
 *
 * 插件通过 esbuild 打包这个文件，因此这里不能引入任何外部依赖，
 * 否则依赖会被一起打进插件产物。
 */

export const TITLE_MAX_LENGTH = 60
export const DESCRIPTION_MAX_LENGTH = 160

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidDate(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (typeof value === 'string' || typeof value === 'number') {
    return !Number.isNaN(new Date(value).getTime())
  }
  return false
}

/**
 * 收集一篇待发布文章的所有字段问题。返回空数组表示通过。
 * 发布器取第一条抛错，插件把整个列表显示出来。
 */
export function collectArticleIssues(frontmatter: Record<string, unknown>): string[] {
  const issues: string[] = []
  const { title, description, publishDate, updatedDate, tags, draft, heroImage } = frontmatter

  if (typeof title !== 'string' || !title.trim()) issues.push('title 不能为空')
  else if (title.length > TITLE_MAX_LENGTH) {
    issues.push(`title 不能超过 ${TITLE_MAX_LENGTH} 字`)
  }

  if (typeof description !== 'string' || !description.trim()) issues.push('description 不能为空')
  else if (description.length > DESCRIPTION_MAX_LENGTH) {
    issues.push(`description 不能超过 ${DESCRIPTION_MAX_LENGTH} 字`)
  }

  if (!isValidDate(publishDate)) issues.push('publishDate 不是有效日期')
  if (updatedDate !== undefined && !isValidDate(updatedDate)) {
    issues.push('updatedDate 不是有效日期')
  }

  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
    issues.push('tags 必须是字符串数组')
  }

  if (typeof draft !== 'boolean') issues.push('draft 必须是布尔值')

  if (heroImage !== undefined) issues.push(...collectHeroImageIssues(heroImage))

  return issues
}

function collectHeroImageIssues(heroImage: unknown): string[] {
  if (typeof heroImage === 'string') {
    return heroImage.trim() ? [] : ['heroImage 不能为空']
  }
  if (!isPlainObject(heroImage)) {
    return ['heroImage 必须是附件名或包含 src 的对象']
  }

  const issues: string[] = []
  const { src, alt, color } = heroImage
  if (typeof src !== 'string' || !src.trim()) issues.push('heroImage.src 不能为空')
  if (alt !== undefined && typeof alt !== 'string') issues.push('heroImage.alt 必须是字符串')
  if (color !== undefined && typeof color !== 'string') issues.push('heroImage.color 必须是字符串')
  return issues
}
