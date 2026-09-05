import { describe, expect, test } from 'bun:test'

import {
  buildPublishRecord,
  notePathOfSourceKey,
  sourceKeyOfNotePath
} from './publish-record'

describe('路径换算', () => {
  test('配置了文章目录时，source key 是目录内的相对路径', () => {
    expect(sourceKeyOfNotePath('2_Projects/博客/Hello.md', '2_Projects/博客')).toBe('Hello.md')
    expect(notePathOfSourceKey('Hello.md', '2_Projects/博客')).toBe('2_Projects/博客/Hello.md')
  })

  test('文章目录带首尾斜杠也能换算', () => {
    expect(sourceKeyOfNotePath('blog/Hello.md', '/blog/')).toBe('Hello.md')
    expect(notePathOfSourceKey('Hello.md', '/blog/')).toBe('blog/Hello.md')
  })

  test('目录外的笔记用 ../ 前缀的 source key', () => {
    expect(sourceKeyOfNotePath('其他/Hello.md', '2_Projects/博客')).toBe('../其他/Hello.md')
    expect(notePathOfSourceKey('../其他/Hello.md', '2_Projects/博客')).toBe('其他/Hello.md')
  })

  test('目录外笔记的换算互为逆操作', () => {
    const notePath = '1_Areas/读书笔记/Hello.md'
    expect(notePathOfSourceKey(sourceKeyOfNotePath(notePath, '2_Projects/博客')!, '2_Projects/博客')).toBe(
      notePath
    )
  })

  test('没配置文章目录时两者就是同一个路径', () => {
    expect(sourceKeyOfNotePath('Hello.md', '')).toBe('Hello.md')
    expect(notePathOfSourceKey('Hello.md', '')).toBe('Hello.md')
  })

  test('没配置文章目录时 ../ 开头的 key 仍然还原成 vault 路径', () => {
    expect(notePathOfSourceKey('../其他/Hello.md', '')).toBe('其他/Hello.md')
  })

  test('换算互为逆操作', () => {
    const notePath = '2_Projects/博客/子目录/Hello.md'
    expect(notePathOfSourceKey(sourceKeyOfNotePath(notePath, '2_Projects/博客')!, '2_Projects/博客')).toBe(notePath)
  })
})

describe('buildPublishRecord', () => {
  test('记录每篇已发布文章的 slug 和 mtime', () => {
    const record = buildPublishRecord(
      ['A.md', 'B.md'],
      { 'A.md': 'a', 'B.md': 'b' },
      123,
      (key) => (key === 'A.md' ? 100 : 200)
    )
    expect(record.pushedAt).toBe(123)
    expect(record.sources).toEqual({
      'A.md': { slug: 'a', mtime: 100 },
      'B.md': { slug: 'b', mtime: 200 }
    })
  })

  test('文件读不到或缺 slug 的条目直接跳过，不进记录', () => {
    const record = buildPublishRecord(['A.md', 'B.md', 'C.md'], { 'A.md': 'a', 'B.md': 'b' }, 1, (key) =>
      key === 'C.md' ? 300 : key === 'B.md' ? null : 100
    )
    expect(record.sources).toEqual({ 'A.md': { slug: 'a', mtime: 100 } })
  })

  test('发布列表为空时得到空记录', () => {
    const record = buildPublishRecord([], {}, 1, () => 100)
    expect(record.sources).toEqual({})
  })
})
