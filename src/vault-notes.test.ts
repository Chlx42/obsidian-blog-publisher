import { describe, expect, test } from 'bun:test'
import type { App, TFile } from 'obsidian'

import { VaultNotes } from './vault-notes'

/** VaultNotes 只用到 metadataCache，测试里用假缓存代替。 */
function fakeApp(frontmatters: Record<string, Record<string, unknown>>): App {
  return {
    metadataCache: {
      getFileCache: (file: TFile) => {
        const frontmatter = frontmatters[file.path]
        return frontmatter ? { frontmatter } : undefined
      }
    }
  } as unknown as App
}

function note(path: string, extension = 'md'): TFile {
  return {
    path,
    extension,
    basename: '笔记',
    stat: { mtime: 0 }
  } as unknown as TFile
}

function notesFor(folder: string, frontmatters: Record<string, Record<string, unknown>>) {
  return new VaultNotes(fakeApp(frontmatters), () => folder)
}

describe('isBlogNote 范围', () => {
  const frontmatters = {
    '其他/已标记.md': { publish: true },
    '其他/未标记.md': { publish: false },
    '其他/普通.md': { title: '普通笔记' }
  }

  test('文章目录内的 md 都是博客文章', () => {
    const notes = notesFor('博客', frontmatters)
    expect(notes.isBlogNote(note('博客/Hello.md'))).toBe(true)
    expect(notes.isBlogNote(note('博客/子目录/Hello.md'))).toBe(true)
  })

  test('目录外显式标记 publish: true 的 md 也是博客文章', () => {
    const notes = notesFor('博客', frontmatters)
    expect(notes.isBlogNote(note('其他/已标记.md'))).toBe(true)
  })

  test('目录外没标记或 publish 不是 true 的不算', () => {
    const notes = notesFor('博客', frontmatters)
    expect(notes.isBlogNote(note('其他/未标记.md'))).toBe(false)
    expect(notes.isBlogNote(note('其他/普通.md'))).toBe(false)
    expect(notes.isBlogNote(note('其他/纯文本.md'))).toBe(false)
  })

  test('文章目录留空时只认标记过的笔记', () => {
    const notes = notesFor('', frontmatters)
    expect(notes.isBlogNote(note('其他/已标记.md'))).toBe(true)
    expect(notes.isBlogNote(note('其他/普通.md'))).toBe(false)
  })

  test('非 md 文件永远不算', () => {
    const notes = notesFor('博客', frontmatters)
    expect(notes.isBlogNote(note('博客/pic.png', 'png'))).toBe(false)
  })
})
