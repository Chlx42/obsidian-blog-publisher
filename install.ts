/**
 * 把构建产物装进 Obsidian vault，供开发时快速迭代。
 * 用法：BLOG_VAULT_ROOT=/path/to/vault bun run install:plugin
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_COMMANDS, DEFAULT_SETTINGS, type BlogPublisherSettings } from './src/types'

const pluginId = 'blog-publisher'
const pluginSourceDirectory = dirname(fileURLToPath(import.meta.url))

const vaultRoot = process.env.BLOG_VAULT_ROOT?.trim()
if (!vaultRoot) {
  console.error('缺少 BLOG_VAULT_ROOT，示例：BLOG_VAULT_ROOT=~/Documents/vault bun run install:plugin')
  process.exit(1)
}

const pluginDirectory = join(vaultRoot, '.obsidian/plugins', pluginId)
await mkdir(pluginDirectory, { recursive: true })
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(join(pluginSourceDirectory, file), join(pluginDirectory, file))
}

// 内置校验器由插件运行时 require()，得和产物一起装进 vault。
await mkdir(join(pluginDirectory, 'validators'), { recursive: true })
await copyFile(
  join(pluginSourceDirectory, 'validators/astro.js'),
  join(pluginDirectory, 'validators/astro.js')
)

// commands 是嵌套对象，浅合并会让旧配置缺字段时留下 undefined。
const dataPath = join(pluginDirectory, 'data.json')
let settings: BlogPublisherSettings = { ...DEFAULT_SETTINGS, commands: { ...DEFAULT_COMMANDS } }
try {
  const saved = JSON.parse(await readFile(dataPath, 'utf8')) as Partial<BlogPublisherSettings>
  settings = {
    ...settings,
    ...saved,
    commands: { ...DEFAULT_COMMANDS, ...(saved.commands ?? {}) }
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

if (process.env.BLOG_REPOSITORY?.trim()) {
  settings.blogRepository = settings.blogRepository || process.env.BLOG_REPOSITORY.trim()
}
if (process.env.BLOG_ARTICLES_FOLDER?.trim()) {
  settings.articlesFolder = settings.articlesFolder || process.env.BLOG_ARTICLES_FOLDER.trim()
}
await writeFile(dataPath, `${JSON.stringify(settings, null, 2)}\n`)

// community-plugins.json 可能不存在（vault 从没启用过第三方插件）。
const enabledPluginsPath = join(vaultRoot, '.obsidian/community-plugins.json')
let enabledPlugins: string[] = []
try {
  enabledPlugins = JSON.parse(await readFile(enabledPluginsPath, 'utf8')) as string[]
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}
if (!enabledPlugins.includes(pluginId)) {
  enabledPlugins.push(pluginId)
  await writeFile(enabledPluginsPath, `${JSON.stringify(enabledPlugins, null, 2)}\n`)
}

console.log(`插件已安装到 ${pluginDirectory}`)
