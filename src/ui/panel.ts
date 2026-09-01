import { ItemView, type WorkspaceLeaf } from 'obsidian'

import type { BlogStore } from '../core/store'
import {
  STATE_LABELS,
  isBusy,
  type ArticleGroup,
  type BlogState,
  type SyncSummary
} from '../types'

export const BLOG_PANEL_VIEW_TYPE = 'blog-publisher-panel'

export interface PanelActions {
  togglePreview: () => void
  publish: () => void
  openLogs: () => void
  openPath: (path: string) => void
  isPreviewing: () => boolean
  togglePublish: (path: string) => void
  toggleDraft: (path: string) => void
  copyUrl: (path: string, slug: string) => void
}

/**
 * 侧边面板。三个区域全部由一次 store.subscribe 驱动重绘：
 * 文章量在几十篇量级，整块重建的成本可以忽略，不值得引入 diff。
 */
export class BlogPanelView extends ItemView {
  private collapsed = new Set<string>()

  constructor(
    leaf: WorkspaceLeaf,
    private store: BlogStore,
    private actions: PanelActions
  ) {
    super(leaf)
  }

  getViewType() {
    return BLOG_PANEL_VIEW_TYPE
  }

  getDisplayText() {
    return '博客发布'
  }

  getIcon() {
    return 'upload-cloud'
  }

  protected async onOpen() {
    this.contentEl.addClass('blog-publisher-panel')
    this.register(this.store.subscribe(() => this.render()))
    this.render()
  }

  protected async onClose() {
    this.contentEl.empty()
  }

  render() {
    const state = this.store.getState()
    this.contentEl.empty()
    this.renderTask(state)
    if (state.lastResult) this.renderResult(state.lastResult)
    this.renderArticles(state)
  }

  private renderTask(state: BlogState) {
    const section = this.contentEl.createDiv({ cls: 'blog-publisher-section' })
    const header = section.createDiv({ cls: 'blog-publisher-task-header' })
    header.createSpan({ cls: 'blog-publisher-task-label', text: STATE_LABELS[state.task] })
    header
      .createEl('button', { cls: 'blog-publisher-link-button', text: '日志' })
      .addEventListener('click', () => this.actions.openLogs())

    const busy = isBusy(state.task)
    if (busy) section.createDiv({ cls: 'blog-publisher-progress' })

    if (state.previewUrl) {
      const link = section.createEl('a', {
        cls: 'blog-publisher-preview-url',
        text: state.previewUrl,
        href: state.previewUrl
      })
      link.setAttr('target', '_blank')
    }

    const buttons = section.createDiv({ cls: 'blog-publisher-buttons' })
    const previewing = this.actions.isPreviewing()
    const previewButton = buttons.createEl('button', {
      cls: 'blog-publisher-button',
      text: previewing ? '停止预览' : '本地预览'
    })
    previewButton.classList.toggle('is-active', previewing)
    previewButton.disabled = busy
    previewButton.addEventListener('click', () => this.actions.togglePreview())

    const publishButton = buttons.createEl('button', {
      cls: 'blog-publisher-button mod-cta',
      text: '一键发布'
    })
    publishButton.disabled = busy
    publishButton.addEventListener('click', () => this.actions.publish())
  }

  private renderResult(result: SyncSummary) {
    const section = this.contentEl.createDiv({ cls: 'blog-publisher-section' })
    section.createDiv({ cls: 'blog-publisher-section-title', text: '上次同步' })

    const stats = section.createDiv({ cls: 'blog-publisher-stats' })
    const cards: [string, number][] = [
      ['同步', result.published.length],
      ['下线', result.removed.length],
      ['补齐模板', result.initialized.length]
    ]
    for (const [label, value] of cards) {
      const card = stats.createDiv({ cls: 'blog-publisher-stat' })
      card.createDiv({ cls: 'blog-publisher-stat-value', text: String(value) })
      card.createDiv({ cls: 'blog-publisher-stat-label', text: label })
    }

    const details: [string, string[]][] = [
      ['同步', result.published],
      ['下线', result.removed],
      ['补齐模板', result.initialized]
    ]
    for (const [label, items] of details) {
      if (!items.length) continue
      const list = section.createEl('ul', { cls: 'blog-publisher-result-list' })
      for (const item of items) {
        list.createEl('li', { text: `${label}：${item}` })
      }
    }
  }

  private renderArticles(state: BlogState) {
    const section = this.contentEl.createDiv({ cls: 'blog-publisher-section' })
    const index = state.articles

    if (!index || !index.total) {
      section.createDiv({ cls: 'blog-publisher-section-title', text: '文章' })
      section.createDiv({
        cls: 'blog-publisher-empty',
        text: index ? '文章目录里还没有 Markdown 笔记' : '正在读取文章目录…'
      })
      return
    }

    section.createDiv({
      cls: 'blog-publisher-section-title',
      text: `文章（${index.total}）`
    })
    for (const group of index.groups) this.renderGroup(section, group)
  }

  private renderGroup(parent: HTMLElement, group: ArticleGroup) {
    const isCollapsed = this.collapsed.has(group.code)
    const wrapper = parent.createDiv({ cls: 'blog-publisher-group' })

    const header = wrapper.createDiv({ cls: 'blog-publisher-group-header' })
    header.setAttr('data-status', group.code)
    header.createSpan({
      cls: 'blog-publisher-group-caret',
      text: isCollapsed ? '▸' : '▾'
    })
    header.createSpan({ cls: 'blog-publisher-group-label', text: group.label })
    header.createSpan({ cls: 'blog-publisher-group-count', text: String(group.items.length) })
    header.addEventListener('click', () => {
      if (isCollapsed) this.collapsed.delete(group.code)
      else this.collapsed.add(group.code)
      this.render()
    })

    if (isCollapsed) return

    for (const entry of group.items) {
      const row = wrapper.createDiv({ cls: 'blog-publisher-article' })
      row.setAttr('data-status', entry.status.code)

      const titleArea = row.createDiv({ cls: 'blog-publisher-article-main' })
      titleArea.createDiv({ cls: 'blog-publisher-article-title', text: entry.title })
      // 只有需要动手的才显示原因，其它状态标题本身已经说明问题。
      if (entry.status.code === 'invalid' && entry.status.issues.length) {
        titleArea.createDiv({ cls: 'blog-publisher-article-issue', text: entry.status.issues[0] })
      }
      titleArea.addEventListener('click', () => this.actions.openPath(entry.path))

      const actions = row.createDiv({ cls: 'blog-publisher-article-actions' })

      const publish = entry.frontmatter?.publish === true
      const draft = entry.frontmatter?.draft === true

      const publishBtn = actions.createEl('button', {
        text: publish ? '隐藏' : '发布',
        cls: 'blog-publisher-action-btn'
      })
      publishBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.actions.togglePublish(entry.path)
      })

      if (publish) {
        const draftBtn = actions.createEl('button', {
          text: draft ? '上线' : '草稿',
          cls: 'blog-publisher-action-btn'
        })
        draftBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.actions.toggleDraft(entry.path)
        })

        const slug = this.store.getState().lastResult?.slugs[entry.path]
        if (slug) {
          const copyBtn = actions.createEl('button', {
            text: '📋',
            cls: 'blog-publisher-action-btn',
            attr: { title: '复制博客地址' }
          })
          copyBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            this.actions.copyUrl(entry.path, slug)
          })
        }
      }
    }
  }
}
