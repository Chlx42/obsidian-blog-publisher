import { STATE_LABELS, type BlogState } from '../types'

/**
 * 状态栏：显示任务进度和文章计数。
 *
 * 改进：
 * - 显示实时进度：「⏳ 3/12 同步中」或「✅ 已同步 12 篇」
 * - 不同阶段用不同图标（sync/build/publish）
 * - 点击打开面板
 */
export class StatusBar {
  constructor(
    private taskEl: HTMLElement,
    private articleEl: HTMLElement,
    onClick: () => void
  ) {
    this.taskEl.addClass('blog-publisher-status')
    this.taskEl.setAttr('aria-label', '打开博客面板')
    this.taskEl.addEventListener('click', onClick)

    this.articleEl.addClass('blog-publisher-article-status')
    this.articleEl.setAttr('aria-label', '打开博客面板查看当前文章')
    this.articleEl.addEventListener('click', onClick)
  }

  render(state: BlogState, articleLabel: string | null) {
    // 任务状态：根据阶段显示不同图标和计数
    const taskText = this.getTaskStatusText(state)
    this.taskEl.setText(taskText)

    // 文章状态（当前打开的文章）
    if (!articleLabel) {
      this.articleEl.style.display = 'none'
      return
    }
    this.articleEl.style.display = ''
    this.articleEl.setText(articleLabel)
  }

  setArticleStatusCode(code: string | null) {
    if (code) this.articleEl.setAttr('data-status', code)
    else this.articleEl.removeAttribute('data-status')
  }

  private getTaskStatusText(state: BlogState): string {
    const { task, articles, lastResult } = state

    // 空闲或预览中：显示文章总数
    if (task === 'idle' || task === 'previewing') {
      if (!articles) return STATE_LABELS[task]

      const ready = articles.counts.ready || 0
      const draft = articles.counts.draft || 0
      const total = ready + draft

      if (task === 'previewing') {
        return `📺 预览中 · ${total} 篇`
      }
      return total > 0 ? `✅ 已同步 ${total} 篇` : '博客：就绪'
    }

    // 同步/构建/发布中：显示进度
    if (task === 'syncing' || task === 'building') {
      if (lastResult?.published?.length) {
        const count = lastResult.published.length
        return `⏳ ${count} 篇 ${task === 'syncing' ? '同步中' : '构建中'}`
      }
      return `⏳ ${STATE_LABELS[task]}`
    }

    if (task === 'publishing') {
      if (lastResult?.published?.length) {
        const count = lastResult.published.length
        return `🚀 发布中 · ${count} 篇`
      }
      return `🚀 ${STATE_LABELS[task]}`
    }

    // 其他状态：显示默认标签
    return STATE_LABELS[task]
  }
}
