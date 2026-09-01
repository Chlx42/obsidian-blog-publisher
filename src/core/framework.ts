import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { FRAMEWORK_PRESETS, type FrameworkPreset, type RuntimeType } from '../types'

/** 仓库里存在哪些标志文件，抽成接口是为了测试时不碰真实文件系统。 */
export type FileProbe = (relativePath: string) => boolean

/**
 * 按预设顺序找第一个命中的框架。Hexo 和 Jekyll 共用 _config.yml，
 * 所以各自的 markers 里专属文件排在前面，见 FRAMEWORK_PRESETS 的注释。
 */
export function detectFramework(exists: FileProbe): FrameworkPreset | null {
  for (const preset of FRAMEWORK_PRESETS) {
    if (preset.markers.some((marker) => exists(marker))) return preset
  }
  return null
}

/** 给定仓库路径，探测真实文件系统。路径为空时不猜。 */
export function detectFrameworkAt(repositoryPath: string): FrameworkPreset | null {
  const root = repositoryPath.trim()
  if (!root) return null
  return detectFramework((relative) => existsSync(join(root, relative)))
}

/** package.json 的 packageManager 字段（Corepack 约定）比路径探测更可信。 */
export function detectRuntimeFromManifest(manifest: unknown): RuntimeType | null {
  if (typeof manifest !== 'object' || manifest === null) return null
  const field = (manifest as { packageManager?: unknown }).packageManager
  if (typeof field !== 'string') return null
  const name = field.split('@')[0]?.trim()
  if (name === 'bun' || name === 'npm' || name === 'pnpm' || name === 'yarn') return name
  return null
}
