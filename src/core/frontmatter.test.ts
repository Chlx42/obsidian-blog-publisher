import { describe, expect, test } from 'bun:test'

import { descriptionExcerpt, missingBlogDefaults } from './frontmatter'

describe('missingBlogDefaults', () => {
  const file = { basename: '读书笔记', created: new Date(2026, 0, 5, 10, 30) }

  test('全缺时补齐六个字段，publish 直接 true、先进草稿箱', () => {
    expect(missingBlogDefaults(undefined, file, '第一段')).toEqual({
      publish: true,
      draft: true,
      title: '读书笔记',
      description: '第一段',
      publishDate: '2026-01-05',
      tags: []
    })
  })

  test('只补缺失键，用户写过的内容一律不动', () => {
    const missing = missingBlogDefaults({ publish: false, title: '我的标题' }, file, '草稿')
    expect(missing).toEqual({
      draft: true,
      description: '草稿',
      publishDate: '2026-01-05',
      tags: []
    })
  })

  test('description 没有草稿来源时补空串占位', () => {
    const missing = missingBlogDefaults({}, file)
    expect(missing).toMatchObject({ description: '' })
  })

  test('字段齐备时返回 null', () => {
    const complete = {
      publish: false,
      draft: false,
      title: 't',
      description: 'd',
      publishDate: '2026-01-01',
      tags: []
    }
    expect(missingBlogDefaults(complete, file)).toBeNull()
  })
})

describe('descriptionExcerpt', () => {
  test('跳过 frontmatter，取第一行有效文本', () => {
    expect(descriptionExcerpt('---\ntitle: x\n---\n\n\n这是第一段正文。\n第二段。\n')).toBe(
      '这是第一段正文。'
    )
  })

  test('WikiLink 取别名，没有别名时取目标名', () => {
    expect(descriptionExcerpt('见[[其他笔记|别名]]的说明')).toBe('见别名的说明')
    expect(descriptionExcerpt('见[[其他笔记]]的说明')).toBe('见其他笔记的说明')
  })

  test('嵌入整个移除，Markdown 链接只留文字', () => {
    expect(descriptionExcerpt('![[pic.png]]开头有图')).toBe('开头有图')
    expect(descriptionExcerpt('看[这篇文章](https://example.com)再说')).toBe('看这篇文章再说')
  })

  test('去掉标题标记和行内强调符号', () => {
    expect(descriptionExcerpt('# 大标题')).toBe('大标题')
    expect(descriptionExcerpt('**加粗** 和 `代码`')).toBe('加粗 和 代码')
  })

  test('超过 160 字截断并以省略号收尾', () => {
    const long = '字'.repeat(200)
    const excerpt = descriptionExcerpt(long)
    expect(excerpt.length).toBe(160)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  test('没有有效内容时返回空串', () => {
    expect(descriptionExcerpt('---\ntitle: x\n---\n\n\n')).toBe('')
    expect(descriptionExcerpt('')).toBe('')
  })
})
