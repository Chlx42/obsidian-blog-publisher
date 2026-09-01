#!/usr/bin/env node
/**
 * Obsidian → Jekyll 同步脚本。
 *
 * Jekyll 用 _posts/ 目录和文件名约定 (YYYY-MM-DD-slug.md)，同步脚本需要
 * 从 publishDate 里提取日期、拼进文件名。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'

const RESULT_LINE_PREFIX = process.env.BLOG_RESULT_PREFIX ?? '__BLOG_RESULT__'

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), '..')
const outputDir = join(repositoryRoot, '_posts')
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

function toYaml(value) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
  if (typeof value === 'boolean') return String(value)
  return JSON.stringify(String(value))
}

function slugify(title, fallback) {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!ascii || /[一-龥]/.test(ascii)) return fallback
  return ascii
}

/** Jekyll 的 _posts/ 要求文件名格式 YYYY-MM-DD-slug.md */
function toJekyllFrontmatter(frontmatter, title) {
  const out = { title, layout: 'post' }
  if (frontmatter.publishDate) out.date = frontmatter.publishDate
  if (frontmatter.description) out.description = frontmatter.description
  if (frontmatter.tags?.length) out.tags = frontmatter.tags
  if (frontmatter.heroImage) out.image = frontmatter.heroImage
  // Jekyll 的 published: false 等同于 draft
  if (frontmatter.draft === true) out.published = false
  return out
}

/** publishDate 解析成 YYYY-MM-DD，缺失时用当前日期。 */
function extractDate(publishDate) {
  if (!publishDate) {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
  const match = publishDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : publishDate.slice(0, 10)
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
    const datePrefix = extractDate(frontmatter.publishDate)
    const filename = `${datePrefix}-${slug}.md`

    const jekyllFrontmatter = toJekyllFrontmatter(frontmatter, title)
    const lines = Object.entries(jekyllFrontmatter).map(([key, value]) => `${key}: ${toYaml(value)}`)
    const output = `---\n${lines.join('\n')}\n---\n\n${body.trimStart()}`
    await writeFile(join(outputDir, filename), output, 'utf8')

    // 改 title 换 slug、改 publishDate 换日期前缀，两种都会产生新文件名。
    // 不清理旧文件的话，站点里会出现两篇重复文章。
    const previousEntry = previous.entries?.[vaultPath]
    if (previousEntry && previousEntry.filename !== filename) {
      const stale = join(outputDir, previousEntry.filename)
      if (existsSync(stale)) await rm(stale)
      removed.push(previousEntry.slug)
    }

    manifest.entries[vaultPath] = { slug, filename }
    published.push(vaultPath)
    slugs[vaultPath] = slug
  }

  // 上次同步过、这次不在了的（删除或取消发布），从 _posts/ 删掉。
  for (const [vaultPath, entry] of Object.entries(previous.entries ?? {})) {
    if (manifest.entries[vaultPath]) continue
    const stale = join(outputDir, entry.filename)
    if (existsSync(stale)) await rm(stale)
    removed.push(entry.slug)
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  return { initialized: [], published, removed, slugs }
}

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0 || allowFailure) resolvePromise(code)
      else reject(new Error(`${command} 退出码 ${code}`))
    })
  })
}

async function commitIfChanged(message) {
  await run('git', ['add', '-A'])
  const code = await run('git', ['commit', '-m', message], { allowFailure: true })
  if (code !== 0) {
    console.log('没有需要提交的改动，跳过 commit')
    return false
  }
  return true
}

const command = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? 'sync'

try {
  const result = await sync()
  console.log(`已同步 ${result.published.length} 篇，移除 ${result.removed.length} 篇`)

  if (command === 'build') await run('bundle', ['exec', 'jekyll', 'build'])
  if (command === 'publish') {
    await run('bundle', ['exec', 'jekyll', 'build'])
    const committed = await commitIfChanged(`blog: 同步 ${result.published.length} 篇文章`)
    if (committed) await run('git', ['push'])
  }

  console.log(`${RESULT_LINE_PREFIX}${JSON.stringify(result)}`)
} catch (error) {
  console.error(`同步失败: ${error.message}`)
  process.exit(1)
}
