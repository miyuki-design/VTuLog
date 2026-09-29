import { useRef, useState, useCallback, useEffect } from 'react'

export const LIVE2D_CANVAS_SIZE = 512

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface FetchProbe {
  label: string   // "model3.json" / "moc3" / "texture[0]" etc.
  url: string     // blob: URL (first 60 chars shown in UI)
  ok: boolean
  status: number | null  // null = fetch threw (no HTTP response)
  error?: string
}

export interface Live2DDiagnostics {
  fileCount: number
  model3Name: string | null
  mocFile: string | null
  mocResolved: boolean
  textureCount: number
  texturesResolved: number
  physicsFile: string | null
  physicsResolved: boolean
  unresolvedPaths: string[]
  // preflight fetch results (populated just before Live2DModel.from)
  fetchProbes: FetchProbe[]
  // NetworkError fields from pixi-live2d-display
  networkErrorUrl?: string
  networkErrorStatus?: number | null
  networkErrorAborted?: boolean
}

export type Live2DStatus = 'idle' | 'loading' | 'loaded' | 'error'

const EMPTY_DIAG: Live2DDiagnostics = {
  fileCount: 0,
  model3Name: null,
  mocFile: null, mocResolved: false,
  textureCount: 0, texturesResolved: 0,
  physicsFile: null, physicsResolved: false,
  unresolvedPaths: [],
  fetchProbes: [],
}

// ──────────────────────────────────────────────
// Cubism Core dynamic loader
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
// File map builder — 3 lookup keys per file
// ──────────────────────────────────────────────
function buildFileMap(files: File[], model3File: File): Map<string, File> {
  const map = new Map<string, File>()

  const model3Dir = model3File.webkitRelativePath
    ? model3File.webkitRelativePath.split('/').slice(0, -1).join('/') + '/'
    : ''

  for (const f of files) {
    const wp = f.webkitRelativePath ?? ''
    if (wp) map.set(wp, f)
    if (wp && model3Dir && wp.startsWith(model3Dir)) {
      const rel = wp.slice(model3Dir.length)
      if (rel) map.set(rel, f)
    }
    if (!map.has(f.name)) map.set(f.name, f)
  }

  return map
}

// ──────────────────────────────────────────────
// Resolver: path → blob URL (one URL per File)
// ──────────────────────────────────────────────
function makeResolver(fileMap: Map<string, File>, blobUrls: Map<File, string>) {
  return (p: string): { url: string; resolved: boolean } => {
    if (!p) return { url: p, resolved: false }
    const norm = p.startsWith('./') ? p.slice(2) : p
    const file =
      fileMap.get(p) ??
      fileMap.get(norm) ??
      fileMap.get(p.split('/').pop()!)
    if (file) {
      if (!blobUrls.has(file)) blobUrls.set(file, URL.createObjectURL(file))
      return { url: blobUrls.get(file)!, resolved: true }
    }
    return { url: p, resolved: false }
  }
}

// ──────────────────────────────────────────────
// Model preparation
// ──────────────────────────────────────────────
interface PrepareResult {
  model3Url: string
  mocBlobUrl: string | null
  textureBlobUrls: string[]
  physicsBlobUrl: string | null
  allBlobUrls: string[]
  diagnostics: Live2DDiagnostics
}

