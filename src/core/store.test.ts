import { describe, expect, test } from 'bun:test'

import { BlogStore, MAX_LOG_LINES } from './store'

describe('BlogStore', () => {
  test('多个订阅者都收到通知', () => {
    const store = new BlogStore()
    let first = 0
    let second = 0
    store.subscribe(() => (first += 1))
    store.subscribe(() => (second += 1))

    store.setTask('syncing')

    expect(first).toBe(1)
    expect(second).toBe(1)
    expect(store.getState().task).toBe('syncing')
  })

  test('退订后不再收到通知', () => {
    const store = new BlogStore()
    let calls = 0
    const unsubscribe = store.subscribe(() => (calls += 1))

    store.setTask('building')
    unsubscribe()
    store.setTask('idle')

    expect(calls).toBe(1)
  })

  test('日志带上产生时的阶段', () => {
    const store = new BlogStore()
    store.setTask('publishing')
    store.appendLog('推送中', 'info')

    expect(store.getState().logs[0]).toEqual({
      text: '推送中',
      level: 'info',
      stage: 'publishing'
    })
  })

  test('日志超过上限时只保留尾部', () => {
    const store = new BlogStore()
    for (let i = 0; i < MAX_LOG_LINES + 50; i += 1) store.appendLog(`line ${i}`, 'info')

    const { logs } = store.getState()
    expect(logs.length).toBe(MAX_LOG_LINES)
    expect(logs[logs.length - 1].text).toBe(`line ${MAX_LOG_LINES + 49}`)
  })

  test('清空日志不影响其它状态', () => {
    const store = new BlogStore()
    store.setTask('previewing')
    store.appendLog('x', 'error')
    store.clearLogs()

    expect(store.getState().logs).toEqual([])
    expect(store.getState().task).toBe('previewing')
  })
})
