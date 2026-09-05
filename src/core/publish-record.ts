import type { LiveEntry } from './article-status'

/**
 * 目录外笔记的 source key 前缀。key 空间必须和目录内互斥：
 * 目录内是相对路径（不会以 ../ 开头），目录外是 `../` + vault 相对路径。
 */
export const EXTRA_SOURCE_PREFIX = '../'

/**
 * 一次成功推送的本地存根。发布器只把「已经推上远端」的结果告诉插件，
 * 插件把它记下来，面板才能区分「待发布」和「已上线」。
 *
 * key 是发布器 manifest 的 source key：文章目录内是相对路径（如 `xxx.md`），
 * 目录外是 `../` + vault 相对路径——不是 vault 全路径，两者靠 articlesFolder 前缀互转。
 */
export interface PublishRecord {
  pushedAt: number
  sources: Record<string, LiveEntry>
}

/** manifest source key → vault 笔记路径。articlesFolder 为空时两者相同。 */
export function notePathOfSourceKey(sourceKey: string, articlesFolder: string): string {
  if (sourceKey.startsWith(EXTRA_SOURCE_PREFIX)) {
    return sourceKey.slice(EXTRA_SOURCE_PREFIX.length)
  }
  const folder = articlesFolder.replace(/^\/+|\/+$/g, '')
  return folder ? `${folder}/${sourceKey}` : sourceKey
}

/**
 * vault 笔记路径 → manifest source key。文章目录内返回相对路径；
 * 目录外返回 `../` 前缀的 key（目录外的 publish 笔记也是博客文章）。
 */
export function sourceKeyOfNotePath(notePath: string, articlesFolder: string): string | null {
  const folder = articlesFolder.replace(/^\/+|\/+$/g, '')
  if (!folder) return notePath
  if (notePath.startsWith(`${folder}/`)) return notePath.slice(folder.length + 1)
  return `${EXTRA_SOURCE_PREFIX}${notePath}`
}

export function buildPublishRecord(
  published: string[],
  slugs: Record<string, string>,
  pushedAt: number,
  /** 返回 source key 对应笔记当前的 mtime；文件读不到时跳过该条。 */
  mtimeOf: (sourceKey: string) => number | null
): PublishRecord {
  const sources: Record<string, LiveEntry> = {}
  for (const sourceKey of published) {
    const slug = slugs[sourceKey]
    const mtime = mtimeOf(sourceKey)
    if (!slug || mtime === null) continue
    sources[sourceKey] = { slug, mtime }
  }
  return { pushedAt, sources }
}
