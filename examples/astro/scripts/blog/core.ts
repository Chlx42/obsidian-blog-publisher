import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { pinyin } from 'pinyin-pro'
import { parse, stringify } from 'yaml'

import { collectArticleIssues } from './article-rules'
import type { BlogSyncConfig } from './config'

type HeroImage = Record<string, unknown> & { src?: unknown }

type Frontmatter = Record<string, unknown> & {
  publish?: boolean
  title?: string
  description?: string
  publishDate?: string | Date
  updatedDate?: string | Date
  tags?: string[]
  slug?: string
  draft?: boolean
  language?: string
  heroImage?: string | HeroImage
}

type SourceNote = {
  absolutePath: string
  relativePath: string
  body: string
  data: Frontmatter
  slug: string
}

type ManifestEntry = {
  slug: string
  files: string[]
}

export type BlogSyncManifest = {
  version: 1
  entries: Record<string, ManifestEntry>
}

export type SyncResult = {
  initialized: string[]
  published: string[]
  removed: string[]
  touchedOutputPaths: string[]
  manifest: BlogSyncManifest
}

const EMPTY_MANIFEST: BlogSyncManifest = { version: 1, entries: {} }
const SAFE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SAFE_FILE_PATTERN = /^(?:index\.md|[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+)$/
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const IMAGE_EMBED_PATTERN = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
const WIKI_LINK_PATTERN = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

export function createSlug(value: string): string {
  const transliterated = pinyin(value, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive'
  }).join('-')

  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseMarkdown(source: string): { data: Frontmatter; body: string } {
  const match = source.match(FRONTMATTER_PATTERN)
  if (!match) return { data: {}, body: source }

  const parsed = parse(match[1])
  if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
    throw new Error('frontmatter 必须是 YAML 对象')
  }

  return {
    data: (parsed ?? {}) as Frontmatter,
    body: source.slice(match[0].length)
  }
}