async function prepareModel(files: File[]): Promise<PrepareResult> {
  const diag: Live2DDiagnostics = { ...EMPTY_DIAG, fileCount: files.length }

  const model3File = files.find(f => f.name.endsWith('.model3.json'))
  if (!model3File) throw new Error('.model3.json が見つかりません（フォルダごと選択されましたか？）')
  diag.model3Name = model3File.name

  const fileMap = buildFileMap(files, model3File)
  const blobUrls = new Map<File, string>()
  const resolve = makeResolver(fileMap, blobUrls)

  let model3: any
  try {
    model3 = JSON.parse(await model3File.text())
  } catch {
    throw new Error(`${model3File.name} の JSON 解析に失敗しました`)
  }
  const fr: any = model3.FileReferences ?? {}

  // Track individual blob URLs for preflight
  let mocBlobUrl: string | null = null
  const textureBlobUrls: string[] = []
  let physicsBlobUrl: string | null = null

  // ── Moc ──
  if (fr.Moc) {
    diag.mocFile = fr.Moc
    const r = resolve(fr.Moc)
    fr.Moc = r.url
    diag.mocResolved = r.resolved
    if (r.resolved) mocBlobUrl = r.url
    else diag.unresolvedPaths.push(diag.mocFile!)
  }

  // ── Textures ──
  if (Array.isArray(fr.Textures)) {
    diag.textureCount = fr.Textures.length
    fr.Textures = fr.Textures.map((t: string, i: number) => {
      const r = resolve(t)
      if (r.resolved) { diag.texturesResolved++; textureBlobUrls.push(r.url) }
      else diag.unresolvedPaths.push(t)
      return r.url
    })
  }

  // ── Physics ──
  if (fr.Physics) {
    diag.physicsFile = fr.Physics
    const r = resolve(fr.Physics)
    fr.Physics = r.url
    diag.physicsResolved = r.resolved
    if (r.resolved) physicsBlobUrl = r.url
    else diag.unresolvedPaths.push(diag.physicsFile!)
  }

  // ── Other optional refs ──
  const resolveOpt = (p: string): string => {
    if (!p) return p
    const r = resolve(p)
    if (!r.resolved) diag.unresolvedPaths.push(p)
    return r.url
  }
  if (fr.Pose) fr.Pose = resolveOpt(fr.Pose)
  if (fr.UserData) fr.UserData = resolveOpt(fr.UserData)
  if (Array.isArray(fr.Expressions)) {
    fr.Expressions = fr.Expressions.map((e: any) => ({ ...e, File: resolveOpt(e.File ?? '') }))
  }
  if (fr.Motions && typeof fr.Motions === 'object') {
    for (const group of Object.values(fr.Motions) as any[][]) {
      if (!Array.isArray(group)) continue
      for (const m of group) {
        if (m.File) m.File = resolveOpt(m.File)
        if (m.Sound) m.Sound = resolveOpt(m.Sound)
      }
    }
  }

  const patchedBlob = new Blob([JSON.stringify(model3)], { type: 'application/json' })
  const model3Url = URL.createObjectURL(patchedBlob)

  return {
    model3Url,
    mocBlobUrl,
    textureBlobUrls,
    physicsBlobUrl,
    allBlobUrls: [model3Url, ...blobUrls.values()],
    diagnostics: diag,
  }
}

// ──────────────────────────────────────────────
// Preflight: fetch each blob URL and record result
// ──────────────────────────────────────────────
async function runPreflight(params: {
  model3Url: string
  mocBlobUrl: string | null
  textureBlobUrls: string[]
  physicsBlobUrl: string | null
  mocFile: string | null
  physicsFile: string | null
}): Promise<FetchProbe[]> {
  const probes: Array<{ label: string; url: string }> = [
    { label: 'model3.json (patched)', url: params.model3Url },
  ]
  if (params.mocBlobUrl)
    probes.push({ label: params.mocFile ?? 'moc3', url: params.mocBlobUrl })
  params.textureBlobUrls.forEach((u, i) =>
    probes.push({ label: `texture[${i}]`, url: u })
  )
  if (params.physicsBlobUrl)
    probes.push({ label: params.physicsFile ?? 'physics3.json', url: params.physicsBlobUrl })

  const results: FetchProbe[] = []

  await Promise.all(probes.map(async ({ label, url }) => {
    let ok = false
    let status: number | null = null
    let error: string | undefined

    try {
      const res = await fetch(url)
      ok = res.ok
      status = res.status
      // Drain to avoid memory leak on large textures
      await res.arrayBuffer().catch(() => {})
    } catch (e) {
      error = (e as Error).message
    }

    results.push({ label, url, ok, status, error })
  }))

  // Keep same order as probes
  return probes.map(p => results.find(r => r.url === p.url)!)
}

