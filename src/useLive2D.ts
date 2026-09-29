import { useRef, useState, useCallback, useEffect } from 'react'

export const LIVE2D_CANVAS_SIZE = 512

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface FetchProbe {
  label: string
  url: string
  ok: boolean
  status: number | null    // null = fetch threw before getting a response
  contentType: string | null
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
  // Preflight fetch results (set just before Live2DModel.from)
  fetchProbes: FetchProbe[]
  // Snippet of patched model3.json FileReferences for manual verification
  patchedRefs: {
    Moc?: string
    Textures?: string[]
    Physics?: string
  } | null
  // NetworkError fields from pixi-live2d-display
  networkErrorUrl?: string
  networkErrorStatus?: number | null
  networkErrorAborted?: boolean
  networkErrorStack?: string
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
  patchedRefs: null,
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
// Model preparation — returns patched model3 + tracking URLs
// ──────────────────────────────────────────────
interface PrepareResult {
  model3Url: string
  // individual blob URLs for preflight, keyed by human label
  probeTargets: Array<{ label: string; url: string }>
  allBlobUrls: string[]
  diagnostics: Live2DDiagnostics
  patchedModel3: any  // the patched JSON object for ref-snippet display
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

  // Track each category of blob URL for preflight
  const probeTargets: Array<{ label: string; url: string }> = []

  // ── Moc ──
  if (fr.Moc) {
    diag.mocFile = fr.Moc
    const r = resolve(fr.Moc)
    fr.Moc = r.url
    diag.mocResolved = r.resolved
    if (r.resolved) probeTargets.push({ label: fr.Moc.split('/').pop() ?? 'moc3', url: r.url })
    else diag.unresolvedPaths.push(diag.mocFile!)
  }

  // ── Textures ──
  if (Array.isArray(fr.Textures)) {
    diag.textureCount = fr.Textures.length
    fr.Textures = fr.Textures.map((t: string, i: number) => {
      const r = resolve(t)
      if (r.resolved) {
        diag.texturesResolved++
        probeTargets.push({ label: `texture[${i}] ${t.split('/').pop()}`, url: r.url })
      } else {
        diag.unresolvedPaths.push(t)
      }
      return r.url
    })
  }

  // ── Physics ──
  if (fr.Physics) {
    diag.physicsFile = fr.Physics
    const r = resolve(fr.Physics)
    fr.Physics = r.url
    diag.physicsResolved = r.resolved
    if (r.resolved) probeTargets.push({ label: fr.Physics.split('/').pop() ?? 'physics3.json', url: r.url })
    else diag.unresolvedPaths.push(diag.physicsFile!)
  }

  // ── Expressions ──
  if (Array.isArray(fr.Expressions)) {
    fr.Expressions = fr.Expressions.map((e: any, i: number) => {
      if (!e.File) return e
      const r = resolve(e.File)
      if (r.resolved) probeTargets.push({ label: `expression[${i}] ${e.File.split('/').pop()}`, url: r.url })
      else diag.unresolvedPaths.push(e.File)
      return { ...e, File: r.url }
    })
  }

  // ── Motions ──
  if (fr.Motions && typeof fr.Motions === 'object') {
    let motionIdx = 0
    for (const group of Object.values(fr.Motions) as any[][]) {
      if (!Array.isArray(group)) continue
      for (const m of group) {
        if (m.File) {
          const r = resolve(m.File)
          if (r.resolved) probeTargets.push({ label: `motion[${motionIdx}] ${m.File.split('/').pop()}`, url: r.url })
          else diag.unresolvedPaths.push(m.File)
          m.File = r.url
          motionIdx++
        }
        if (m.Sound) {
          const r = resolve(m.Sound)
          m.Sound = r.url
        }
      }
    }
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

  // ── Patched model3.json → blob URL ──
  const patchedBlob = new Blob([JSON.stringify(model3)], { type: 'application/json' })
  const model3Url = URL.createObjectURL(patchedBlob)

  // Prepend model3 itself to probe list
  probeTargets.unshift({ label: diag.model3Name!, url: model3Url })

  return {
    model3Url,
    probeTargets,
    allBlobUrls: [model3Url, ...blobUrls.values()],
    diagnostics: diag,
    patchedModel3: model3,
  }
}

// ──────────────────────────────────────────────
// Preflight: fetch every blob URL and record details
// ──────────────────────────────────────────────
async function runPreflight(probeTargets: Array<{ label: string; url: string }>): Promise<FetchProbe[]> {
  const results = await Promise.all(probeTargets.map(async ({ label, url }) => {
    let ok = false
    let status: number | null = null
    let contentType: string | null = null
    let error: string | undefined

    try {
      const res = await fetch(url)
      ok = res.ok
      status = res.status
      contentType = res.headers.get('content-type')
      // Drain body to avoid memory leak
      await res.arrayBuffer().catch(() => {})
    } catch (e) {
      error = (e as Error).message
    }

    return { label, url, ok, status, contentType, error } satisfies FetchProbe
  }))

  return results
}

// ──────────────────────────────────────────────
// Decode pixi-live2d-display NetworkError
// ──────────────────────────────────────────────
function parseNetworkError(e: unknown): {
  message: string
  url?: string
  status?: number | null
  aborted?: boolean
  stack?: string
} {
  if (!e || typeof e !== 'object') return { message: String(e) }
  const err = e as any
  return {
    message: err.message ?? 'Network error',
    url:     err.url     ?? undefined,
    status:  typeof err.status  === 'number' ? err.status  : undefined,
    aborted: typeof err.aborted === 'boolean' ? err.aborted : undefined,
    stack:   typeof err.stack   === 'string'  ? err.stack   : undefined,
  }
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useLive2D() {
  const pixiAppRef     = useRef<any>(null)
  const pixiCanvasRef  = useRef<HTMLCanvasElement | null>(null)
  const loadedRef      = useRef(false)
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
        model3Url, probeTargets, allBlobUrls,
        diagnostics: diag, patchedModel3,
      } = await prepareModel(files)
      allBlobUrlsRef.current = allBlobUrls

      // Record FileReferences snippet for manual verification
      const fr = patchedModel3.FileReferences ?? {}
      diag.patchedRefs = {
        Moc:      fr.Moc,
        Textures: Array.isArray(fr.Textures) ? fr.Textures : undefined,
        Physics:  fr.Physics,
      }
      setDiagnostics({ ...diag })

      // ── Step 2: Preflight — fetch every blob URL ──
      const probes = await runPreflight(probeTargets)
      const diagWithProbes = { ...diag, fetchProbes: probes }
      setDiagnostics(diagWithProbes)

      const failedProbes = probes.filter(p => !p.ok)
      if (failedProbes.length > 0) {
        const detail = failedProbes.map(p =>
          `${p.label}: ${p.error ?? `HTTP ${p.status}`}`
        ).join('\n')
        throw new Error(`Blob URL の fetch に失敗しました:\n${detail}`)
      }

      // ── Step 3: Load Cubism Core ──
      await loadCubismCore()

      // ── Step 4: PixiJS v7 — must set window.PIXI before pixi-live2d-display import ──
      const PIXI = await import('pixi.js')
      ;(window as any).PIXI = PIXI
      await new Promise<void>(r => setTimeout(r, 0))

      const { Live2DModel } = await import('pixi-live2d-display/cubism4')

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
