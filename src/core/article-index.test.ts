import { describe, expect, test } from 'bun:test'

import type { VaultNote } from '../types'
import { buildArticleIndex, hasPushableWork } from './article-index'

function note(path: string, frontmatter?: Record<string, unknown>, mtime = 1): VaultNote {
  const basename = path.split('/').pop() ?? path
  return { path, basename: basename.replace(/\.md$/, ''), frontmatter, mtime }
}

describe('hasPushableWork', () => {
  test('有待发布文章时有活可干', () => {
    const index = buildArticleIndex([note('blog/a.md', { publish: true })])
    expect(hasPushableWork(index)).toBe(true)
  })

  test('隐藏的文章若站点上还有旧文件，也算有活可干', () => {
    const index = buildArticleIndex(
      [note('blog/a.md', { publish: false })],
      null,
      { 'blog/a.md': { slug: 'a', mtime: 1 } }
    )
    expect(hasPushableWork(index)).toBe(true)
  })

  test('只有草稿或没上线过的隐藏文章时没活可干', () => {
    const index = buildArticleIndex([
      note('blog/a.md', { publish: true, draft: true }),
      note('blog/b.md', { publish: false })
    ])
    expect(hasPushableWork(index)).toBe(false)
  })

  test('索引还没建好或没有笔记时没活可干', () => {
    expect(hasPushableWork(null)).toBe(false)
    expect(hasPushableWork(buildArticleIndex([]))).toBe(false)
  })
})

describe('目录外笔记的推送记录关联', () => {
  test('目录外笔记通过 ../ 前缀的 source key 关联已上线状态', () => {
    const index = buildArticleIndex(
      [note('其他/读书笔记.md', { publish: true })],
      null,
      { '../其他/读书笔记.md': { slug: 'du-shu-bi-ji', mtime: 1 } },
      'blog'
    )
    expect(index.groups[0].code).toBe('live')
  })

  test('目录内笔记仍按目录相对路径关联', () => {
    const index = buildArticleIndex(
      [note('blog/a.md', { publish: true })],
      null,
      { 'a.md': { slug: 'a', mtime: 1 } },
      'blog'
    )
    expect(index.groups[0].code).toBe('live')
  })
})
