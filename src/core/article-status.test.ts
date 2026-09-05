import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import {
  inspectArticle,
  loadValidator,
  loadValidatorResult,
  type LiveEntry,
  type Validator
} from './article-status'

const validArticle = {
  publish: true,
  title: '标题',
  description: '摘要',
  publishDate: '2026-08-18',
  tags: ['技术'],
  draft: false
}

const liveEntry: LiveEntry = { slug: 'biao-ti', mtime: 1000 }

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
    expect(inspectArticle({ publish: false }).code).toBe('unpublished')
  })

  test('publish 为 true 但没推送记录时是待发布', () => {
    const status = inspectArticle(validArticle)
    expect(status.code).toBe('pending')
    expect(status.modified).toBeUndefined()
  })

  test('推送记录的 mtime 与文件一致时是已上线，并带上 slug', () => {
    const status = inspectArticle(validArticle, null, liveEntry, 1000)
    expect(status.code).toBe('live')
    expect(status.slug).toBe('biao-ti')
    expect(status.issues).toEqual([])
  })

  test('上线后文件改过就回到待发布，并标记有修改', () => {
    const status = inspectArticle(validArticle, null, liveEntry, 2000)
    expect(status.code).toBe('pending')
    expect(status.modified).toBe(true)
    expect(status.slug).toBe('biao-ti')
  })

  test('没有校验器时不检查业务字段', () => {
    expect(inspectArticle({ ...validArticle, description: '' }).code).toBe('pending')
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

  test('draft 优先于线上状态：草稿不会显示成已上线', () => {
    expect(inspectArticle({ ...validArticle, draft: true }, null, liveEntry, 1000).code).toBe(
      'draft'
    )
  })

  test('字段齐全且已推送时是已上线', () => {
    expect(inspectArticle(validArticle, requireDescription, liveEntry, 1000).code).toBe('live')
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

describe('loadValidatorResult', () => {
  test('路径留空时不算错误', () => {
    expect(loadValidatorResult('')).toEqual({ validator: null, error: null })
    expect(loadValidatorResult('   ')).toEqual({ validator: null, error: null })
  })

  test('文件不存在时回报原因', () => {
    const result = loadValidatorResult('/nonexistent/validator.js')
    expect(result.validator).toBeNull()
    expect(result.error).toBe('找不到这个文件')
  })

  test('文件没导出函数时回报原因', () => {
    const result = loadValidatorResult(join(import.meta.dir, 'article-status.ts'))
    expect(result.validator).toBeNull()
    expect(result.error).toBe('文件没有导出 collectArticleIssues 函数')
  })

  test('导出 collectArticleIssues 时加载成功', () => {
    const result = loadValidatorResult(join(import.meta.dir, '../validators/astro.ts'))
    expect(result.error).toBeNull()
    expect(typeof result.validator).toBe('function')
    expect(result.validator?.({ publish: true })).not.toHaveLength(0)
  })
})
