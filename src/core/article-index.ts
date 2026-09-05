import type {
  ArticleEntry,
  ArticleIndex,
  ArticleStatusCode,
  ArticleGroup,
  VaultNote
} from '../types'
import { inspectArticle, type LiveEntry, type Validator } from './article-status'
import { sourceKeyOfNotePath } from './publish-record'

/** 需要动手的排前面，已经妥当的排后面。 */
const GROUP_ORDER: ArticleStatusCode[] = [
  'invalid',
  'pending',
  'live',
  'draft',
  'unpublished',
  'uninitialized'
]

const GROUP_LABELS: Record<ArticleStatusCode, string> = {
  invalid: '需检查',
  pending: '待发布',
  live: '已上线',
  draft: '草稿',
  unpublished: '未发布',
  uninitialized: '缺 frontmatter'
}

function titleOf(note: VaultNote): string {
  const title = note.frontmatter?.title
  return typeof title === 'string' && title.trim() ? title.trim() : note.basename
}

/**
 * liveSources 是最近一次成功推送的存根；articlesFolder 用于把 vault 路径
 * 换算成 manifest 的 source key。两者缺任一个，所有文章都只能是「待发布」。
 */
export function buildArticleIndex(
  notes: VaultNote[],
  validator?: Validator | null,
  liveSources?: Record<string, LiveEntry> | null,
  articlesFolder = ''
): ArticleIndex {
  const entries: ArticleEntry[] = notes.map((note) => {
    const sourceKey = sourceKeyOfNotePath(note.path, articlesFolder)
    const live = (sourceKey && liveSources?.[sourceKey]) || null
    return {
      ...note,
      title: titleOf(note),
      status: inspectArticle(note.frontmatter, validator, live, note.mtime)
    }
  })

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
