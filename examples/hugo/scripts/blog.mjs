#!/usr/bin/env node
/**
 * Obsidian → Hugo 同步脚本。
 *
 * 只依赖 Node 标准库，把 vault 里 publish: true 的笔记转成 Hugo 的
 * content/posts/<slug>.md。frontmatter 字段名不一样，需要映射。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'

const RESULT_LINE_PREFIX = process.env.BLOG_RESULT_PREFIX ?? '__BLOG_RESULT__'

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), '..')
const outputDir = join(repositoryRoot, 'content/posts')
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

function toYaml(value) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
  if (typeof value === 'boolean') return String(value)
  return JSON.stringify(String(value))
}

/** 中文标题没有音译库时退化成拼接时间戳，保证 slug 唯一且是 ASCII。 */
function slugify(title, fallback) {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const hasCjk = /[一-龥]/.test(ascii)
  if (!ascii || hasCjk) return fallback
  return ascii
}

/** Obsidian 的字段名 → Hugo 的字段名。 */
function toHugoFrontmatter(frontmatter, title) {
  const out = { title }
  if (frontmatter.publishDate) out.date = frontmatter.publishDate
  if (frontmatter.description) out.description = frontmatter.description
  if (frontmatter.tags?.length) out.tags = frontmatter.tags
  if (frontmatter.heroImage) out.featured_image = frontmatter.heroImage
  out.draft = frontmatter.draft === true
  return out
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
    const vaultPath = relative(vaultRoot, absolutePath)
    if (frontmatter.publish !== true) continue

    const basename = absolutePath.split('/').pop().replace(/\.md$/, '')
    const title = frontmatter.title?.trim() || basename
    const slug = slugify(title, `post-${Buffer.from(vaultPath).toString('hex').slice(0, 12)}`)
    const hugoFrontmatter = toHugoFrontmatter(frontmatter, title)

    const lines = Object.entries(hugoFrontmatter).map(([key, value]) => `${key}: ${toYaml(value)}`)
    const output = `---\n${lines.join('\n')}\n---\n\n${body.trimStart()}`
    await writeFile(join(outputDir, `${slug}.md`), output, 'utf8')

    manifest.entries[vaultPath] = { slug }
    published.push(vaultPath)
    slugs[vaultPath] = slug
  }

  // 上次同步过、这次不在了的，从 content/ 删掉。
  for (const [vaultPath, entry] of Object.entries(previous.entries ?? {})) {
    if (manifest.entries[vaultPath]) continue
    const stale = join(outputDir, `${entry.slug}.md`)
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

/** 没有改动时 git commit 会返回 1，这不算失败。 */
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

  if (command === 'build') await run('hugo', ['--minify'])
  if (command === 'publish') {
    await run('hugo', ['--minify'])
    const committed = await commitIfChanged(`blog: 同步 ${result.published.length} 篇文章`)
    if (committed) await run('git', ['push'])
  }

  console.log(`${RESULT_LINE_PREFIX}${JSON.stringify(result)}`)
} catch (error) {
  console.error(`同步失败: ${error.message}`)
  process.exit(1)
}
