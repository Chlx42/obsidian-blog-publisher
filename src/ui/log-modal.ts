import { App, Modal, Notice } from 'obsidian'

import type { BlogStore } from '../core/store'
import { STATE_LABELS, type BlogRunnerState, type LogEntry } from '../types'

export class BlogLogModal extends Modal {
  private errorsOnly = false
  private logContainer!: HTMLElement
  private errorToggle!: HTMLButtonElement
  private unsubscribe: (() => void) | null = null

  constructor(
    app: App,
    private store: BlogStore,
    private error?: string
  ) {
    super(app)
  }

  onOpen() {
    this.titleEl.setText('博客任务日志')

    const actions = this.contentEl.createDiv({ cls: 'blog-publisher-log-actions' })
    actions.createEl('button', { text: '复制全部' }).addEventListener('click', () => {
      void navigator.clipboard.writeText(this.plainText()).then(() => new Notice('日志已复制'))
    })
    this.errorToggle = actions.createEl('button', { text: '只看错误' })
    this.errorToggle.addEventListener('click', () => {
      this.errorsOnly = !this.errorsOnly
      this.errorToggle.setText(this.errorsOnly ? '显示全部' : '只看错误')
      this.errorToggle.classList.toggle('is-active', this.errorsOnly)
      this.renderLogs()
    })
    actions.createEl('button', { text: '清空' }).addEventListener('click', () => {
      this.store.clearLogs()
      this.error = undefined
      this.renderLogs()
    })

    this.logContainer = this.contentEl.createDiv({ cls: 'blog-publisher-log' })
    this.renderLogs()
    // 弹窗开着时任务还在跑，日志要跟着涨。
    this.unsubscribe = this.store.subscribe(() => this.renderLogs())
  }

  onClose() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.contentEl.empty()
  }

  private visibleEntries(): LogEntry[] {
    const entries = this.store.getState().logs
    return this.errorsOnly ? entries.filter((entry) => entry.level === 'error') : entries
  }

  private plainText(): string {
    const lines = this.visibleEntries().map((entry) => entry.text)
    return [this.error, ...lines].filter(Boolean).join('\n')
  }

  /** 按阶段分组，让「同步失败」和「构建失败」一眼能分开。 */
  private renderLogs() {
    this.logContainer.empty()

    if (this.error) {
      this.logContainer.createDiv({ cls: 'blog-publisher-log-error-summary', text: this.error })
    }

    const entries = this.visibleEntries()
    if (!entries.length) {
      this.logContainer.createDiv({
        cls: 'blog-publisher-log-empty',
        text: this.errorsOnly ? '没有错误日志' : '暂无日志'
      })
      return
    }

    let currentStage: BlogRunnerState | null = null
    let group: HTMLElement | null = null
    for (const entry of entries) {
      if (entry.stage !== currentStage || !group) {
        currentStage = entry.stage
        this.logContainer.createDiv({
          cls: 'blog-publisher-log-stage',
          text: STATE_LABELS[entry.stage]
        })
        group = this.logContainer.createEl('pre', { cls: 'blog-publisher-log-lines' })
      }
      group.createDiv({
        cls: `blog-publisher-log-line is-${entry.level}`,
        text: entry.text
      })
    }
  }
}