// ──────────────────────────────────────────────
// Decode pixi-live2d-display NetworkError
// ──────────────────────────────────────────────
function parseNetworkError(e: unknown): {
  message: string
  url?: string
  status?: number | null
  aborted?: boolean
} {
  if (!e || typeof e !== 'object') return { message: String(e) }
  const err = e as any
  return {
    message: err.message ?? 'Network error',
    url: err.url ?? undefined,
    status: typeof err.status === 'number' ? err.status : undefined,
    aborted: typeof err.aborted === 'boolean' ? err.aborted : undefined,
  }
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useLive2D() {
  const pixiAppRef    = useRef<any>(null)
  const pixiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedRef     = useRef(false)
  const allBlobUrlsRef = useRef<string[]>([])

  const [status,      setStatus]      = useState<Live2DStatus>('idle')
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)
  const [modelName,   setModelName]   = useState('')
  const [diagnostics, setDiagnostics] = useState<Live2DDiagnostics | null>(null)

  const cleanup = useCallback(() => {
    if (pixiAppRef.current) {
      try { pixiAppRef.current.destroy(true) } catch { /* ignore */ }
      pixiAppRef.current = null
    }
    pixiCanvasRef.current = null
    loadedRef.current = false
    allBlobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch { /* ignore */ } })
    allBlobUrlsRef.current = []
    setStatus('idle')
    setErrorMsg(null)
    setDiagnostics(null)
  }, [])

  const loadModel = useCallback(async (files: File[]) => {
    cleanup()
    setStatus('loading')

    const model3File  = files.find(f => f.name.endsWith('.model3.json'))
    const initialName = model3File?.name.replace('.model3.json', '') ?? 'モデル'
    setModelName(initialName)
    setDiagnostics({
      ...EMPTY_DIAG,
      fileCount: files.length,
      model3Name: model3File?.name ?? null,
    })

    try {
      // ── Step 1: Resolve all paths to blob URLs ──
      const {
        model3Url, mocBlobUrl, textureBlobUrls, physicsBlobUrl,
        allBlobUrls, diagnostics: diag,
      } = await prepareModel(files)
      allBlobUrlsRef.current = allBlobUrls
      setDiagnostics({ ...diag })

      // ── Step 2: Preflight — fetch every blob URL before handing to Live2D ──
      const probes = await runPreflight({
        model3Url,
        mocBlobUrl,
        textureBlobUrls,
        physicsBlobUrl,
        mocFile: diag.mocFile,
        physicsFile: diag.physicsFile,
      })
      setDiagnostics(prev => ({ ...(prev ?? diag), fetchProbes: probes }))

      const failedProbes = probes.filter(p => !p.ok)
      if (failedProbes.length > 0) {
        const detail = failedProbes.map(p =>
          `${p.label}: ${p.error ?? `HTTP ${p.status}`}`
        ).join('\n')
        throw new Error(`Blob URL の fetch に失敗しました:\n${detail}`)
      }

      // ── Step 3: Load Cubism Core ──
      await loadCubismCore()

      // ── Step 4: PixiJS v7 setup ──
      // pixi-live2d-display 0.4.x requires pixi.js ^7 (v8 is incompatible).
      // window.PIXI must be set before importing the plugin.
      const PIXI = await import('pixi.js')
      ;(window as any).PIXI = PIXI
      await new Promise<void>(r => setTimeout(r, 0))  // let PIXI hooks settle

      const { Live2DModel } = await import('pixi-live2d-display/cubism4')

      const canvas = document.createElement('canvas')
      canvas.width  = LIVE2D_CANVAS_SIZE
      canvas.height = LIVE2D_CANVAS_SIZE

      const app = new PIXI.Application({
        view: canvas,           // v7: app.view — NOT app.canvas (v8)
        width: LIVE2D_CANVAS_SIZE,
        height: LIVE2D_CANVAS_SIZE,
        backgroundAlpha: 0,
        preserveDrawingBuffer: true,
        antialias: true,
        powerPreference: 'low-power',
        autoDensity: false,
        resolution: 1,
        forceCanvas: false,     // WebGL preferred; avoids WebGPU on Safari
      } as any)

      if (!app.renderer || !app.view) {
        throw new Error('PixiJS renderer の初期化に失敗しました')
      }

      pixiAppRef.current    = app
      pixiCanvasRef.current = canvas

      // ── Step 5: Load Live2D model ──
      const model = await (Live2DModel as any).from(model3Url, { autoInteract: false })
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
      // pixi-live2d-display throws NetworkError objects with .url / .status / .aborted
      const ne = parseNetworkError(e)

      // Build a human-readable error string including NetworkError fields
      let msg = ne.message
      if (ne.url)    msg += `\nURL: ${ne.url}`
      if (ne.status != null) msg += `\nHTTP status: ${ne.status}`
      if (ne.aborted) msg += '\n(aborted)'

      setErrorMsg(msg)
      setDiagnostics(prev => prev ? {
        ...prev,
        networkErrorUrl:     ne.url,
        networkErrorStatus:  ne.status,
        networkErrorAborted: ne.aborted,
      } : null)
      setStatus('error')

      if (pixiAppRef.current) {
        try { pixiAppRef.current.destroy(true) } catch { /* ignore */ }
        pixiAppRef.current = null
      }
      pixiCanvasRef.current = null
      loadedRef.current = false
    }
  }, [cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  return {
    loadModel,
    cleanup,
    pixiCanvasRef,
    loadedRef,
    status,
    errorMsg,
    modelName,
    diagnostics,
  }
}
