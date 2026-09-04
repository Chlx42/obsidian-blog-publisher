#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { execSync } from 'child_process'

const VAULT_ROOT = process.env.BLOG_VAULT_ROOT || ''
const ARTICLES_FOLDER = process.env.BLOG_ARTICLES_FOLDER || ''
const CONTENT_DIR = join(process.cwd(), 'content/posts')
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

function convertFrontmatter(obsidianFm) {
  // Hugo uses YAML frontmatter with different field names
  const hugoFm = {
    title: obsidianFm.title || 'Untitled',
    date: obsidianFm.publishDate || new Date().toISOString(),
    draft: obsidianFm.draft === true,
    tags: Array.isArray(obsidianFm.tags) ? obsidianFm.tags : []
  }

  if (obsidianFm.description) hugoFm.description = obsidianFm.description
  if (obsidianFm.heroImage) hugoFm.image = obsidianFm.heroImage

  return hugoFm
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const frontmatterText = match[1]
  const body = match[2]

  // Simple YAML parser (only handles basic key: value pairs and arrays)
  const frontmatter = {}
  const lines = frontmatterText.split('\n')
  let currentKey = null
  let currentArray = null

  for (const line of lines) {
    if (line.startsWith('  - ')) {
      // Array item
      if (currentArray) currentArray.push(line.slice(4).trim())
    } else if (line.includes(': ')) {
      const [key, ...valueParts] = line.split(': ')
      const value = valueParts.join(': ').trim()

      if (value === '[]') {
        frontmatter[key] = []
        currentArray = frontmatter[key]
        currentKey = key
      } else if (value) {
        // Parse boolean and string values
        if (value === 'true') frontmatter[key] = true
        else if (value === 'false') frontmatter[key] = false
        else frontmatter[key] = value
        currentArray = null
      } else {
        // Next line might be an array
        currentKey = key
        frontmatter[key] = []
        currentArray = frontmatter[key]
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
  const initialized = []

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

    const slug = generateSlug(frontmatter.title || basename(file, '.md'))
    const outputFile = `${slug}.md`
    const outputPath = join(CONTENT_DIR, outputFile)

    // Convert frontmatter to Hugo format
    const hugoFm = convertFrontmatter(frontmatter)

    // Write Hugo markdown
    const hugoContent = `---\n${Object.entries(hugoFm)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          if (value.length === 0) return `${key}: []`
          return `${key}:\n${value.map(v => `  - ${v}`).join('\n')}`
        }
        return `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`
      })
      .join('\n')}\n---\n\n${body}`

    writeFileSync(outputPath, hugoContent)

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
    initialized,
    published,
    removed,
    slugs: Object.fromEntries(Object.entries(newManifest).map(([k, v]) => [k, v.replace('.md', '')]))
  }

  outputResult(result)
  log(`\nSync complete: ${published.length} published, ${removed.length} removed`)
}

function build() {
  log('Building Hugo site...')

  try {
    // Run Hugo build
    execSync('hugo --minify', { stdio: 'inherit' })

    log('Build complete')

    // Return the same manifest as sync
    const manifest = loadManifest()
    const result = {
      initialized: [],
      published: Object.keys(manifest),
      removed: [],
      slugs: Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.replace('.md', '')]))
    }

    outputResult(result)
  } catch (error) {
    error('Hugo build failed')
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
      slugs: Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.replace('.md', '')]))
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
    console.error('Usage: cli.mjs <sync|build|publish> [--json]')
    process.exit(1)
}
