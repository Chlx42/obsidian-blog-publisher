import type { LiveEntry } from './article-status'

/**
 * 一次成功推送的本地存根。发布器只把「已经推上远端」的结果告诉插件，
 * 插件把它记下来，面板才能区分「待发布」和「已上线」。
 *
 * key 是发布器 manifest 的 source key：相对文章目录的路径（如 `xxx.md`），
 * 不是 vault 全路径——两者靠 articlesFolder 前缀互转。
 */
export interface PublishRecord {
  pushedAt: number
  sources: Record<string, LiveEntry>
}

/** manifest source key → vault 笔记路径。articlesFolder 为空时两者相同。 */
export function notePathOfSourceKey(sourceKey: string, articlesFolder: string): string {
  const folder = articlesFolder.replace(/^\/+|\/+$/g, '')
  return folder ? `${folder}/${sourceKey}` : sourceKey
}

/** vault 笔记路径 → manifest source key。不在文章目录里时返回 null。 */
export function sourceKeyOfNotePath(notePath: string, articlesFolder: string): string | null {
  const folder = articlesFolder.replace(/^\/+|\/+$/g, '')
  if (!folder) return notePath
  return notePath.startsWith(`${folder}/`) ? notePath.slice(folder.length + 1) : null
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
