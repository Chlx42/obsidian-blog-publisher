import type {
  ArticleEntry,
  ArticleIndex,
  ArticleStatusCode,
  ArticleGroup,
  VaultNote
} from '../types'
import { inspectArticle, type Validator } from './article-status'

/** 需要动手的排前面，已经妥当的排后面。 */
const GROUP_ORDER: ArticleStatusCode[] = [
  'invalid',
  'ready',
  'draft',
  'not-published',
  'uninitialized'
]

const GROUP_LABELS: Record<ArticleStatusCode, string> = {
  invalid: '需检查',
  ready: '可发布',
  draft: '草稿',
  'not-published': '未同步',
  uninitialized: '未初始化'
}

function titleOf(note: VaultNote): string {
  const title = note.frontmatter?.title
  return typeof title === 'string' && title.trim() ? title.trim() : note.basename
}

export function buildArticleIndex(notes: VaultNote[], validator?: Validator | null): ArticleIndex {
  const entries: ArticleEntry[] = notes.map((note) => ({
    ...note,
    title: titleOf(note),
    status: inspectArticle(note.frontmatter, validator)
  }))

  const counts = Object.fromEntries(GROUP_ORDER.map((code) => [code, 0])) as Record<
    ArticleStatusCode,
    number
  >
  for (const entry of entries) counts[entry.status.code] += 1

  const groups: ArticleGroup[] = []
  for (const code of GROUP_ORDER) {
    const items = entries
      .filter((entry) => entry.status.code === code)
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    // 空分组不占地方。
    if (items.length) groups.push({ code, label: GROUP_LABELS[code], items })
  }

  return { groups, counts, total: entries.length }
}
