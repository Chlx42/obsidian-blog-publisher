import type { App, TFile } from 'obsidian'

import { buildArticleIndex } from './core/article-index'
import { inspectArticle, type Validator } from './core/article-status'
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

  isBlogNote(file: TFile): boolean {
    const folder = this.folder()
    return file.extension === 'md' && !!folder && file.path.startsWith(`${folder}/`)
  }

  private frontmatterOf(file: TFile): Record<string, unknown> | undefined {
    return this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined
  }

  private toNote(file: TFile): VaultNote {
    return { path: file.path, basename: file.basename, frontmatter: this.frontmatterOf(file) }
  }

  /** metadataCache 在内存里，每次切文件重算无感知，不需要缓存。 */
  buildIndex(): ArticleIndex {
    const notes = this.app.vault
      .getMarkdownFiles()
      .filter((file) => this.isBlogNote(file))
      .map((file) => this.toNote(file))
    return buildArticleIndex(notes, this.validator)
  }

  currentArticle(): { file: TFile; entry: ArticleEntry } | null {
    const file = this.app.workspace.getActiveFile()
    if (!file || !this.isBlogNote(file)) return null
    const note = this.toNote(file)
    const status = inspectArticle(note.frontmatter, this.validator)
    const title = typeof note.frontmatter?.title === 'string' ? note.frontmatter.title : file.basename
    return { file, entry: { ...note, title, status } }
  }

  async openPath(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path)
    if (file) await this.app.workspace.getLeaf().openFile(file)
  }
}
