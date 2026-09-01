import { FileSystemAdapter, Modal, Notice, Plugin, TFile, type App } from 'obsidian'

import { loadValidator, type Validator } from './core/article-status'
import { buildBlogUrl, toggleDraft, togglePublish } from './core/frontmatter'
import { BlogStore } from './core/store'
import { TaskRunner } from './core/task-runner'
import { BlogLogModal } from './ui/log-modal'
import { BLOG_PANEL_VIEW_TYPE, BlogPanelView } from './ui/panel'
import { BlogPublisherSettingTab } from './ui/settings-tab'
import { StatusBar } from './ui/status-bar'
import {
  DEFAULT_COMMANDS,
  DEFAULT_SETTINGS,
  type ArticleStatus,
  type BlogPublisherSettings
} from './types'
import { VaultNotes } from './vault-notes'

const AUTO_SYNC_DEBOUNCE_MS = 800

export default class BlogPublisherPlugin extends Plugin {
  settings: BlogPublisherSettings = DEFAULT_SETTINGS
  private store!: BlogStore
  private runner!: TaskRunner
  private notes!: VaultNotes
  private statusBar!: StatusBar
  private autoSyncTimer: number | null = null
  private validator: Validator | null = null

  async onload() {
    await this.loadSettings()
    await this.loadValidator()

    this.store = new BlogStore()
    this.notes = new VaultNotes(this.app, () => this.settings.articlesFolder, this.validator)
    this.runner = new TaskRunner(this.settings, this.store, this.vaultRoot())

    this.registerView(
      BLOG_PANEL_VIEW_TYPE,
      (leaf) =>
        new BlogPanelView(leaf, this.store, {
          togglePreview: () => void this.togglePreview(),
          publish: () => void this.publishBlog(),
          openLogs: () => new BlogLogModal(this.app, this.store).open(),
          openPath: (path) => void this.notes.openPath(path),
          isPreviewing: () => this.runner.isPreviewing(),
          togglePublish: (path) => void this.togglePublish(path),
          toggleDraft: (path) => void this.toggleDraft(path),
          copyUrl: (path, slug) => void this.copyUrl(path, slug)
        })
    )

    this.addRibbonIcon('layout-panel-left', '博客面板', () => void this.openPanel()).addClass(
      'blog-publisher-ribbon'
    )
    this.addRibbonIcon('upload-cloud', '一键发布博客', () => void this.publishBlog()).addClass(
      'blog-publisher-ribbon'
    )

    this.statusBar = new StatusBar(this.addStatusBarItem(), this.addStatusBarItem(), () =>
      void this.openPanel()
    )
    this.register(this.store.subscribe(() => this.renderStatusBar()))

    this.addCommand({
      id: 'open-panel',
      name: '打开博客面板',
      callback: () => void this.openPanel()
    })
    this.addCommand({
      id: 'toggle-preview',
      name: '本地预览博客：启动或停止',
      callback: () => void this.togglePreview()
    })
    this.addCommand({
      id: 'publish-blog',
      name: '一键发布博客',
      callback: () => void this.publishBlog()
    })
    this.addCommand({
      id: 'show-logs',
      name: '查看最近任务日志',
      callback: () => new BlogLogModal(this.app, this.store).open()
    })
    this.addCommand({
      id: 'check-current-article',
      name: '检查当前博客文章',
      checkCallback: (checking) => {
        const article = this.notes.currentArticle()
        if (!article) return false
        if (!checking) new ArticleStatusModal(this.app, article.file, article.entry.status).open()
        return true
      }
    })

    this.registerEvent(this.app.workspace.on('file-open', () => this.refreshArticles()))
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (this.notes.isBlogNote(file)) this.refreshArticles()
      })
    )
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!(file instanceof TFile) || !this.notes.isBlogNote(file)) return
        this.scheduleAutoSync()
      })
    )
    // 增删文件也要更新列表。
    this.registerEvent(this.app.vault.on('create', () => this.refreshArticles()))
    this.registerEvent(this.app.vault.on('delete', () => this.refreshArticles()))
    this.registerEvent(this.app.vault.on('rename', () => this.refreshArticles()))

    this.addSettingTab(new BlogPublisherSettingTab(this.app, this))
    this.app.workspace.onLayoutReady(() => this.refreshArticles())
  }

  async onunload() {
    if (this.autoSyncTimer !== null) window.clearTimeout(this.autoSyncTimer)
    await this.runner?.stopPreview()
  }

  /** commands 是嵌套对象，浅合并会让缺失的命令变成 undefined，设置页会崩。 */
  async loadSettings() {
    const saved = (await this.loadData()) as Partial<BlogPublisherSettings> | null
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      commands: { ...DEFAULT_COMMANDS, ...saved?.commands }
    }
  }

  async saveSettings() {
    await this.saveData(this.settings)
    this.runner?.updateSettings(this.settings)
    await this.loadValidator()
    this.notes?.setValidator(this.validator)
    this.refreshArticles()
  }

  private async loadValidator() {
    this.validator = await loadValidator(this.settings.customValidatorPath)
  }

  /** 供设置页显示探测结果。 */
  detectedRuntimePath(): string | null {
    return this.runner?.detectedRuntimePath() ?? null
  }

  /** 供设置页显示当前目录识别到多少篇。 */
  articleCount(): number {
    return this.store?.getState().articles?.total ?? 0
  }

  private async openPanel() {
    const existing = this.app.workspace.getLeavesOfType(BLOG_PANEL_VIEW_TYPE)
    if (existing.length) {
      await this.app.workspace.revealLeaf(existing[0])
      return
    }
    const leaf = this.app.workspace.getRightLeaf(false)
    if (!leaf) return
    await leaf.setViewState({ type: BLOG_PANEL_VIEW_TYPE, active: true })
    await this.app.workspace.revealLeaf(leaf)
  }

  private async togglePreview() {
    try {
      const started = await this.runner.togglePreview()
      if (started) {
        new Notice(`博客预览已启动：${this.runner.getPreviewUrl()}`)
        window.open(this.runner.getPreviewUrl(), '_blank')
      } else {
        new Notice('博客预览已停止')
      }
    } catch (error) {
      this.showError(error)
    }
  }

  private async publishBlog() {
    try {
      new Notice('正在构建并发布博客…', 5_000)
      await this.runner.publish()
      new Notice('博客发布成功')
    } catch (error) {
      this.showError(error)
    }
  }

  private async togglePublish(path: string) {
    const file = this.app.vault.getFileByPath(path)
    if (!file) return
    try {
      await togglePublish(this.app, file)
      this.refreshArticles()
    } catch (error) {
      this.showError(error)
    }
  }

  private async toggleDraft(path: string) {
    const file = this.app.vault.getFileByPath(path)
    if (!file) return
    try {
      await toggleDraft(this.app, file)
      this.refreshArticles()
    } catch (error) {
      this.showError(error)
    }
  }

  private async copyUrl(path: string, slug: string) {
    try {
      const url = buildBlogUrl(this.settings.siteUrl, slug)
      await navigator.clipboard.writeText(url)
      new Notice(`已复制: ${url}`)
    } catch (error) {
      this.showError(error)
    }
  }

  private refreshArticles() {
    this.store.setArticles(this.notes.buildIndex())
  }

  private renderStatusBar() {
    const article = this.notes.currentArticle()
    this.statusBar.render(this.store.getState(), article?.entry.status.label ?? null)
    this.statusBar.setArticleStatusCode(article?.entry.status.code ?? null)
  }

  private scheduleAutoSync() {
    if (!this.settings.autoSyncOnSave || !this.runner.canAutoSync()) return
    if (this.autoSyncTimer !== null) window.clearTimeout(this.autoSyncTimer)
    this.autoSyncTimer = window.setTimeout(() => {
      this.autoSyncTimer = null
      void this.runner.syncPreviewContent().catch((error) => this.showError(error))
    }, AUTO_SYNC_DEBOUNCE_MS)
  }

  /** Vault 绝对路径，桌面端一定是 FileSystemAdapter。 */
  private vaultRoot() {
    const adapter = this.app.vault.adapter
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : ''
  }

  private showError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    new Notice(`博客操作失败：${message}`, 10_000)
    new BlogLogModal(this.app, this.store, message).open()
  }
}

class ArticleStatusModal extends Modal {
  constructor(
    app: App,
    private file: TFile,
    private status: ArticleStatus
  ) {
    super(app)
  }

  onOpen() {
    this.titleEl.setText(this.status.label)
    this.contentEl.createEl('p', { cls: 'blog-publisher-article-path', text: this.file.path })
    const list = this.contentEl.createEl('ul')
    for (const issue of this.status.issues) list.createEl('li', { text: issue })
  }

  onClose() {
    this.contentEl.empty()
  }
}
