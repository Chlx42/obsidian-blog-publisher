import { describe, expect, test } from 'bun:test'

import { DEFAULT_SETTINGS, type BlogPublisherSettings } from '../types'
import { classifyLine, detectRuntime } from './runtime'

function settingsWith(overrides: Partial<BlogPublisherSettings>): BlogPublisherSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

describe('classifyLine', () => {
  test('git 和包管理器的进度输出不算错误', () => {
    const progress = [
      '来自 github.com:Chlx42/my-blog',
      ' * branch            main       -> FETCH_HEAD',
      '$ bun run scripts/blog/cli.ts publish',
      '已同步文章: 1 篇',
      '12:00:00 [build] 59 page(s) built in 20.47s'
    ]
    for (const line of progress) expect(classifyLine(line)).toBe('info')
  })

  test('真正的失败行标成错误', () => {
    const failures = [
      '发布失败: 本地 main 存在尚未推送的非博客提交，请先单独推送这些提交',
      '命令执行失败 (1)',
      'error: script "build" exited with code 1',
      'fatal: not a git repository',
      'Error: Cannot find module'
    ]
    for (const line of failures) expect(classifyLine(line)).toBe('error')
  })
})

describe('detectRuntime', () => {
  test('custom 留空时返回 null', () => {
    const runtime = detectRuntime(
      settingsWith({ runtime: 'custom', customRuntimePath: '   ' })
    )
    expect(runtime).toBeNull()
  })

  test('custom 指向不存在的路径时返回 null', () => {
    const runtime = detectRuntime(
      settingsWith({ runtime: 'custom', customRuntimePath: '/nonexistent/bin/foo' })
    )
    expect(runtime).toBeNull()
  })

  test('custom 指向真实文件时用 basename 作为标签', () => {
    const runtime = detectRuntime(
      settingsWith({ runtime: 'custom', customRuntimePath: '/bin/sh' })
    )
    expect(runtime).toEqual({ type: 'custom', executable: '/bin/sh', label: 'sh' })
  })

  test('探测到的运行时一定是绝对路径', () => {
    const runtime = detectRuntime(settingsWith({ runtime: 'bun' }))
    // CI 上可能一个包管理器都没装，探测不到属于合法结果。
    if (runtime) expect(runtime.executable.startsWith('/')).toBe(true)
  })
})
