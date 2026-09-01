import type { App, TFile } from 'obsidian'

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

/**
 * 从 manifest 拿到的 slug 比 frontmatter 权威，因为可能被规则改写。
 * 面板的 slugs 来自 SyncSummary，store 持有最后一次同步的结果。
 */
export function buildBlogUrl(siteUrl: string, slug: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  return `${base}/blog/${slug}/`
}
