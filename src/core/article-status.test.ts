import { describe, expect, test } from 'bun:test'

import { inspectArticle, loadValidator, type Validator } from './article-status'

const validArticle = {
  publish: true,
  title: '标题',
  description: '摘要',
  publishDate: '2026-08-18',
  tags: ['技术'],
  draft: false
}

/** 只要 description 为空就报错，用来验证校验器确实被调用。 */
const requireDescription: Validator = (frontmatter) =>
  typeof frontmatter.description === 'string' && frontmatter.description.trim()
    ? []
    : ['description 不能为空']

describe('inspectArticle', () => {
  test('没有 frontmatter 时是未初始化', () => {
    expect(inspectArticle().code).toBe('uninitialized')
  })

  test('publish 不是 true 时不会同步', () => {
    expect(inspectArticle({ publish: false }).code).toBe('not-published')
  })

  test('没有校验器时不检查业务字段', () => {
    expect(inspectArticle({ ...validArticle, description: '' }).code).toBe('ready')
  })

  test('校验器报错时是需检查，并带上原始 issues', () => {
    const status = inspectArticle({ ...validArticle, description: '' }, requireDescription)
    expect(status.code).toBe('invalid')
    expect(status.label).toBe('文章：需检查')
    expect(status.issues).toEqual(['description 不能为空'])
  })

  test('校验器通过后才看 draft', () => {
    const status = inspectArticle({ ...validArticle, draft: true }, requireDescription)
    expect(status.code).toBe('draft')
  })

  test('draft 为 true 时是草稿', () => {
    expect(inspectArticle({ ...validArticle, draft: true }).code).toBe('draft')
  })

  test('字段齐全时可发布', () => {
    expect(inspectArticle(validArticle).code).toBe('ready')
    expect(inspectArticle(validArticle, requireDescription).code).toBe('ready')
  })
})

describe('loadValidator', () => {
  test('路径留空时返回 null', async () => {
    expect(await loadValidator('')).toBeNull()
    expect(await loadValidator('   ')).toBeNull()
  })

  test('路径加载失败时降级为 null 而不是抛错', async () => {
    expect(await loadValidator('/nonexistent/validator.js')).toBeNull()
  })
})
