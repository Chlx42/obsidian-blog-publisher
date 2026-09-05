import type { App, TFile } from 'obsidian'

import { buildArticleIndex } from './core/article-index'
import { inspectArticle, type LiveEntry, type Validator } from './core/article-status'
import { sourceKeyOfNotePath, notePathOfSourceKey } from './core/publish-record'
import type { ArticleEntry, ArticleIndex, VaultNote } from './types'

/**
 * 唯一读 Obsidian vault 的地方。core/ 里不许 import obsidian，
 * 所以这里负责把 TFile 和 metadataCache 转成纯数据。
 */
export class VaultNotes {
  constructor(
    private app: App,
    private articlesFolder: () => string,
    private validator?: Validator | null
  ) {}

  setValidator(validator: Validator | null | undefined) {
    this.validator = validator
  }

  /** 归一化后的文章目录前缀，空字符串表示没配置。 */
  private folder(): string {
    return this.articlesFolder().replace(/^\/+|\/+$/g, '')
  }

  /**
   * 博客文章的范围：文章目录内的所有 md，加上目录外显式标记
   * publish: true 的 md（和发布器的同步范围保持同一规则）。
   */
  isBlogNote(file: TFile): boolean {
    if (file.extension !== 'md') return false
    const folder = this.folder()
    if (folder && file.path.startsWith(`${folder}/`)) return true
    return this.frontmatterOf(file)?.publish === true
  }

  private frontmatterOf(file: TFile): Record<string, unknown> | undefined {
    return this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined
  }

  private toNote(file: TFile): VaultNote {
    return {
      path: file.path,
      basename: file.basename,
      frontmatter: this.frontmatterOf(file),
      mtime: file.stat.mtime
    }
  }

  /** metadataCache 在内存里，每次切文件重算无感知，不需要缓存。 */
  buildIndex(liveSources?: Record<string, LiveEntry> | null): ArticleIndex {
    const notes = this.app.vault
      .getMarkdownFiles()
      .filter((file) => this.isBlogNote(file))
      .map((file) => this.toNote(file))
    return buildArticleIndex(notes, this.validator, liveSources, this.articlesFolder())
  }

  currentArticle(liveSources?: Record<string, LiveEntry> | null): { file: TFile; entry: ArticleEntry } | null {
    const file = this.app.workspace.getActiveFile()
    if (!file || !this.isBlogNote(file)) return null
    const note = this.toNote(file)
    const sourceKey = sourceKeyOfNotePath(note.path, this.articlesFolder())
    const live = (sourceKey && liveSources?.[sourceKey]) || null
    const status = inspectArticle(note.frontmatter, this.validator, live, note.mtime)
    const title = typeof note.frontmatter?.title === 'string' ? note.frontmatter.title : file.basename
    return { file, entry: { ...note, title, status } }
  }

  async openPath(path: string): Promise<void> {
    // 同步结果里的是 manifest source key（相对文章目录），打不开时按文章目录拼回 vault 路径。
    const file =
      this.app.vault.getFileByPath(path) ??
      this.app.vault.getFileByPath(notePathOfSourceKey(path, this.articlesFolder()))
    if (file) await this.app.workspace.getLeaf().openFile(file)
  }
}