export function stringifyMarkdown(data: Frontmatter, body: string): string {
  const yaml = stringify(data, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n\n${body.replace(/^\r?\n+/, '')}`
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function listFiles(directory: string, extension?: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return listFiles(path, extension)
      if (!entry.isFile()) return []
      if (extension && extname(entry.name).toLowerCase() !== extension) return []
      return [path]
    })
  )
  return files.flat().sort()
}

async function readManifest(path: string): Promise<BlogSyncManifest> {
  try {
    const manifest = JSON.parse(await readFile(path, 'utf8')) as unknown
    validateManifest(manifest)
    return manifest
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY_MANIFEST)
    throw error
  }
}

function validateManifest(manifest: unknown): asserts manifest is BlogSyncManifest {
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    manifest.version !== 1 ||
    !('entries' in manifest) ||
    typeof manifest.entries !== 'object' ||
    manifest.entries === null ||
    Array.isArray(manifest.entries)
  ) {
    throw new Error('不支持的清单格式')
  }

  const slugs = new Set<string>()
  for (const [source, entry] of Object.entries(manifest.entries)) {
    if (
      !source ||
      typeof entry !== 'object' ||
      entry === null ||
      !('slug' in entry) ||
      typeof entry.slug !== 'string' ||
      !SAFE_SLUG_PATTERN.test(entry.slug) ||
      !('files' in entry) ||
      !Array.isArray(entry.files) ||
      entry.files.some((file: unknown) => typeof file !== 'string' || !SAFE_FILE_PATTERN.test(file))
    ) {
      throw new Error(`清单条目无效: ${source}`)
    }
    if (slugs.has(entry.slug)) throw new Error(`清单 slug 重复: ${entry.slug}`)
    slugs.add(entry.slug)
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function assertNotSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`拒绝写入符号链接: ${path}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function writeIfChanged(path: string, content: string | Uint8Array): Promise<void> {
  try {
    const current = await readFile(path)
    const next = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
    if (current.equals(next)) return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

function relativePortable(from: string, to: string): string {
  return relative(from, to).split(sep).join('/')
}

async function initializeNote(
  path: string,
  sourceDir: string
): Promise<{
  note: SourceNote
  initialized: boolean
}> {
  const source = await readFile(path, 'utf8')
  const parsed = parseMarkdown(source)
  const fileTitle = basename(path, extname(path))
  const fileStat = await stat(path)
  const createdAt = fileStat.birthtimeMs > 0 ? fileStat.birthtime : fileStat.mtime
  const data = { ...parsed.data }
  let initialized = false

  const defaults: Frontmatter = {
    publish: false,
    title: fileTitle,
    description: '',
    publishDate: formatDate(createdAt),
    tags: [],
    slug: createSlug(typeof data.title === 'string' ? data.title : fileTitle),
    draft: true,
    language: '中文'
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in data)) {
      data[key] = value
      initialized = true
    }
  }

  if (initialized) {
    await writeFile(path, stringifyMarkdown(data, parsed.body))
  }

  const slug = typeof data.slug === 'string' ? createSlug(data.slug) : ''
  if (!slug) throw new Error(`${relativePortable(sourceDir, path)} 无法生成有效 slug`)

  return {
    initialized,
    note: {
      absolutePath: path,
      relativePath: relativePortable(sourceDir, path),
      body: parsed.body,
      data,
      slug
    }
  }
}

function validatePublishedNote(note: SourceNote): void {
  const [firstIssue] = collectArticleIssues(note.data)
  if (firstIssue) throw new Error(`${note.relativePath}: ${firstIssue}`)
}

async function buildAttachmentIndex(directory: string): Promise<Map<string, string[]>> {
  const files = await listFiles(directory)
  const index = new Map<string, string[]>()
  for (const file of files) {
    const key = basename(file)
    index.set(key, [...(index.get(key) ?? []), file])
  }
  return index
}

function safeAssetName(originalName: string): string {
  const extension = extname(originalName).toLowerCase()
  const stem = basename(originalName, extname(originalName))
  const safeStem = createSlug(stem)
  if (!safeStem) throw new Error(`附件名无法转换为有效文件名: ${originalName}`)
  return `${safeStem}${extension}`
}

function headingAnchor(heading: string): string {
  return heading.trim().toLowerCase().replace(/\s+/g, '-')
}

/**
 * 把 Obsidian 里的附件名解析成输出目录里的文件名，并登记到 assets。
 * 登记后会自动进入 expectedFiles 和清单，下线时一并清理。
 */
function claimAttachment(
  note: SourceNote,
  target: string,
  attachmentIndex: Map<string, string[]>,
  assets: Map<string, string>
): string {
  const targetName = basename(target)
  const matches = attachmentIndex.get(targetName) ?? []
  if (matches.length === 0) throw new Error(`${note.relativePath}: 找不到附件 ${target}`)
  if (matches.length > 1) throw new Error(`${note.relativePath}: 附件名不唯一 ${target}`)

  const outputName = safeAssetName(targetName)
  const existingSource = assets.get(outputName)
  if (existingSource && existingSource !== matches[0]) {
    throw new Error(`${note.relativePath}: 附件输出文件名冲突 ${outputName}`)
  }
  assets.set(outputName, matches[0])
  return outputName
}

async function transformBody(
  note: SourceNote,
  publishedByTitle: Map<string, SourceNote>,
  attachmentIndex: Map<string, string[]>
): Promise<{ body: string; assets: Map<string, string> }> {
  const assets = new Map<string, string>()
  let body = note.body.replace(IMAGE_EMBED_PATTERN, (_match, rawTarget: string) => {
    const target = rawTarget.trim()
    const outputName = claimAttachment(note, target, attachmentIndex, assets)
    const targetName = basename(target)
    return `![${basename(targetName, extname(targetName))}](./${outputName})`
  })

  body = body.replace(
    WIKI_LINK_PATTERN,
    (_match, rawTarget: string, rawHeading?: string, rawAlias?: string) => {
      const target = basename(rawTarget.trim(), extname(rawTarget.trim()))
      const linkedNote = publishedByTitle.get(target)
      if (!linkedNote)
        throw new Error(`${note.relativePath}: WikiLink 目标未发布或不存在 ${target}`)
      const label = rawAlias?.trim() || rawHeading?.trim() || target
      const anchor = rawHeading ? `#${headingAnchor(rawHeading)}` : ''
      return `[${label}](/blog/${linkedNote.slug}${anchor})`
    }
  )

  return { body, assets }
}

/**
 * heroImage 可以写附件名（`封面.png`）或对象（`{ src: 封面.png, alt, color }`）。
 * 附件名会被解析、复制并改写成 `./cover.png`，已经是相对路径的写法原样保留。
 */
function resolveHeroImage(
  note: SourceNote,
  attachmentIndex: Map<string, string[]>,
  assets: Map<string, string>
): Frontmatter['heroImage'] {
  const { heroImage } = note.data
  if (heroImage === undefined) return undefined

  const source = typeof heroImage === 'string' ? { src: heroImage } : heroImage
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new Error(`${note.relativePath}: heroImage 必须是附件名或包含 src 的对象`)
  }

  const src = source.src
  if (typeof src !== 'string' || !src.trim()) {
    throw new Error(`${note.relativePath}: heroImage.src 不能为空`)
  }

  const target = src.trim()
  if (target.startsWith('./') || target.startsWith('../')) return { ...source, src: target }

  const outputName = claimAttachment(note, target, attachmentIndex, assets)
  return { ...source, src: `./${outputName}` }
}

function outputFrontmatter(data: Frontmatter, heroImage: Frontmatter['heroImage']): Frontmatter {
  const output = { ...data }
  delete output.publish
  delete output.slug
  if (heroImage) output.heroImage = heroImage
  return output
}

type OutputPlan = {
  note: SourceNote
  body: string
  assets: Map<string, string>
  heroImage: Frontmatter['heroImage']
  expectedFiles: Set<string>
  previousSource?: string
  previousEntry?: ManifestEntry
}

function sortedManifest(entries: Record<string, ManifestEntry>): BlogSyncManifest {
  return {
    version: 1,
    entries: Object.fromEntries(
      Object.entries(entries)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([source, entry]) => [source, { slug: entry.slug, files: [...entry.files].sort() }])
    )
  }
}

