import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

export type BlogSyncConfig = {
  /** Vault 绝对路径，用于扫描文章目录之外的 publish 笔记。 */
  vaultRoot: string
  sourceDir: string
  attachmentsDir: string
  outputDir: string
  manifestPath: string
}

/** 用户可配置的部分，路径都相对于 vaultRoot。 */
export type BlogPaths = {
  vaultRoot: string
  articlesFolder: string
  attachmentsFolder: string
}

const repositoryRoot = resolve(import.meta.dir, '../..')
const configPath = resolve(repositoryRoot, '.blog-config.json')
const examplePath = '.blog-config.example.json'

const DEFAULT_ARTICLES_FOLDER = 'blog'
const DEFAULT_ATTACHMENTS_FOLDER = 'attachments'

const MISSING_VAULT_ROOT = [
  '找不到 Obsidian Vault 路径。',
  `请复制 ${examplePath} 为 .blog-config.json 并填写 vaultRoot，`,
  '或设置环境变量 BLOG_VAULT_ROOT。'
].join('')

function readConfigFile(): Partial<BlogPaths> {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('.blog-config.json 不是有效的 JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('.blog-config.json 必须是 JSON 对象')
  }

  const config: Partial<BlogPaths> = {}
  for (const key of ['vaultRoot', 'articlesFolder', 'attachmentsFolder'] as const) {
    const value = (parsed as Record<string, unknown>)[key]
    if (value === undefined) continue
    if (typeof value !== 'string') throw new Error(`.blog-config.json: ${key} 必须是字符串`)
    if (value.trim()) config[key] = value.trim()
  }
  return config
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

/** 优先级：环境变量 > .blog-config.json > 内置默认值。 */
export function loadBlogPaths(env: Record<string, string | undefined> = process.env): BlogPaths {
  const file = readConfigFile()
  const vaultRoot = env.BLOG_VAULT_ROOT?.trim() || file.vaultRoot
  if (!vaultRoot) throw new Error(MISSING_VAULT_ROOT)
  if (!isAbsolute(vaultRoot)) throw new Error(`Vault 路径必须是绝对路径: ${vaultRoot}`)

  const articlesFolder = trimSlashes(
    env.BLOG_ARTICLES_FOLDER?.trim() || file.articlesFolder || DEFAULT_ARTICLES_FOLDER
  )
  const attachmentsFolder = trimSlashes(
    env.BLOG_ATTACHMENTS_FOLDER?.trim() || file.attachmentsFolder || DEFAULT_ATTACHMENTS_FOLDER
  )
  if (!articlesFolder) throw new Error('articlesFolder 不能为空')
  if (!attachmentsFolder) throw new Error('attachmentsFolder 不能为空')

  return { vaultRoot, articlesFolder, attachmentsFolder }
}

export function loadBlogConfig(
  env: Record<string, string | undefined> = process.env
): BlogSyncConfig {
  const paths = loadBlogPaths(env)
  return {
    vaultRoot: paths.vaultRoot,
    sourceDir: resolve(paths.vaultRoot, paths.articlesFolder),
    attachmentsDir: resolve(paths.vaultRoot, paths.attachmentsFolder),
    outputDir: resolve(repositoryRoot, 'src/content/blog'),
    manifestPath: resolve(repositoryRoot, '.blog-sync-manifest.json')
  }
}

export { repositoryRoot }
