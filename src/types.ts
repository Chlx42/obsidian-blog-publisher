export type BlogRunnerState =
  | 'idle'
  | 'installing'
  | 'syncing'
  | 'building'
  | 'starting-preview'
  | 'previewing'
  | 'stopping-preview'
  | 'publishing'

/** 面板、状态栏、日志弹窗三处共用，所以放在类型层而不是某个 UI 文件里。 */
export const STATE_LABELS: Record<BlogRunnerState, string> = {
  idle: '博客：就绪',
  installing: '博客：安装依赖中',
  syncing: '博客预览：同步中',
  building: '博客：构建中',
  'starting-preview': '博客预览：启动中',
  previewing: '博客预览：运行中',
  'stopping-preview': '博客预览：停止中',
  publishing: '博客：发布中'
}

/** 任务进行中，此时不接受新任务。 */
export function isBusy(state: BlogRunnerState): boolean {
  return state !== 'idle' && state !== 'previewing'
}

export type RuntimeType = 'bun' | 'npm' | 'pnpm' | 'yarn' | 'custom'

export interface CommandSet {
  install: string[]
  sync: string[]
  build: string[]
  publish: string[]
  devPreview: string[]
  prodPreview: string[]
}

export interface BlogPublisherSettings {
  blogRepository: string
  articlesFolder: string
  previewPort: number
  previewMode: 'development' | 'production'
  autoSyncOnSave: boolean
  /** 状态栏是否显示博客状态（任务进度 + 当前文章状态）。 */
  showStatusBar: boolean
  siteUrl: string
  runtime: RuntimeType
  customRuntimePath: string
  commands: CommandSet
  resultLinePrefix: string
  customValidatorPath: string
  collapsedGroups: string[]  // 折叠的分组状态码
}

export type LogLevel = 'info' | 'error'

export interface LogEntry {
  text: string
  level: LogLevel
  /** 产生这行日志时所处的阶段，用于在日志弹窗里分组。 */
  stage: BlogRunnerState
}

/** 发布器 --json 输出的同步结果。 */
export interface SyncSummary {
  initialized: string[]
  published: string[]
  removed: string[]
  slugs: Record<string, string>
  /** publish 命令附带：这次是否真的产生了提交 / 推送成功。 */
  committed?: boolean
  pushed?: boolean
}

/**
 * 文章生命周期：未初始化 → 未发布 →（标记 publish）待发布 →（推送成功）已上线。
 * 上线后再编辑会回到「待发布」并带「有修改」标记；draft 是发布流之外的预览态。
 */
export type ArticleStatusCode =
  | 'uninitialized'
  | 'unpublished'
  | 'invalid'
  | 'draft'
  | 'pending'
  | 'live'

export interface ArticleStatus {
  code: ArticleStatusCode
  label: string
  issues: string[]
  /** manifest 里的权威 slug，已上线时可拼出博客地址。 */
  slug?: string
  /** 待发布且之前上线过：说明是上线后改了内容，等一次更新推送。 */
  modified?: boolean
  /** 未发布但站点上还挂着旧文件：等一次推送下线。 */
  pendingRemoval?: boolean
}

/** 从 vault 读出来的一篇笔记，只保留分组需要的字段，不含 Obsidian 对象。 */
export interface VaultNote {
  path: string
  basename: string
  frontmatter?: Record<string, unknown>
  mtime?: number
}

export interface ArticleEntry extends VaultNote {
  title: string
  status: ArticleStatus
}

export interface ArticleGroup {
  code: ArticleStatusCode
  label: string
  items: ArticleEntry[]
}

export interface ArticleIndex {
  groups: ArticleGroup[]
  counts: Record<ArticleStatusCode, number>
  total: number
}

export interface BlogState {
  task: BlogRunnerState
  logs: LogEntry[]
  lastResult: SyncSummary | null
  articles: ArticleIndex | null
  previewUrl: string | null
  lastFailedOperation: FailedOperation | null
}

