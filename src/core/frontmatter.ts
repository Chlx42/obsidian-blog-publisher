import type { App, TFile } from 'obsidian'

import { DESCRIPTION_MAX_LENGTH } from '../validators/astro'

/**
 * 安全修改 frontmatter 的唯一方式。processFrontMatter 只动目标键，
 * 其余内容和格式（注释、引号、缩进）原样保留，比自己拼 YAML 可靠。
 */
export async function togglePublish(app: App, file: TFile): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm.publish = !fm.publish
  })
}

export async function toggleDraft(app: App, file: TFile): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm.draft = !fm.draft
  })
}

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

/** 去掉链接、嵌入和行内标记，留下一句干净的纯文本。 */
function cleanExcerptLine(line: string): string {
  return line
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias ?? target)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>~]/g, '')
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 从正文提取 description 草稿：frontmatter 之后的第一行有效文本，
 * 超长截断到校验器允许的上限。提取不出来就返回空串，由用户自己写。
 */
export function descriptionExcerpt(content: string): string {
  const body = content.replace(FRONTMATTER_PATTERN, '')
  for (const rawLine of body.split(/\r?\n/)) {
    const line = cleanExcerptLine(rawLine)
    if (!line) continue
    if (line.length <= DESCRIPTION_MAX_LENGTH) return line
    return `${line.slice(0, DESCRIPTION_MAX_LENGTH - 1)}…`
  }
  return ''
}

export interface BlogFrontmatterContext {
  basename: string
  /** 文件创建时间，publishDate 缺省值的来源。 */
  created: Date
}

/**
 * 算出还缺哪些博客字段。只补缺失键，用户写过的内容一律不动；
 * 全部齐备时返回 null（说明已经是完整的博客文章）。
 *
 * publish/draft 的缺省和发布器 initializeNote 不同：手动「加入博客」是
 * 有意识的发布意图，直接标记 publish: true（目录外笔记只有这样才会被
 * 识别），draft: true 先进草稿箱，准备好后再在面板取消草稿。
 */
export function missingBlogDefaults(
  frontmatter: Record<string, unknown> | undefined,
  file: BlogFrontmatterContext,
  description = ''
): Record<string, unknown> | null {
  const fm = frontmatter ?? {}
  const missing: Record<string, unknown> = {}
  if (!('publish' in fm)) missing.publish = true
  if (!('draft' in fm)) missing.draft = true
  if (!('title' in fm)) missing.title = file.basename
  if (!('description' in fm)) missing.description = description
  if (!('publishDate' in fm)) missing.publishDate = formatDate(file.created)
  if (!('tags' in fm)) missing.tags = []
  return Object.keys(missing).length ? missing : null
}

/**
 * 一键加入博客：把缺失的字段补进 frontmatter，返回是否真的改了文件。
 * slug 和 language 故意不写——发布器会算，写在笔记里反而会过期。
 */
export async function initArticleFrontmatter(app: App, file: TFile): Promise<boolean> {
  const excerpt = descriptionExcerpt(await app.vault.cachedRead(file))
  let changed = false
  await app.fileManager.processFrontMatter(file, (fm) => {
    const missing = missingBlogDefaults(
      fm,
      { basename: file.basename, created: new Date(file.stat.ctime) },
      excerpt
    )
    if (!missing) return
    Object.assign(fm, missing)
    changed = true
  })
  return changed
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 从 manifest 拿到的 slug 比 frontmatter 权威，因为可能被规则改写。
 * 面板的 slugs 来自 SyncSummary，store 持有最后一次同步的结果。
 */
export function buildBlogUrl(siteUrl: string, slug: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  return `${base}/blog/${slug}/`
}
