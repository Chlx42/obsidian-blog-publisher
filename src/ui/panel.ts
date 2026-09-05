import { ItemView, type WorkspaceLeaf } from 'obsidian'

import type { BlogStore } from '../core/store'
import { hasPushableWork } from '../core/article-index'
import {
  STATE_LABELS,
  isBusy,
  type ArticleEntry,
  type ArticleGroup,
  type BlogState,
  type SyncSummary
} from '../types'

export const BLOG_PANEL_VIEW_TYPE = 'blog-publisher-panel'

/** 列表里展示短名，不带目录和 .md 后缀。 */
function displayNameOf(path: string): string {
  const basename = path.split('/').pop() || path
  return basename.replace(/\.md$/, '')
}

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
  constructor(
    leaf: WorkspaceLeaf,
    private store: BlogStore,
    private actions: PanelActions,
    private getCollapsedGroups: () => string[],
    private setCollapsedGroups: (groups: string[]) => void
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
      cls: 'blog-publisher-button mod-cta'
    })
    publishButton.createSpan({ text: '一键发布' })
    // 待发布计数让「还有多少没上线」一眼可见；这个按钮也是唯一的推送入口。
    const pendingCount = state.articles?.counts.pending ?? 0
    if (pendingCount > 0) {
      publishButton.createSpan({
        cls: 'blog-publisher-publish-count',
        text: String(pendingCount)
      })
    }
    // 没有待发布、也没有等待下线的文章时置灰：推一次只会得到空结果。
    const pushable = hasPushableWork(state.articles)
    publishButton.disabled = busy || !pushable
    if (!pushable && !busy) publishButton.setAttr('title', '没有待发布或待下线的文章')
    publishButton.addEventListener('click', () => this.actions.publish())
  }

  private renderResult(result: SyncSummary) {
    const section = this.contentEl.createDiv({ cls: 'blog-publisher-section' })
    section.createDiv({ cls: 'blog-publisher-section-title', text: '上次同步' })

    // 与摘要弹窗共用一套说法：发布 / 下线 / 补全 frontmatter。
    const changes: [string, string[]][] = [
      ['已发布', result.published],
      ['已下线', result.removed],
      ['补全 frontmatter', result.initialized]
    ]

    if (!changes.some(([, items]) => items.length)) {
      section.createDiv({ cls: 'blog-publisher-empty', text: '没有变更' })
      return
    }

    const chips = section.createDiv({ cls: 'blog-publisher-stat-chips' })
    for (const [label, items] of changes) {
      const chip = chips.createSpan({ cls: 'blog-publisher-stat-chip' })
      if (!items.length) chip.addClass('is-zero')
      chip.createSpan({ cls: 'blog-publisher-stat-label', text: label })
      chip.createSpan({ cls: 'blog-publisher-stat-value', text: String(items.length) })
    }

    for (const [label, items] of changes) {
      if (!items.length) continue
      section.createDiv({
        cls: 'blog-publisher-result-title',
        text: `${label}（${items.length}）`
      })
      const list = section.createEl('ul', { cls: 'blog-publisher-result-list' })
      for (const item of items) {
        const li = list.createEl('li')
        // 下线记录是站点里已删除的旧文件，在 vault 里打不开，所以不可点。
        if (item.endsWith('.md')) {
          const link = li.createEl('a', {
            cls: 'blog-publisher-result-link',
            text: displayNameOf(item),
            href: '#'
          })
          link.addEventListener('click', (e) => {
            e.preventDefault()
            this.actions.openPath(item)
          })
        } else {
          li.setText(item)
        }
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
    const collapsedGroups = this.getCollapsedGroups()
    const isCollapsed = collapsedGroups.includes(group.code)
    const wrapper = parent.createDiv({ cls: 'blog-publisher-group' })

    const header = wrapper.createDiv({ cls: 'blog-publisher-group-header' })
    header.setAttr('data-status', group.code)
    header.createSpan({
      cls: 'blog-publisher-group-caret',
      text: isCollapsed ? '▸' : '▾'
    })
    header.createSpan({ cls: 'blog-publisher-group-dot' })
    header.createSpan({ cls: 'blog-publisher-group-label', text: group.label })
    header.createSpan({ cls: 'blog-publisher-group-count', text: String(group.items.length) })
    header.addEventListener('click', () => {
      const updated = isCollapsed
        ? collapsedGroups.filter(code => code !== group.code)
        : [...collapsedGroups, group.code]
      this.setCollapsedGroups(updated)
      this.render()
    })

    if (isCollapsed) return

    // 待发布组带一句行动指引：这个组唯一要做的事就是上方的一键发布。
    if (group.code === 'pending') {
      wrapper.createDiv({
        cls: 'blog-publisher-group-hint',
        text: '点击上方「一键发布」推送到线上'
      })
    }

    for (const entry of group.items) this.renderArticle(wrapper, entry)
  }

  private renderArticle(wrapper: HTMLElement, entry: ArticleEntry) {
    const row = wrapper.createDiv({ cls: 'blog-publisher-article' })
    row.setAttr('data-status', entry.status.code)

    const titleArea = row.createDiv({ cls: 'blog-publisher-article-main' })
    titleArea.createDiv({ cls: 'blog-publisher-article-title', text: entry.title })
    // 需要动手的才显示原因；已上线/草稿的标题本身已经说明问题。
    if (entry.status.code === 'invalid' && entry.status.issues.length) {
      titleArea.createDiv({ cls: 'blog-publisher-article-issue', text: entry.status.issues[0] })
    } else if (entry.status.issues.length && entry.status.code !== 'live') {
      const note = titleArea.createDiv({ cls: 'blog-publisher-article-note' })
      note.setText(entry.status.issues[0])
      if (entry.status.modified) {
        note.createSpan({ cls: 'blog-publisher-modified-badge', text: '有修改' })
      }
    }
    titleArea.addEventListener('click', () => this.actions.openPath(entry.path))

    const actions = row.createDiv({ cls: 'blog-publisher-article-actions' })
    const publish = entry.frontmatter?.publish === true
    const draft = entry.frontmatter?.draft === true

    // 复制地址：已上线/有修改的记录里有权威 slug。预览中复制的是本地预览链接。
    const slug = entry.status.slug
    if (slug) {
      const state = this.store.getState()
      const previewing = this.actions.isPreviewing()
      actions.createEl('button', {
        text: '📋',
        cls: 'blog-publisher-action-btn',
        attr: {
          title: previewing && state.previewUrl
            ? `复制预览地址 (${state.previewUrl}/blog/${slug})`
            : '复制博客地址'
        }
      }).addEventListener('click', (e) => {
        e.stopPropagation()
        if (previewing && state.previewUrl) {
          void navigator.clipboard.writeText(`${state.previewUrl}/blog/${slug}`)
        } else {
          this.actions.copyUrl(entry.path, slug)
        }
      })
    }

    if (publish) {
      actions.createEl('button', {
        text: draft ? '取消草稿' : '草稿',
        cls: 'blog-publisher-action-btn',
        attr: {
          title: draft ? '取消草稿，转回待发布' : '转为草稿，正式发布时隐藏'
        }
      }).addEventListener('click', (e) => {
        e.stopPropagation()
        this.actions.toggleDraft(entry.path)
      })
    }

    // 已上线且没有修改时不给「发布」类按钮：内容没变就不该再推一次。
    // 这里的「发布」只是把 publish 标成 true，真正的推送是上方的一键发布。
    actions.createEl('button', {
      text: publish ? '隐藏' : '发布',
      cls: 'blog-publisher-action-btn',
      attr: {
        title: publish
          ? '取消发布，下次推送时从博客下线'
          : '标记 publish: true，加入待发布列表'
      }
    }).addEventListener('click', (e) => {
      e.stopPropagation()
      this.actions.togglePublish(entry.path)
    })
  }
}
