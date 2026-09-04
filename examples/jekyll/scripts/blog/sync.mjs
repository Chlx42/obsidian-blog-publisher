#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, renameSync } from 'fs'
import { join, basename } from 'path'
import { execSync } from 'child_process'

const VAULT_ROOT = process.env.BLOG_VAULT_ROOT || ''
const ARTICLES_FOLDER = process.env.BLOG_ARTICLES_FOLDER || ''
const CONTENT_DIR = join(process.cwd(), '_posts')
const MANIFEST_PATH = join(process.cwd(), '.blog-manifest.json')

const command = process.argv[2]
const isJson = process.argv.includes('--json')

function log(message) {
  if (!isJson) console.log(message)
}

function error(message) {
  console.error(message)
  process.exit(1)
}

function outputResult(result) {
  if (isJson) {
    console.log(`__BLOG_RESULT__${JSON.stringify(result)}`)
  }
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return {}
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function saveManifest(manifest) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function formatDatePrefix(dateStr) {
  // Convert ISO date to Jekyll's YYYY-MM-DD format
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function convertFrontmatter(obsidianFm) {
  // Jekyll uses YAML frontmatter
  const jekyllFm = {
    layout: 'post',
    title: obsidianFm.title || 'Untitled',
    date: obsidianFm.publishDate || new Date().toISOString(),
    tags: Array.isArray(obsidianFm.tags) ? obsidianFm.tags : [],
    categories: Array.isArray(obsidianFm.categories) ? obsidianFm.categories : []
  }

  if (obsidianFm.description) jekyllFm.description = obsidianFm.description
  if (obsidianFm.heroImage) jekyllFm.image = obsidianFm.heroImage

  // Jekyll doesn't use draft in frontmatter for published posts
  // (drafts go in _drafts folder without date prefix)

  return jekyllFm
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const frontmatterText = match[1]
  const body = match[2]

  // Simple YAML parser
  const frontmatter = {}
  const lines = frontmatterText.split('\n')
  let currentArray = null

  for (const line of lines) {
    if (line.startsWith('  - ')) {
      if (currentArray) currentArray.push(line.slice(4).trim())
    } else if (line.includes(': ')) {
      const [key, ...valueParts] = line.split(': ')
      const value = valueParts.join(': ').trim()

      if (value === '[]' || !value) {
        frontmatter[key] = []
        currentArray = frontmatter[key]
      } else {
        if (value === 'true') frontmatter[key] = true
        else if (value === 'false') frontmatter[key] = false
        else frontmatter[key] = value
        currentArray = null
      }
    }
  }

  return { frontmatter, body }
}

function sync() {
  if (!VAULT_ROOT || !ARTICLES_FOLDER) {
    error('Missing BLOG_VAULT_ROOT or BLOG_ARTICLES_FOLDER environment variable')
  }

  const vaultArticlesDir = join(VAULT_ROOT, ARTICLES_FOLDER)
  if (!existsSync(vaultArticlesDir)) {
    error(`Articles folder not found: ${vaultArticlesDir}`)
  }

  if (!existsSync(CONTENT_DIR)) {
    mkdirSync(CONTENT_DIR, { recursive: true })
  }

  const oldManifest = loadManifest()
  const newManifest = {}
  const published = []

  log('Syncing articles from Obsidian vault...')

  const files = readdirSync(vaultArticlesDir).filter(f => f.endsWith('.md'))

  for (const file of files) {
    const vaultPath = join(ARTICLES_FOLDER, file)
    const fullPath = join(vaultArticlesDir, file)
    const content = readFileSync(fullPath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(content)

    // Skip unpublished articles
    if (frontmatter.publish !== true) {
      log(`Skipping ${file} (not published)`)
      continue
    }

    // Skip drafts
    if (frontmatter.draft === true) {
      log(`Skipping ${file} (draft)`)
      continue
    }

    const datePrefix = formatDatePrefix(frontmatter.publishDate || new Date().toISOString())
    const slug = generateSlug(frontmatter.title || basename(file, '.md'))

    // Jekyll naming convention: YYYY-MM-DD-slug.md
    const outputFile = `${datePrefix}-${slug}.md`
    const outputPath = join(CONTENT_DIR, outputFile)

    // Convert frontmatter to Jekyll format
    const jekyllFm = convertFrontmatter(frontmatter)

    // Write Jekyll markdown
    const jekyllContent = `---\n${Object.entries(jekyllFm)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          if (value.length === 0) return `${key}: []`
          return `${key}:\n${value.map(v => `  - ${v}`).join('\n')}`
        }
        return `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`
      })
      .join('\n')}\n---\n\n${body}`

    writeFileSync(outputPath, jekyllContent)

    // Check if date prefix changed (user changed publishDate)
    const oldFile = oldManifest[vaultPath]
    if (oldFile && oldFile !== outputFile) {
      const oldPath = join(CONTENT_DIR, oldFile)
      if (existsSync(oldPath)) {
        unlinkSync(oldPath)
        log(`Removed old file with different date: ${oldFile}`)
      }
    }

    newManifest[vaultPath] = outputFile
    published.push(vaultPath)
    log(`Synced: ${file} → ${outputFile}`)
  }

  // Cleanup removed files
  const removed = []
  for (const [vaultPath, outputFile] of Object.entries(oldManifest)) {
    if (!newManifest[vaultPath]) {
      const outputPath = join(CONTENT_DIR, outputFile)
      if (existsSync(outputPath)) {
        unlinkSync(outputPath)
        removed.push(outputFile)
        log(`Removed: ${outputFile}`)
      }
    }
  }

  saveManifest(newManifest)

  const result = {
    initialized: [],
    published,
    removed,
    slugs: Object.fromEntries(
      Object.entries(newManifest).map(([k, v]) => [k, v.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')])
    )
  }

  outputResult(result)
  log(`\nSync complete: ${published.length} published, ${removed.length} removed`)
}

function build() {
  log('Building Jekyll site...')

  try {
    execSync('bundle exec jekyll build', { stdio: isJson ? 'ignore' : 'inherit' })

    log('Build complete')

    const manifest = loadManifest()
    const result = {
      initialized: [],
      published: Object.keys(manifest),
      removed: [],
      slugs: Object.fromEntries(
        Object.entries(manifest).map(([k, v]) => [k, v.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')])
      )
    }

    outputResult(result)
  } catch (error) {
    error('Jekyll build failed')
  }
}

function publish() {
  log('Publishing to git...')

  try {
    execSync('git add .', { stdio: 'inherit' })

    const status = execSync('git status --porcelain').toString()
    if (!status.trim()) {
      log('No changes to commit')
      outputResult({ initialized: [], published: [], removed: [], slugs: {} })
      return
    }

    execSync('git commit -m "chore: update blog content"', { stdio: 'inherit' })
    execSync('git push', { stdio: 'inherit' })

    log('Published successfully')

    const manifest = loadManifest()
    const result = {
      initialized: [],
      published: Object.keys(manifest),
      removed: [],
      slugs: Object.fromEntries(
        Object.entries(manifest).map(([k, v]) => [k, v.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')])
      )
    }

    outputResult(result)
  } catch (error) {
    error('Git publish failed')
  }
}

switch (command) {
  case 'sync':
    sync()
    break
  case 'build':
    build()
    break
  case 'publish':
    publish()
    break
  default:
    console.error('Usage: sync.mjs <sync|build|publish> [--json]')
    process.exit(1)
}