export interface FailedOperation {
  type: 'publish' | 'preview' | 'sync'
  error: string
  timestamp: number
}

/** Astro + Bun 预设，保持现有行为。 */
export const DEFAULT_COMMANDS: CommandSet = {
  install: ['install', '--frozen-lockfile'],
  sync: ['run', 'blog', '--json'],
  build: ['run', 'blog:build', '--json'],
  publish: ['run', 'blog:publish', '--json'],
  devPreview: ['run', 'dev', '--host', '<host>', '--port', '<port>'],
  prodPreview: ['run', 'preview', '--host', '<host>', '--port', '<port>']
}

export type FrameworkId = 'astro' | 'hugo' | 'hexo' | 'jekyll'

export interface FrameworkPreset {
  id: FrameworkId
  label: string
  /** 命中任一标志文件即认定是这个框架，顺序决定优先级。 */
  markers: string[]
  commands: CommandSet
  /** 站点仓库里放文章的目录，仅用于设置页提示。 */
  contentHint: string
}

/**
 * 四个预设覆盖常见静态博客。sync/build/publish 一律走仓库自己的 scripts，
 * 因为删除同步需要 manifest，那是仓库脚本的职责，插件只负责调用。
 */
export const FRAMEWORK_PRESETS: FrameworkPreset[] = [
  {
    id: 'astro',
    label: 'Astro',
    markers: ['astro.config.ts', 'astro.config.mjs', 'astro.config.js'],
    commands: DEFAULT_COMMANDS,
    contentHint: 'src/content/blog/'
  },
  {
    id: 'hugo',
    label: 'Hugo',
    markers: ['hugo.toml', 'hugo.yaml', 'config.toml'],
    commands: {
      install: ['install'],
      sync: ['run', 'blog', '--json'],
      build: ['run', 'blog:build', '--json'],
      publish: ['run', 'blog:publish', '--json'],
      devPreview: ['run', 'dev', '--', '--bind', '<host>', '--port', '<port>'],
      prodPreview: ['run', 'preview', '--', '--bind', '<host>', '--port', '<port>']
    },
    contentHint: 'content/posts/'
  },
  {
    // Jekyll 也用 _config.yml，靠 Hexo 专属的 scaffolds/ 区分，避免误判。
    id: 'hexo',
    label: 'Hexo',
    markers: ['scaffolds', 'db.json'],
    commands: {
      install: ['install'],
      sync: ['run', 'blog', '--json'],
      build: ['run', 'blog:build', '--json'],
      publish: ['run', 'blog:publish', '--json'],
      devPreview: ['run', 'dev', '--', '--port', '<port>'],
      prodPreview: ['run', 'preview', '--', '--port', '<port>']
    },
    contentHint: 'source/_posts/'
  },
  {
    id: 'jekyll',
    label: 'Jekyll',
    markers: ['Gemfile', '_config.yml'],
    commands: {
      install: ['install'],
      sync: ['run', 'blog', '--json'],
      build: ['run', 'blog:build', '--json'],
      publish: ['run', 'blog:publish', '--json'],
      devPreview: ['run', 'dev', '--', '--host', '<host>', '--port', '<port>'],
      prodPreview: ['run', 'preview', '--', '--host', '<host>', '--port', '<port>']
    },
    contentHint: '_posts/'
  }
]

export const DEFAULT_SETTINGS: BlogPublisherSettings = {
  blogRepository: '',
  articlesFolder: '',
  previewPort: 4173,
  previewMode: 'development',
  autoSyncOnSave: true,
  showStatusBar: true,
  siteUrl: '',
  runtime: 'bun',
  customRuntimePath: '',
  commands: { ...DEFAULT_COMMANDS },
  resultLinePrefix: '__BLOG_RESULT__',
  customValidatorPath: '',
  collapsedGroups: []
}

/** 发布器结构化结果行的前缀，stdout 里混着构建输出，靠它挑出结果行。 */
export const RESULT_LINE_PREFIX = '__BLOG_RESULT__'
