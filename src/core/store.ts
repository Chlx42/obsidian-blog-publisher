import type {
  ArticleIndex,
  BlogRunnerState,
  BlogState,
  LogEntry,
  LogLevel,
  SyncSummary
} from '../types'

export const MAX_LOG_LINES = 300

/**
 * 可订阅的状态仓库。面板、状态栏、日志弹窗各自 subscribe，互不知道对方存在，
 * 这样加一个新的 UI 消费者不需要改任何已有代码。
 */
export class BlogStore {
  private state: BlogState = {
    task: 'idle',
    logs: [],
    lastResult: null,
    articles: null,
    previewUrl: null
  }
  private listeners = new Set<(state: BlogState) => void>()

  getState(): BlogState {
    return this.state
  }

  /** 返回退订函数，交给 Obsidian 的 register() 管理生命周期。 */
  subscribe(listener: (state: BlogState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setTask(task: BlogRunnerState) {
    this.patch({ task })
  }

  setPreviewUrl(previewUrl: string | null) {
    this.patch({ previewUrl })
  }

  setResult(lastResult: SyncSummary | null) {
    this.patch({ lastResult })
  }

  setArticles(articles: ArticleIndex | null) {
    this.patch({ articles })
  }

  appendLog(text: string, level: LogLevel) {
    const entry: LogEntry = { text, level, stage: this.state.task }
    const logs = [...this.state.logs, entry]
    // 长构建输出会无限增长，只保留尾部。
    this.patch({ logs: logs.length > MAX_LOG_LINES ? logs.slice(-MAX_LOG_LINES) : logs })
  }

  clearLogs() {
    this.patch({ logs: [] })
  }

  private patch(partial: Partial<BlogState>) {
    this.state = { ...this.state, ...partial }
    for (const listener of [...this.listeners]) listener(this.state)
  }
}
