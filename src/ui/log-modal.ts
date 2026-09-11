import { App, Modal, Notice } from 'obsidian'

import type { BlogStore } from '../core/store'
import { STATE_LABELS, type BlogRunnerState, type LogEntry } from '../types'

export class BlogLogModal extends Modal {
  private errorsOnly = false
  private logContainer!: HTMLElement
  private errorToggle!: HTMLButtonElement
  private unsubscribe: (() => void) | null = null
  /** 增量渲染的进度标记：已渲染条数、首条引用（检测日志窗口滑动）、末组指针。 */
  private renderedLogCount = 0
  private firstRenderedLog: LogEntry | null = null
  private lastStage: BlogRunnerState | null = null
  private lastGroup: HTMLElement | null = null
  private renderedAllLogs = false

  constructor(
    app: App,
    private store: BlogStore,
    private error?: string,
    private onRetry?: () => Promise<void>
  ) {
    super(app)
  }

  onOpen() {
    this.titleEl.setText('博客任务日志')

    const actions = this.contentEl.createDiv({ cls: 'blog-publisher-log-actions' })

    if (this.onRetry && this.error) {
      actions.createEl('button', { text: '重试', cls: 'mod-warning' }).addEventListener('click', async () => {
        this.close()
        await this.onRetry!()
      })
    }

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
    // 弹窗开着时任务还在跑，日志要跟着涨；其它键（task 等）不影响列表内容。
    this.unsubscribe = this.store.subscribe((_state, changed) => {
      if (changed.has('logs')) this.renderLogs()
    })
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
    const logs = this.store.getState().logs

    // 构建输出按块到达，逐条追加即可；整块重建留给窗口滑动、清空和过滤切换。
    const canAppend =
      !this.errorsOnly &&
      this.renderedAllLogs &&
      this.renderedLogCount > 0 &&
      logs.length >= this.renderedLogCount &&
      logs[logs.length - this.renderedLogCount] === this.firstRenderedLog
    if (canAppend) {
      for (let i = this.renderedLogCount; i < logs.length; i += 1) this.appendLogEntry(logs[i])
      this.renderedLogCount = logs.length
      return
    }

    this.renderLogsFull(logs)
  }

  private appendLogEntry(entry: LogEntry) {
    if (entry.stage !== this.lastStage || !this.lastGroup) {
      this.logContainer.createDiv({
        cls: 'blog-publisher-log-stage',
        text: STATE_LABELS[entry.stage]
      })
      this.lastStage = entry.stage
      this.lastGroup = this.logContainer.createEl('pre', { cls: 'blog-publisher-log-lines' })
    }
    this.lastGroup.createDiv({
      cls: `blog-publisher-log-line is-${entry.level}`,
      text: entry.text
    })
  }

  private renderLogsFull(logs: LogEntry[]) {
    this.logContainer.empty()
    this.renderedLogCount = logs.length
    this.firstRenderedLog = logs[0] ?? null
    this.lastStage = null
    this.lastGroup = null
    this.renderedAllLogs = !this.errorsOnly

    if (this.error) {
      this.logContainer.createDiv({ cls: 'blog-publisher-log-error-summary', text: this.error })
    }

    const entries = this.errorsOnly ? logs.filter((entry) => entry.level === 'error') : logs
    if (!entries.length) {
      this.logContainer.createDiv({
        cls: 'blog-publisher-log-empty',
        text: this.errorsOnly ? '没有错误日志' : '暂无日志'
      })
      return
    }

    for (const entry of entries) this.appendLogEntry(entry)
  }
}
