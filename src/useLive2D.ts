import { useRef, useState, useCallback, useEffect } from 'react'

export const LIVE2D_CANVAS_SIZE = 512

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface NormalizedFileInfo {
  name: string
  originalPath: string   // webkitRelativePath before normalization (may be empty)
  normalizedPath: string // webkitRelativePath after normalization
}

export interface Live2DDiagnostics {
  fileCount: number
  model3Name: string | null
  mocFile: string | null
  textureCount: number
  physicsFile: string | null
  // Path resolution
  settingsUrl: string | null
  resolvedMocPath: string | null       // raw  resolveURL(moc)
  encodedMocPath: string | null        // encodeURI(resolveURL(moc))
  mocNormalizedPath: string | null     // clone's raw webkitRelativePath
  encodedMocWebkit: string | null      // encodeURI(clone.webkitRelativePath)
  mocPathMatch: boolean | null         // encodedMocPath === encodedMocWebkit
  // Per-file normalization log
  normalizedFiles: NormalizedFileInfo[]
  // NetworkError
  networkErrorUrl?: string
  networkErrorStatus?: number | null
  networkErrorAborted?: boolean
  networkErrorStack?: string
}

export type Live2DStatus = 'idle' | 'loading' | 'loaded' | 'error'

const EMPTY_DIAG: Live2DDiagnostics = {
  fileCount: 0,
  model3Name: null,
  mocFile: null,
  textureCount: 0,
  physicsFile: null,
  settingsUrl: null,
  resolvedMocPath: null,
  encodedMocPath: null,
  mocNormalizedPath: null,
  encodedMocWebkit: null,
  mocPathMatch: null,
  normalizedFiles: [],
}

// ──────────────────────────────────────────────
// Cubism Core loader
// ──────────────────────────────────────────────
async function loadCubismCore(): Promise<void> {
  if ((window as any).Live2DCubismCore) return
  const tryScript = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = url
      s.onload = () => resolve()
      s.onerror = () => { s.remove(); reject() }
      document.head.appendChild(s)
    })
  try {
    await tryScript('https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js')
  } catch {
    try {
      await tryScript('/live2dcubismcore.min.js')
    } catch {
      throw new Error(
        'Cubism Core が読み込めませんでした。\n' +
        'Live2D 公式サイトから SDK をダウンロードし、\n' +
        'live2dcubismcore.min.js を /public/ に配置してください。'
      )
    }
  }
}

// ──────────────────────────────────────────────
// Clone a File with a forced webkitRelativePath
// ──────────────────────────────────────────────
function cloneWithPath(file: File, path: string): File {
  const clone = new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  })
  Object.defineProperty(clone, 'webkitRelativePath', { value: path, writable: false })
  return clone
}

// ──────────────────────────────────────────────
// Collect every referenced relative path from model3.json FileReferences
// ──────────────────────────────────────────────
function collectExpectedPaths(fr: any): string[] {
  const paths: string[] = []
  const add = (p: unknown) => { if (typeof p === 'string' && p) paths.push(p) }

  add(fr.Moc)
  add(fr.Physics)
  add(fr.Pose)
  add(fr.UserData)
  if (Array.isArray(fr.Textures))    fr.Textures.forEach(add)
  if (Array.isArray(fr.Expressions)) fr.Expressions.forEach((e: any) => add(e?.File))
  if (fr.Motions && typeof fr.Motions === 'object') {
    for (const group of Object.values(fr.Motions) as any[][]) {
      if (Array.isArray(group)) group.forEach((m: any) => { add(m?.File); add(m?.Sound) })
    }
  }
  return paths
}

// ──────────────────────────────────────────────
// Normalize files:
//   • model3.json  → webkitRelativePath = model3File.name  (bare filename)
//   • every other  → webkitRelativePath = the relative path written in model3.json
// This makes settings.resolveURL(rel) === file.webkitRelativePath for all refs.
// ──────────────────────────────────────────────
interface NormalizeResult {
  normalizedFiles: File[]
  log: NormalizedFileInfo[]
}

function normalizeFiles(files: File[], model3File: File, fr: any): NormalizeResult {
  const expectedPaths = collectExpectedPaths(fr)

  // Build basename → expected path map (first occurrence wins)
  const basenameToExpected = new Map<string, string>()
  for (const ep of expectedPaths) {
    const base = ep.split('/').pop()!
    if (!basenameToExpected.has(base)) basenameToExpected.set(base, ep)
  }

  const log: NormalizedFileInfo[] = []
  const normalizedFiles: File[] = []

  for (const file of files) {
    const originalPath = file.webkitRelativePath || ''

    if (file === model3File) {
      // model3.json: bare filename so settings.url = name, resolveURL works from root
      const np = file.name
      normalizedFiles.push(cloneWithPath(file, np))
      log.push({ name: file.name, originalPath, normalizedPath: np })
      continue
    }

    const expectedPath = basenameToExpected.get(file.name)
    if (expectedPath) {
      normalizedFiles.push(cloneWithPath(file, expectedPath))
      log.push({ name: file.name, originalPath, normalizedPath: expectedPath })
    } else {
      // Not referenced — keep original path or bare name, include anyway
      const np = originalPath || file.name
      normalizedFiles.push(cloneWithPath(file, np))
      log.push({ name: file.name, originalPath, normalizedPath: np })
    }
  }

  return { normalizedFiles, log }
}

