import { STATE_LABELS, type BlogState } from '../types'

/**
 * 两个状态栏项：左边是任务状态，右边是当前文章状态。
 * 都订阅 store，点击交给调用方决定（现在都是打开面板）。
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
    this.taskEl.setText(STATE_LABELS[state.task])

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
}