export async function syncBlog(config: BlogSyncConfig): Promise<SyncResult> {
  const previousManifest = await readManifest(config.manifestPath)
  const sourcePaths = await listFiles(config.sourceDir, '.md')
  const initialized: string[] = []
  const notes: SourceNote[] = []

  for (const path of sourcePaths) {
    const result = await initializeNote(path, config.sourceDir)
    notes.push(result.note)
    if (result.initialized) initialized.push(result.note.relativePath)
  }

  const publishedNotes = notes.filter((note) => note.data.publish === true)
  const bySlug = new Map<string, SourceNote>()
  const publishedByTitle = new Map<string, SourceNote>()
  for (const note of publishedNotes) {
    validatePublishedNote(note)
    const duplicateSlug = bySlug.get(note.slug)
    if (duplicateSlug) {
      throw new Error(
        `slug 冲突 "${note.slug}": ${duplicateSlug.relativePath}, ${note.relativePath}`
      )
    }
    bySlug.set(note.slug, note)

    const titleKey = basename(note.relativePath, extname(note.relativePath))
    const duplicateTitle = publishedByTitle.get(titleKey)
    if (duplicateTitle) {
      throw new Error(
        `笔记文件名冲突 "${titleKey}": ${duplicateTitle.relativePath}, ${note.relativePath}`
      )
    }
    publishedByTitle.set(titleKey, note)
  }

  const previousBySlug = new Map(
    Object.entries(previousManifest.entries).map(([source, entry]) => [
      entry.slug,
      { source, entry }
    ])
  )
  const previousOwnedSlugs = new Set(previousBySlug.keys())
  const attachmentIndex = await buildAttachmentIndex(config.attachmentsDir)
  const outputPlans: OutputPlan[] = []
  const claimedPreviousSources = new Set<string>()

  // 所有文章先完成校验和转换，再开始修改输出目录。
  for (const note of publishedNotes) {
    const targetDirectory = resolve(config.outputDir, note.slug)
    try {
      const targetStat = await lstat(targetDirectory)
      if (targetStat.isSymbolicLink()) {
        throw new Error(`${note.relativePath}: 输出目录不能是符号链接 ${note.slug}`)
      }
      if (targetStat.isDirectory() && !previousOwnedSlugs.has(note.slug)) {
        throw new Error(`${note.relativePath}: 输出目录已被手写文章占用 ${note.slug}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    const directPrevious = previousManifest.entries[note.relativePath]
    const previousMatch = directPrevious
      ? { source: note.relativePath, entry: directPrevious }
      : previousBySlug.get(note.slug)
    if (previousMatch) claimedPreviousSources.add(previousMatch.source)

    const transformed = await transformBody(note, publishedByTitle, attachmentIndex)
    // 封面图和正文图片共用一份 assets，同一张图两处引用时天然去重。
    const heroImage = resolveHeroImage(note, attachmentIndex, transformed.assets)
    const expectedFiles = new Set(['index.md', ...transformed.assets.keys()])
    const previouslyOwnedFiles = new Set(
      previousMatch?.entry.slug === note.slug ? previousMatch.entry.files : []
    )
    for (const file of expectedFiles) {
      const destination = join(targetDirectory, file)
      await assertNotSymlink(destination)
      if ((await pathExists(destination)) && !previouslyOwnedFiles.has(file)) {
        throw new Error(`${note.relativePath}: 输出文件已被手写内容占用 ${file}`)
      }
    }

    outputPlans.push({
      note,
      body: transformed.body,
      assets: transformed.assets,
      heroImage,
      expectedFiles,
      previousSource: previousMatch?.source,
      previousEntry: previousMatch?.entry
    })
  }

  const nextEntries: Record<string, ManifestEntry> = {}
  const published: string[] = []
  const removed: string[] = []
  const touchedOutputPaths = new Set<string>()

  for (const plan of outputPlans) {
    const { note, previousEntry } = plan
    const targetDirectory = resolve(config.outputDir, note.slug)
    await mkdir(targetDirectory, { recursive: true })
    const indexPath = join(targetDirectory, 'index.md')
    await writeIfChanged(
      indexPath,
      stringifyMarkdown(outputFrontmatter(note.data, plan.heroImage), plan.body)
    )
    touchedOutputPaths.add(indexPath)

    for (const [outputName, sourcePath] of plan.assets) {
      const destination = join(targetDirectory, outputName)
      try {
        const [sourceBuffer, destinationBuffer] = await Promise.all([
          readFile(sourcePath),
          readFile(destination)
        ])
        if (!sourceBuffer.equals(destinationBuffer)) await copyFile(sourcePath, destination)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await copyFile(sourcePath, destination)
      }
      touchedOutputPaths.add(destination)
    }

    if (previousEntry) {
      const previousTarget = resolve(config.outputDir, previousEntry.slug)
      await assertNotSymlink(previousTarget)
      for (const oldFile of previousEntry.files) {
        if (previousEntry.slug === note.slug && plan.expectedFiles.has(oldFile)) continue
        const oldPath = join(previousTarget, oldFile)
        touchedOutputPaths.add(oldPath)
        await rm(oldPath, { force: true })
      }
      if (previousEntry.slug !== note.slug) {
        try {
          await rmdir(previousTarget)
        } catch (error) {
          if (!['ENOENT', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) {
            throw error
          }
        }
        removed.push(previousEntry.slug)
      }
    }

    nextEntries[note.relativePath] = {
      slug: note.slug,
      files: [...plan.expectedFiles]
    }
    published.push(note.relativePath)
  }

  for (const [source, entry] of Object.entries(previousManifest.entries)) {
    if (claimedPreviousSources.has(source)) continue
    const target = resolve(config.outputDir, entry.slug)
    await assertNotSymlink(target)
    for (const file of entry.files) {
      const oldPath = join(target, file)
      touchedOutputPaths.add(oldPath)
      await rm(oldPath, { force: true })
    }
    try {
      await rmdir(target)
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error
      }
    }
    removed.push(entry.slug)
  }

  const manifest = sortedManifest(nextEntries)
  await writeIfChanged(config.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  return {
    initialized,
    published,
    removed,
    touchedOutputPaths: [...touchedOutputPaths].sort(),
    manifest
  }
}
