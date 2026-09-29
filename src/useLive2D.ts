import { useRef, useState, useCallback, useEffect } from 'react'

export const LIVE2D_CANVAS_SIZE = 512

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
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
}

export type Live2DStatus = 'idle' | 'loading' | 'loaded' | 'error'

const EMPTY_DIAG: Live2DDiagnostics = {
  fileCount: 0,
  model3Name: null,
  mocFile: null, mocResolved: false,
  textureCount: 0, texturesResolved: 0,
  physicsFile: null, physicsResolved: false,
  unresolvedPaths: [],
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
// File map builder
// Registers each file under multiple lookup keys so that any of
// these reference styles in model3.json will resolve:
//   "foo.moc3"               → basename
//   "textures/foo.png"       → path relative to model3.json dir
//   "./textures/foo.png"     → same, with leading ./
//   "ModelFolder/foo.moc3"   → full webkitRelativePath
// ──────────────────────────────────────────────
function buildFileMap(files: File[], model3File: File): Map<string, File> {
  const map = new Map<string, File>()

  // Directory containing model3.json (e.g. "ModelFolder/sub/")
  const model3Dir = model3File.webkitRelativePath
    ? model3File.webkitRelativePath.split('/').slice(0, -1).join('/') + '/'
    : ''

  for (const f of files) {
    const wp = f.webkitRelativePath ?? ''

    // 1. Full webkitRelativePath   e.g. "ModelFolder/textures/idle.png"
    if (wp) map.set(wp, f)

    // 2. Path relative to model3.json's directory  e.g. "textures/idle.png"
    if (wp && model3Dir && wp.startsWith(model3Dir)) {
      const rel = wp.slice(model3Dir.length)
      if (rel) map.set(rel, f)
    }

    // 3. Basename only  e.g. "idle.png"
    //    (set last so a relative path match wins over plain name collisions)
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

    const norm = p.startsWith('./') ? p.slice(2) : p  // strip leading ./

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
// Model preparation: parse model3.json, replace all paths with blob URLs
// ──────────────────────────────────────────────
interface PrepareResult {
  model3Url: string
  allBlobUrls: string[]
  diagnostics: Live2DDiagnostics
}

async function prepareModel(files: File[]): Promise<PrepareResult> {
  const diag: Live2DDiagnostics = { ...EMPTY_DIAG, fileCount: files.length }

  // ── Find model3.json ──
  const model3File = files.find(f => f.name.endsWith('.model3.json'))
  if (!model3File) throw new Error('.model3.json が見つかりません（フォルダごと選択されましたか？）')
  diag.model3Name = model3File.name

  const fileMap = buildFileMap(files, model3File)
  const blobUrls = new Map<File, string>()
  const resolve = makeResolver(fileMap, blobUrls)

  // ── Parse model3.json ──
  let model3: any
  try {
    model3 = JSON.parse(await model3File.text())
  } catch {
    throw new Error(`${model3File.name} の JSON 解析に失敗しました`)
  }
  const fr: any = model3.FileReferences ?? {}

  // ── Moc ──
  if (fr.Moc) {
    diag.mocFile = fr.Moc
    const r = resolve(fr.Moc)
    fr.Moc = r.url
    diag.mocResolved = r.resolved
    if (!r.resolved) diag.unresolvedPaths.push(fr.Moc)
  } else {
    diag.mocFile = null
    diag.mocResolved = false
  }

  // ── Textures ──
  if (Array.isArray(fr.Textures)) {
    diag.textureCount = fr.Textures.length
    fr.Textures = fr.Textures.map((t: string) => {
      const r = resolve(t)
      if (r.resolved) diag.texturesResolved++
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
    if (!r.resolved) diag.unresolvedPaths.push(fr.Physics)
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

  // ── Patched model3.json → blob URL ──
  const patchedBlob = new Blob([JSON.stringify(model3)], { type: 'application/json' })
  const model3Url = URL.createObjectURL(patchedBlob)

  return {
    model3Url,
    allBlobUrls: [model3Url, ...blobUrls.values()],
    diagnostics: diag,
  }
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────
export function useLive2D() {
  const pixiAppRef = useRef<any>(null)
  const pixiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedRef = useRef(false)
  const allBlobUrlsRef = useRef<string[]>([])

  const [status, setStatus] = useState<Live2DStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [modelName, setModelName] = useState('')
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

    // Show file count and model3 name immediately
    const model3File = files.find(f => f.name.endsWith('.model3.json'))
    const initialName = model3File?.name.replace('.model3.json', '') ?? 'モデル'
    setModelName(initialName)
    setDiagnostics({
      ...EMPTY_DIAG,
      fileCount: files.length,
      model3Name: model3File?.name ?? null,
    })

    try {
      // Step 1: Prepare files (resolve paths → blob URLs, collect diagnostics)
      const { model3Url, allBlobUrls, diagnostics: diag } = await prepareModel(files)
      allBlobUrlsRef.current = allBlobUrls
      setDiagnostics(diag)  // update with full diagnostics before heavy load

      // Step 2: Load Cubism Core
      await loadCubismCore()

      // Step 3: Dynamic import after core is available
      const PIXI = await import('pixi.js')
      ;(window as any).PIXI = PIXI
      const { Live2DModel } = await import('pixi-live2d-display/cubism4')

      // Step 4: Create PixiJS app + load model
      const app = new PIXI.Application({
        width: LIVE2D_CANVAS_SIZE,
        height: LIVE2D_CANVAS_SIZE,
        backgroundAlpha: 0,
        preserveDrawingBuffer: true,
        antialias: true,
        powerPreference: 'low-power',
      })
      pixiAppRef.current = app
      pixiCanvasRef.current = app.view as HTMLCanvasElement

      const model = await (Live2DModel as any).from(model3Url)
      app.stage.addChild(model)

      const sc = Math.min(
        (LIVE2D_CANVAS_SIZE * 0.9) / model.width,
        (LIVE2D_CANVAS_SIZE * 0.9) / model.height,
      )
      model.scale.set(sc)
      model.position.set(
        (LIVE2D_CANVAS_SIZE - model.width * sc) / 2,
        (LIVE2D_CANVAS_SIZE - model.height * sc) / 2,
      )

      loadedRef.current = true
      setStatus('loaded')
    } catch (e) {
      const msg = (e as Error).message ?? 'モデルの読み込みに失敗しました'
      setErrorMsg(msg)
      setStatus('error')
      // keep diagnostics so user can see what was/wasn't resolved
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