// ──────────────────────────────────────────────
// NetworkError decoder
// ──────────────────────────────────────────────
function parseNetworkError(e: unknown): {
  message: string; url?: string; status?: number | null
  aborted?: boolean; stack?: string
} {
  if (!e || typeof e !== 'object') return { message: String(e) }
  const err = e as any
  return {
    message: err.message ?? 'Network error',
    url:     err.url     ?? undefined,
    status:  typeof err.status  === 'number'  ? err.status  : undefined,
    aborted: typeof err.aborted === 'boolean' ? err.aborted : undefined,
    stack:   typeof err.stack   === 'string'  ? err.stack   : undefined,
  }
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useLive2D() {
  const pixiAppRef           = useRef<any>(null)
  const pixiCanvasRef        = useRef<HTMLCanvasElement | null>(null)
  const loadedRef            = useRef(false)
  const settingsObjectURLRef = useRef<string | null>(null)

  const [status,      setStatus]      = useState<Live2DStatus>('idle')
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)
  const [modelName,   setModelName]   = useState('')
  const [diagnostics, setDiagnostics] = useState<Live2DDiagnostics | null>(null)

  const cleanup = useCallback(() => {
    if (pixiAppRef.current) {
      try { pixiAppRef.current.destroy(true) } catch { /* ignore */ }
      pixiAppRef.current = null
    }
    if (settingsObjectURLRef.current) {
      try { URL.revokeObjectURL(settingsObjectURLRef.current) } catch { /* ignore */ }
      settingsObjectURLRef.current = null
    }
    pixiCanvasRef.current = null
    loadedRef.current = false
    setStatus('idle')
    setErrorMsg(null)
    setDiagnostics(null)
  }, [])

  const loadModel = useCallback(async (files: File[]) => {
    cleanup()
    setStatus('loading')

    // Initial quick scan
    const model3File = files.find(f => f.name.endsWith('.model3.json')) ?? null
    const initialDiag: Live2DDiagnostics = {
      ...EMPTY_DIAG,
      fileCount:    files.length,
      model3Name:   model3File?.name ?? null,
      mocFile:      files.find(f => f.name.endsWith('.moc3'))?.name ?? null,
      textureCount: files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name)).length,
      physicsFile:  files.find(f => f.name.endsWith('physics3.json'))?.name ?? null,
    }
    setDiagnostics(initialDiag)
    setModelName(initialDiag.model3Name?.replace('.model3.json', '') ?? 'モデル')

    if (!model3File) {
      setErrorMsg('.model3.json が見つかりません（フォルダごと選択されましたか？）')
      setStatus('error')
      return
    }

    try {
      // ── Parse model3.json ──
      let json: any
      try {
        json = JSON.parse(await model3File.text())
      } catch {
        throw new Error(`${model3File.name} の JSON 解析に失敗しました`)
      }
      const fr: any = json.FileReferences ?? {}

      // ── Normalize all files ──
      // iPhone Safari may have empty webkitRelativePath; clone each file with
      // the path that model3.json expects so FileLoader's validateFiles() finds them.
      const { normalizedFiles, log } = normalizeFiles(files, model3File, fr)

      // ── Build Cubism4ModelSettings ──
      // json.url = model3File.name (bare) so resolveURL("Foo.moc3") === "Foo.moc3",
      // which now matches the normalised webkitRelativePath of the moc3 clone.
      json.url = model3File.name

      await loadCubismCore()

      const PIXI = await import('pixi.js')
      ;(window as any).PIXI = PIXI
      await new Promise<void>(r => setTimeout(r, 0))

      const { Live2DModel, Cubism4ModelSettings } = await import('pixi-live2d-display/cubism4')

      const settings = new (Cubism4ModelSettings as any)(json)
      const settingsObjectURL = URL.createObjectURL(model3File)
      settings._objectURL = settingsObjectURL

      // ── Compute raw and encoded moc paths for comparison ──
      const tryResolve = (p: string) => { try { return settings.resolveURL(p) } catch { return null } }
      const resolvedMocPath: string | null = settings.moc ? tryResolve(settings.moc) : null
      const encodedMocPath:  string | null = resolvedMocPath ? encodeURI(resolvedMocPath) : null

      const mocClone = normalizedFiles.find(f => f.name.endsWith('.moc3'))
      const mocNormalizedPath: string | null = mocClone?.webkitRelativePath ?? null
      const encodedMocWebkit:  string | null = mocNormalizedPath ? encodeURI(mocNormalizedPath) : null

      // FileLoader compares encodeURI(file.webkitRelativePath) with encodeURI(resolveURL(path))
      const mocPathMatch =
        encodedMocPath !== null && encodedMocWebkit !== null
          ? encodedMocPath === encodedMocWebkit
          : null

      setDiagnostics({
        ...initialDiag,
        settingsUrl:       settings.url ?? json.url,
        resolvedMocPath,
        encodedMocPath,
        mocNormalizedPath,
        encodedMocWebkit,
        mocPathMatch,
        normalizedFiles:   log,
      })

      // Guard before attempting load
      if (mocPathMatch === false) {
        throw new Error(
          `パス不一致 (encoded):\n  resolveURL → "${encodedMocPath}"\n  webkit     → "${encodedMocWebkit}"`
        )
      }

      // ── Override resolveURL to return encodeURI-wrapped paths ──
      // FileLoader.factory calls encodeURI(file.webkitRelativePath) when building
      // the lookup map, but compares against resolveURL() output directly.
      // Wrapping resolveURL ensures both sides are URI-encoded and match.
      // FileLoader overwrites resolveURL with its own blob resolver after
      // validateFiles() succeeds, so this override is only active during validation.
      const originalResolveURL = settings.resolveURL.bind(settings)
      settings.resolveURL = (path: string) => encodeURI(originalResolveURL(path))

      // ── PixiJS v7 Application ──
      const canvas = document.createElement('canvas')
      canvas.width  = LIVE2D_CANVAS_SIZE
      canvas.height = LIVE2D_CANVAS_SIZE

      const app = new PIXI.Application({
        view: canvas,
        width: LIVE2D_CANVAS_SIZE,
        height: LIVE2D_CANVAS_SIZE,
        backgroundAlpha: 0,
        preserveDrawingBuffer: true,
        antialias: true,
        powerPreference: 'low-power',
        autoDensity: false,
        resolution: 1,
        forceCanvas: false,
      } as any)

      if (!app.renderer || !app.view) {
        URL.revokeObjectURL(settingsObjectURL)
        throw new Error('PixiJS renderer の初期化に失敗しました')
      }

      pixiAppRef.current         = app
      pixiCanvasRef.current      = canvas
      settingsObjectURLRef.current = settingsObjectURL

      const fileArray = normalizedFiles as any
      fileArray.settings = settings
      const model = await (Live2DModel as any).from(fileArray, { autoInteract: false })
      app.stage.addChild(model)

      await new Promise<void>(r => requestAnimationFrame(() => r()))

      const mw = model.width  || LIVE2D_CANVAS_SIZE
      const mh = model.height || LIVE2D_CANVAS_SIZE
      const sc = Math.min(
        (LIVE2D_CANVAS_SIZE * 0.9) / mw,
        (LIVE2D_CANVAS_SIZE * 0.9) / mh,
      )
      model.scale.set(sc)
      model.position.set(
        (LIVE2D_CANVAS_SIZE - mw * sc) / 2,
        (LIVE2D_CANVAS_SIZE - mh * sc) / 2,
      )

      loadedRef.current = true
      setStatus('loaded')

    } catch (e) {
      const ne = parseNetworkError(e)
      let msg = ne.message
      if (ne.url)            msg += `\nURL: ${ne.url}`
      if (ne.status != null) msg += `\nHTTP status: ${ne.status}`
      if (ne.aborted)        msg += '\n(aborted)'

      setErrorMsg(msg)
      setDiagnostics(prev => prev ? {
        ...prev,
        networkErrorUrl:     ne.url,
        networkErrorStatus:  ne.status,
        networkErrorAborted: ne.aborted,
        networkErrorStack:   ne.stack,
      } : null)
      setStatus('error')

      if (pixiAppRef.current) {
        try { pixiAppRef.current.destroy(true) } catch { /* ignore */ }
        pixiAppRef.current = null
      }
      if (settingsObjectURLRef.current) {
        try { URL.revokeObjectURL(settingsObjectURLRef.current) } catch { /* ignore */ }
        settingsObjectURLRef.current = null
      }
      pixiCanvasRef.current = null
      loadedRef.current = false
    }
  }, [cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  return { loadModel, cleanup, pixiCanvasRef, loadedRef, status, errorMsg, modelName, diagnostics }
}
