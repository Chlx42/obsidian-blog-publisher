import type {
  ArticleIndex,
  BlogRunnerState,
  BlogState,
  FailedOperation,
  LogEntry,
  LogLevel,
  SyncSummary
} from '../types'

export const MAX_LOG_LINES = 300

export type BlogStateKey = keyof BlogState

/**
 * 可订阅的状态仓库。面板、状态栏、日志弹窗各自 subscribe，互不知道对方存在，
 * 这样加一个新的 UI 消费者不需要改任何已有代码。
 *
 * 回调第二参数是本次 patch 实际变化的键集合：构建输出的每一行日志都会
 * patch 一次，订阅方据此跳过与自己无关的重绘，日志风暴不再拖垮整个 UI。
 */
export class BlogStore {
  private state: BlogState = {
    task: 'idle',
    logs: [],
    lastResult: null,
    articles: null,
    previewUrl: null,
    lastFailedOperation: null
  }
  private listeners = new Set<(state: BlogState, changed: ReadonlySet<BlogStateKey>) => void>()

  getState(): BlogState {
    return this.state
  }

  /** 返回退订函数，交给 Obsidian 的 register() 管理生命周期。 */
  subscribe(listener: (state: BlogState, changed: ReadonlySet<BlogStateKey>) => void): () => void {
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

  setFailedOperation(lastFailedOperation: FailedOperation | null) {
    this.patch({ lastFailedOperation })
  }

  private patch(partial: Partial<BlogState>) {
    const changed = new Set<BlogStateKey>()
    for (const key of Object.keys(partial) as BlogStateKey[]) {
      // 值相同的 patch（比如重复 setTask('idle')）不值得惊动所有订阅者。
      if (this.state[key] !== partial[key]) changed.add(key)
    }
    if (!changed.size) return
    this.state = { ...this.state, ...partial }
    for (const listener of [...this.listeners]) listener(this.state, changed)
  }
}
