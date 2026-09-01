#!/usr/bin/env node
/**
 * Obsidian → Hexo 同步脚本。
 *
 * Hexo 自带 generate / deploy，所以这里只负责把 vault 的笔记同步到
 * source/_posts/，构建和部署交给 Hexo 自己的命令。
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'

const RESULT_LINE_PREFIX = process.env.BLOG_RESULT_PREFIX ?? '__BLOG_RESULT__'

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), '..')
const outputDir = join(repositoryRoot, 'source/_posts')
const manifestPath = join(repositoryRoot, '.blog-sync-manifest.json')

function loadPaths() {
  const vaultRoot = process.env.BLOG_VAULT_ROOT?.trim()
  if (!vaultRoot) {
    throw new Error('缺少 BLOG_VAULT_ROOT。插件会自动传入；手动运行时请自己 export。')
  }
  const articlesFolder = (process.env.BLOG_ARTICLES_FOLDER?.trim() || 'blog').replace(
    /^\/+|\/+$/g,
    ''
  )
  return { vaultRoot, sourceDir: join(vaultRoot, articlesFolder) }
}

/** 极简 YAML frontmatter 解析，只处理 key: value 和 [a, b] 数组。 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { frontmatter: {}, body: raw }

  const frontmatter = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    const [, key, rawValue] = kv
    const value = rawValue.trim()
    if (value === 'true' || value === 'false') {
      frontmatter[key] = value === 'true'
    } else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, '')
    }
  }
  return { frontmatter, body: raw.slice(match[0].length) }
}

/** Hexo 的 tags/categories 用 YAML 列表写法更稳，避免主题解析差异。 */
function toHexoFrontmatter(frontmatter, title) {
  const lines = [`title: ${JSON.stringify(title)}`]
  if (frontmatter.publishDate) lines.push(`date: ${JSON.stringify(frontmatter.publishDate)}`)
  if (frontmatter.description) lines.push(`excerpt: ${JSON.stringify(frontmatter.description)}`)
  if (frontmatter.tags?.length) {
    lines.push('tags:')
    for (const tag of frontmatter.tags) lines.push(`  - ${JSON.stringify(tag)}`)
  }
  // Hexo 没有 draft 字段，草稿靠 source/_drafts/ 目录区分。
  if (frontmatter.draft === true) lines.push('published: false')
  return lines.join('\n')
}

function slugify(title, fallback) {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!ascii || /[一-龥]/.test(ascii)) return fallback
  return ascii
}

async function collectNotes(sourceDir) {
  const notes = []
  async function walk(dir) {
    let dirents
    try {
      dirents = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    for (const dirent of dirents) {
      const full = join(dir, dirent.name)
      if (dirent.isDirectory()) await walk(full)
      else if (extname(dirent.name) === '.md') notes.push(full)
    }
  }
  await walk(sourceDir)
  return notes.sort()
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    return { entries: {} }
  }
}

async function sync() {
  const { vaultRoot, sourceDir } = loadPaths()
  const previous = await readManifest()
  const manifest = { entries: {} }
  const published = []
  const removed = []
  const slugs = {}

  await mkdir(outputDir, { recursive: true })

  for (const absolutePath of await collectNotes(sourceDir)) {
    const raw = await readFile(absolutePath, 'utf8')
    const { frontmatter, body } = parseFrontmatter(raw)
    if (frontmatter.publish !== true) continue

    const vaultPath = relative(vaultRoot, absolutePath)
    const basename = absolutePath.split('/').pop().replace(/\.md$/, '')
    const title = frontmatter.title?.trim() || basename
    const slug = slugify(title, `post-${Buffer.from(vaultPath).toString('hex').slice(0, 12)}`)

    const output = `---\n${toHexoFrontmatter(frontmatter, title)}\n---\n\n${body.trimStart()}`
    await writeFile(join(outputDir, `${slug}.md`), output, 'utf8')

    // 改了 title 就会换 slug，旧文件不清理会让站点里出现两篇重复文章。
    const previousEntry = previous.entries?.[vaultPath]
    if (previousEntry && previousEntry.slug !== slug) {
      const stale = join(outputDir, `${previousEntry.slug}.md`)
      if (existsSync(stale)) await rm(stale)
      removed.push(previousEntry.slug)
    }

    manifest.entries[vaultPath] = { slug }
    published.push(vaultPath)
    slugs[vaultPath] = slug
  }

  // 上次同步过、这次不在了的（删除或取消发布），从 _posts/ 删掉。
  for (const [vaultPath, entry] of Object.entries(previous.entries ?? {})) {
    if (manifest.entries[vaultPath]) continue
    const stale = join(outputDir, `${entry.slug}.md`)
    if (existsSync(stale)) await rm(stale)
    removed.push(entry.slug)
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  return { initialized: [], published, removed, slugs }
}

try {
  const result = await sync()
  console.log(`已同步 ${result.published.length} 篇，移除 ${result.removed.length} 篇`)
  console.log(`${RESULT_LINE_PREFIX}${JSON.stringify(result)}`)
} catch (error) {
  console.error(`同步失败: ${error.message}`)
  process.exit(1)
}
