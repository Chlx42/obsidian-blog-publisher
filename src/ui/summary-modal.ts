import { Modal, App } from 'obsidian'
import type { SyncSummary } from '../types'

/**
 * 操作完成后弹出的摘要窗口。
 *
 * 显示：
 * - 本次同步/构建的文章列表
 * - 下线的旧文件
 * - 点击文件名跳转到笔记
 */
export class SummaryModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private result: SyncSummary,
    private onOpenNote: (path: string) => void
  ) {
    super(app)
  }

  onOpen() {
    const { contentEl, result } = this

    contentEl.empty()
    contentEl.addClass('blog-publisher-summary')

    // 标题
    const header = contentEl.createDiv({ cls: 'summary-header' })
    header.createEl('h2', { text: this.title })

    const content = contentEl.createDiv({ cls: 'summary-content' })

    // 已发布
    if (result.published.length > 0) {
      this.renderSection(
        content,
        '📄 已发布',
        result.published,
        'published-list'
      )
    }

    // 补全 frontmatter（笔记原来没有 frontmatter，同步时自动补上）
    if (result.initialized.length > 0) {
      this.renderSection(
        content,
        '🆕 补全 frontmatter',
        result.initialized,
        'initialized-list',
        '这些笔记还没有 frontmatter，同步时已自动补齐'
      )
    }

    // 已下线
    if (result.removed.length > 0) {
      this.renderSection(
        content,
        '🗑️ 已下线',
        result.removed,
        'removed-list',
        '文章已删除或取消发布，旧文件已清理'
      )
    }

    // 无变更
    if (
      result.published.length === 0 &&
      result.initialized.length === 0 &&
      result.removed.length === 0
    ) {
      content.createDiv({
        cls: 'summary-empty',
        text: '没有变更'
      })
    }

    // 关闭按钮
    const footer = contentEl.createDiv({ cls: 'summary-footer' })
    const closeBtn = footer.createEl('button', { text: '关闭', cls: 'mod-cta' })
    closeBtn.addEventListener('click', () => this.close())
  }

  private renderSection(
    container: HTMLElement,
    title: string,
    items: string[],
    className: string,
    hint?: string
  ) {
    const section = container.createDiv({ cls: `summary-section ${className}` })

    const header = section.createDiv({ cls: 'section-header' })
    const titleEl = header.createEl('h3', { text: `${title} (${items.length})` })
    if (hint) {
      header.createEl('div', { cls: 'section-hint', text: hint })
    }

    const list = section.createEl('ul', { cls: 'summary-list' })
    for (const item of items) {
      const li = list.createEl('li')

      // 如果是 vault 路径（包含 .md），创建可点击链接
      if (item.endsWith('.md')) {
        const link = li.createEl('a', {
          text: this.getDisplayName(item),
          href: '#',
          cls: 'internal-link'
        })
        link.addEventListener('click', (e) => {
          e.preventDefault()
          this.onOpenNote(item)
          this.close()
        })
      } else {
        // 已删除的文件（只有 slug，没有 vault 路径）
        li.setText(item)
      }
    }
  }

  private getDisplayName(path: string): string {
    // 提取文件名，去掉扩展名
    const basename = path.split('/').pop() || path
    return basename.replace(/\.md$/, '')
  }

  onClose() {
    this.contentEl.empty()
  }
}
