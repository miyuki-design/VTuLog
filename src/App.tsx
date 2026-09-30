import { useState, useEffect, useRef, useCallback } from 'react'
import { useLive2D, LIVE2D_CANVAS_SIZE, type Live2DDiagnostics, type NormalizedFileInfo } from './useLive2D'

type AppState = 'idle' | 'recording' | 'preview' | 'playing'

const PRESET_AVATARS = [
  { id: 'hana', name: 'ハナ', color: '#FF3FA4', hair: '#FF8BC8', eye: '#00E5FF' },
  { id: 'luna', name: 'ルナ', color: '#7B2FFF', hair: '#C9A0FF', eye: '#FFD700' },
  { id: 'sora', name: 'ソラ', color: '#00BFFF', hair: '#80DFFF', eye: '#FF69B4' },
]

function AvatarFace({ avatar, size = 80, animated = true }: {
  avatar: typeof PRESET_AVATARS[0]; size?: number; animated?: boolean
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
      className={animated ? 'animate-float-avatar' : ''}
      style={{ filter: `drop-shadow(0 0 8px ${avatar.color}88)` }}>
      <ellipse cx="50" cy="54" rx="30" ry="32" fill="#FFE0C8" />
      <ellipse cx="50" cy="42" rx="32" ry="28" fill={avatar.hair} />
      <path d="M20 42 Q22 18 50 16 Q78 18 80 42 Q70 30 50 28 Q30 30 20 42Z" fill={avatar.hair} />
      <ellipse cx="50" cy="56" rx="26" ry="28" fill="#FFE8D6" />
      <ellipse cx="40" cy="52" rx="6" ry="7" fill="white" />
      <ellipse cx="60" cy="52" rx="6" ry="7" fill="white" />
      <ellipse cx="40" cy="53" rx="4" ry="5" fill={avatar.eye} />
      <ellipse cx="60" cy="53" rx="4" ry="5" fill={avatar.eye} />
      <ellipse cx="41" cy="51" rx="1.5" ry="1.5" fill="white" />
      <ellipse cx="61" cy="51" rx="1.5" ry="1.5" fill="white" />
      <ellipse cx="34" cy="60" rx="5" ry="3" fill="#FFB3C8" opacity="0.6" />
      <ellipse cx="66" cy="60" rx="5" ry="3" fill="#FFB3C8" opacity="0.6" />
      <path d="M43 66 Q50 72 57 66" stroke="#E8968A" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="22" cy="56" rx="5" ry="6" fill="#FFE0C8" />
      <ellipse cx="78" cy="56" rx="5" ry="6" fill="#FFE0C8" />
    </svg>
  )
}

function buildPresetSVG(av: typeof PRESET_AVATARS[0]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">
    <ellipse cx="50" cy="54" rx="30" ry="32" fill="#FFE0C8"/>
    <ellipse cx="50" cy="42" rx="32" ry="28" fill="${av.hair}"/>
    <path d="M20 42 Q22 18 50 16 Q78 18 80 42 Q70 30 50 28 Q30 30 20 42Z" fill="${av.hair}"/>
    <ellipse cx="50" cy="56" rx="26" ry="28" fill="#FFE8D6"/>
    <ellipse cx="40" cy="52" rx="6" ry="7" fill="white"/>
    <ellipse cx="60" cy="52" rx="6" ry="7" fill="white"/>
    <ellipse cx="40" cy="53" rx="4" ry="5" fill="${av.eye}"/>
    <ellipse cx="60" cy="53" rx="4" ry="5" fill="${av.eye}"/>
    <ellipse cx="41" cy="51" rx="1.5" ry="1.5" fill="white"/>
    <ellipse cx="61" cy="51" rx="1.5" ry="1.5" fill="white"/>
    <ellipse cx="34" cy="60" rx="5" ry="3" fill="#FFB3C8" opacity="0.6"/>
    <ellipse cx="66" cy="60" rx="5" ry="3" fill="#FFB3C8" opacity="0.6"/>
    <path d="M43 66 Q50 72 57 66" stroke="#E8968A" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="22" cy="56" rx="5" ry="6" fill="#FFE0C8"/>
    <ellipse cx="78" cy="56" rx="5" ry="6" fill="#FFE0C8"/>
  </svg>`
}

// ── Live2D Diagnostics Panel ──
const MONO: React.CSSProperties = { fontFamily: 'monospace', fontSize: '9px', wordBreak: 'break-all', lineHeight: 1.5 }
const MUTED = '#8B82B0'
const CYAN  = '#00E5FF'
const RED   = '#FF6B6B'
const RED2  = '#FF9999'

function DiagRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  const icon = ok === null ? '⋯' : ok ? '✓' : '✗'
  const col  = ok === null ? MUTED : ok ? CYAN : RED
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontSize: '11px', lineHeight: 1.7 }}>
      <span style={{ color: col, width: '14px', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: MUTED, flex: 1 }}>{label}</span>
      {detail && <span style={{ color: col, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>{detail}</span>}
    </div>
  )
}

function Live2DDiagPanel({
  diag, status, errorMsg,
}: {
  diag: Live2DDiagnostics | null
  status: string
  errorMsg: string | null
}) {
  if (!diag && status === 'idle') return null

  const isError = status === 'error'
  const border  = isError ? '1px solid rgba(255,107,107,0.5)' : '1px solid rgba(0,229,255,0.22)'

  return (
    <div className="rounded-2xl animate-fade-in" style={{ background: 'rgba(10,8,26,0.95)', border, marginTop: '10px', padding: '10px 12px', maxHeight: '55vh', overflowY: 'auto' }}>

      <p style={{ fontSize: '10px', color: isError ? RED2 : MUTED, fontFamily: 'var(--font-display)', marginBottom: '6px', letterSpacing: '0.05em' }}>
        {status === 'loading' ? '解析中…' : isError ? '読み込みエラー' : '診断ログ'}
      </p>

      {diag && (<>
        {/* ── 1. File inventory ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <DiagRow label="選択ファイル数" ok={diag.fileCount > 0}      detail={`${diag.fileCount} 件`} />
          <DiagRow label="model3.json"   ok={diag.model3Name !== null} detail={diag.model3Name ?? '未検出'} />
          <DiagRow label=".moc3"         ok={diag.mocFile !== null}    detail={diag.mocFile ?? '未検出'} />
          <DiagRow
            label="テクスチャ"
            ok={diag.textureCount > 0 ? true : null}
            detail={diag.textureCount > 0 ? `${diag.textureCount} 枚` : '未検出'}
          />
          <DiagRow
            label="physics3.json"
            ok={diag.physicsFile !== null ? true : null}
            detail={diag.physicsFile ?? 'なし'}
          />
        </div>

        {/* ── 2. Path resolution (moc match check) ── */}
        {(diag.settingsUrl || diag.resolvedMocPath) && (
          <div style={{ marginTop: '8px', padding: '6px 8px', borderRadius: '7px', background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)' }}>
            <p style={{ fontSize: '9px', color: CYAN, marginBottom: '4px', fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>パス解決</p>
            {diag.settingsUrl && (
              <p style={{ ...MONO, color: MUTED }}><span style={{ color: '#5A527A' }}>settings.url:      </span>{diag.settingsUrl}</p>
            )}
            {/* raw paths */}
            {diag.resolvedMocPath && (
              <p style={{ ...MONO, color: MUTED }}><span style={{ color: '#5A527A' }}>resolveURL(raw):   </span>{diag.resolvedMocPath}</p>
            )}
            {diag.mocNormalizedPath && (
              <p style={{ ...MONO, color: MUTED }}><span style={{ color: '#5A527A' }}>webkit(raw):       </span>{diag.mocNormalizedPath}</p>
            )}
            {/* encoded comparison — this is what FileLoader actually compares */}
            {diag.encodedMocPath && (
              <p style={{ ...MONO, color: diag.mocPathMatch === false ? RED : CYAN }}>
                <span style={{ color: '#5A527A' }}>resolveURL(enc):   </span>{diag.encodedMocPath}
              </p>
            )}
            {diag.encodedMocWebkit && (
              <p style={{ ...MONO, color: diag.mocPathMatch === false ? RED : CYAN }}>
                <span style={{ color: '#5A527A' }}>webkit(enc):       </span>{diag.encodedMocWebkit}
                {diag.mocPathMatch !== null && (
                  <span style={{ marginLeft: '6px', color: diag.mocPathMatch ? CYAN : RED, fontFamily: 'var(--font-display)' }}>
                    {diag.mocPathMatch ? '✓ 一致' : '✗ 不一致'}
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* ── 3. Per-file normalization log ── */}
        {diag.normalizedFiles.length > 0 && (
          <div style={{ marginTop: '6px' }}>
            <p style={{ fontSize: '9px', color: MUTED, marginBottom: '3px', fontFamily: 'var(--font-display)' }}>
              webkitRelativePath 正規化 ({diag.normalizedFiles.length}件)
            </p>
            <div style={{ maxHeight: '100px', overflowY: 'auto', padding: '4px 6px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }}>
              {(diag.normalizedFiles as NormalizedFileInfo[]).map((f, i) => {
                const changed = f.originalPath !== f.normalizedPath
                return (
                  <div key={i} style={{ marginBottom: '3px' }}>
                    <p style={{ ...MONO, color: changed ? CYAN : '#5A527A' }}>{f.name}</p>
                    {changed && (
                      <>
                        <p style={{ ...MONO, color: '#5A527A', paddingLeft: '8px' }}>旧: {f.originalPath || '(空)'}</p>
                        <p style={{ ...MONO, color: CYAN,     paddingLeft: '8px' }}>新: {f.normalizedPath}</p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </>)}

      {/* Error message */}
      {isError && errorMsg && (
        <div style={{ marginTop: '8px', padding: '8px', borderRadius: '8px', background: 'rgba(255,59,59,0.12)' }}>
          <p style={{ fontSize: '10px', color: RED2, lineHeight: 1.6, whiteSpace: 'pre-line', wordBreak: 'break-all' }}>{errorMsg}</p>
        </div>
      )}

      {/* NetworkError detail */}
      {isError && diag && (diag.networkErrorUrl || diag.networkErrorStatus != null || diag.networkErrorStack) && (
        <div style={{ marginTop: '6px', padding: '7px 9px', borderRadius: '8px', background: 'rgba(255,59,59,0.07)', border: '1px solid rgba(255,107,107,0.2)' }}>
          <p style={{ fontSize: '9px', color: RED2, marginBottom: '4px', fontFamily: 'var(--font-display)' }}>NetworkError 詳細</p>
          {diag.networkErrorUrl     && <p style={{ ...MONO, color: RED }}>url: {diag.networkErrorUrl}</p>}
          {diag.networkErrorStatus != null && <p style={{ ...MONO, color: RED }}>status: {diag.networkErrorStatus}</p>}
          {diag.networkErrorAborted && <p style={{ ...MONO, color: RED2 }}>aborted: true</p>}
          {diag.networkErrorStack   && (
            <>
              <p style={{ fontSize: '9px', color: MUTED, marginTop: '4px' }}>stack:</p>
              <p style={{ ...MONO, color: '#6A6290', maxHeight: '60px', overflow: 'hidden' }}>
                {diag.networkErrorStack.split('\n').slice(0, 5).join('\n')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

function getTouchDist(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
}

// Internal canvas resolution (portrait 9:16)
const CW = 1080
const CH = 1920

export default function App() {
  // ── Camera ──
  const hiddenVideoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // ── Canvas ──
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  // ── Avatar ──
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null)
  const avatarImgRef = useRef<HTMLImageElement | null>(null)
  const presetSvgImgRef = useRef<HTMLImageElement | null>(null)
  const useCustomRef = useRef(false)
  const [useCustom, setUseCustom] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [avatarName, setAvatarName] = useState('マイVTuber')
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [showNameInput, setShowNameInput] = useState(false)

  // ── Avatar transform (refs for draw loop, state for UI) ──
  const vtPosRef = useRef({ x: CW - 220, y: CH - 300 })
  const vtScaleRef = useRef(1)
  const [vtScale, setVtScale] = useState(1)

  const saveAvatarTransform = useCallback(() => {
  localStorage.setItem(
    'vtulog-avatar-transform',
    JSON.stringify({
      x: vtPosRef.current.x,
      y: vtPosRef.current.y,
      scale: vtScaleRef.current,
    })
  )
}, [])
  
  // ── Drag ──
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  // ── Pinch ──
  const pinchStartDistRef = useRef(0)
  const pinchStartScaleRef = useRef(1)
  const pinchCenterRef = useRef({ x: 0, y: 0 })
  const pinchStartPosRef = useRef({ x: 0, y: 0 })

  // ── Recording ──
  const [appState, setAppState] = useState<AppState>('idle')
  const [recordingTime, setRecordingTime] = useState(0)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [playbackDuration, setPlaybackDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordedBlobRef = useRef<Blob | null>(null)
  const recordedMimeTypeRef = useRef('video/webm')
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Live2D ──
  const live2d = useLive2D()
  const useLive2DRef = useRef(false)
  const live2dFolderInputRef = useRef<HTMLInputElement>(null)

  // ── UI ──
  const [showSaved, setShowSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [micError, setMicError] = useState<string | null>(null)
  const [videoTrackInfo, setVideoTrackInfo] = useState('')

  const isCapturing = appState === 'idle' || appState === 'recording'
  const isPreviewMode = appState === 'preview' || appState === 'playing'
  const presetAvatar = PRESET_AVATARS[selectedPreset]
  const isLive2DActive = live2d.status === 'loaded'
  const displayAvatarName = isLive2DActive ? live2d.modelName : useCustom ? avatarName : presetAvatar.name
  const displayAvatarColor = isLive2DActive ? '#00E5FF' : useCustom ? '#FF3FA4' : presetAvatar.color

  // ── Camera init ──
  useEffect(() => {
    let localStream: MediaStream | null = null
    ;(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } ,frameRate: { ideal: 30, max: 30 },},
          audio: false,
        })
        localStream = s
        cameraStreamRef.current = s
        const v = hiddenVideoRef.current!
        v.srcObject = s
        v.onloadedmetadata = () => { v.play(); setCameraReady(true) }
      } catch (e) {
        setCameraError((e as Error).name === 'NotAllowedError' ? 'カメラへのアクセスが拒否されました' : 'カメラを起動できませんでした')
      }
    })()
    return () => localStream?.getTracks().forEach(t => t.stop())
  }, [])

  // ── Load avatar image ──
  useEffect(() => {
    if (!customAvatarUrl) { avatarImgRef.current = null; return }
    const img = new Image()
    img.onload = () => {
      avatarImgRef.current = img
      const scale = Math.min(220 / img.naturalWidth, 220 / img.naturalHeight)
      vtScaleRef.current = scale
      setVtScale(scale)
      vtPosRef.current = {
        x: CW - img.naturalWidth * scale - 20,
        y: CH - img.naturalHeight * scale - 100,
      }
    }
    img.src = customAvatarUrl
  }, [customAvatarUrl])

  // ── Sync useCustom to ref ──
  useEffect(() => { useCustomRef.current = useCustom }, [useCustom])

  // ── Sync Live2D loaded state to ref + set initial position ──
  useEffect(() => {
  useLive2DRef.current = live2d.status === 'loaded'

  if (live2d.status === 'loaded') {
    const saved = localStorage.getItem('vtulog-avatar-transform')

    if (saved) {
      try {
        const { x, y, scale } = JSON.parse(saved)

        vtPosRef.current = { x, y }
        vtScaleRef.current = scale
        setVtScale(scale)
      } catch {
        const displayPx = 240
        const sc = displayPx / LIVE2D_CANVAS_SIZE

        vtScaleRef.current = sc
        setVtScale(sc)
        vtPosRef.current = {
          x: CW - LIVE2D_CANVAS_SIZE * sc - 20,
          y: CH - LIVE2D_CANVAS_SIZE * sc - 100,
        }
      }
    } else {
      const displayPx = 240
      const sc = displayPx / LIVE2D_CANVAS_SIZE

      vtScaleRef.current = sc
      setVtScale(sc)
      vtPosRef.current = {
        x: CW - LIVE2D_CANVAS_SIZE * sc - 20,
        y: CH - LIVE2D_CANVAS_SIZE * sc - 100,
      }
    }

    setShowAvatarPicker(false)
  }
}, [live2d.status])

  // ── Load preset SVG into Image ──
  useEffect(() => {
    const av = PRESET_AVATARS[selectedPreset]
    const blob = new Blob([buildPresetSVG(av)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image(200, 200)
    img.onload = () => {
      presetSvgImgRef.current = img
      URL.revokeObjectURL(url)
      // init position bottom-right (scale 1 = 200×200px on canvas)
      if (!useCustomRef.current) {
        vtScaleRef.current = 1
        setVtScale(1)
        vtPosRef.current = { x: CW - 200 - 20, y: CH - 200 - 100 }
      }
    }
    img.src = url
  }, [selectedPreset])

  // ── Draw loop ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const draw = () => {
      const video = hiddenVideoRef.current
      ctx.clearRect(0, 0, CW, CH)

      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const vw = video.videoWidth, vh = video.videoHeight
        const r = Math.max(CW / vw, CH / vh)
        const dw = vw * r, dh = vh * r
        ctx.drawImage(video, (CW - dw) / 2, (CH - dh) / 2, dw, dh)
      } else {
        ctx.fillStyle = '#0D0B1E'
        ctx.fillRect(0, 0, CW, CH)
        ctx.strokeStyle = 'rgba(0,229,255,0.06)'
        ctx.lineWidth = 1
        for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke() }
        for (let y = 0; y < CH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke() }
      }

      const { x, y } = vtPosRef.current
      const sc = vtScaleRef.current
      if (useLive2DRef.current && live2d.pixiCanvasRef.current) {
        const sz = LIVE2D_CANVAS_SIZE * sc
        ctx.drawImage(live2d.pixiCanvasRef.current, 0, 0, LIVE2D_CANVAS_SIZE, LIVE2D_CANVAS_SIZE, x, y, sz, sz)
      } else {
        const img = useCustomRef.current ? avatarImgRef.current : presetSvgImgRef.current
        if (img && img.complete) {
          ctx.drawImage(img, x, y, img.naturalWidth * sc, img.naturalHeight * sc)
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // ── Coordinate helpers ──
  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left) * (CW / rect.width),
      y: (clientY - rect.top) * (CH / rect.height),
    }
  }, [])

  const hitTest = useCallback((cx: number, cy: number) => {
    const { x, y } = vtPosRef.current
    const sc = vtScaleRef.current
    if (useLive2DRef.current) {
      const sz = LIVE2D_CANVAS_SIZE * sc
      return cx >= x && cx <= x + sz && cy >= y && cy <= y + sz
    }
    const img = useCustomRef.current ? avatarImgRef.current : presetSvgImgRef.current
    if (!img) return false
    return cx >= x && cx <= x + img.naturalWidth * sc && cy >= y && cy <= y + img.naturalHeight * sc
  }, [])

  // ── Mouse drag ──
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = clientToCanvas(e.clientX, e.clientY)
    if (hitTest(pt.x, pt.y)) {
      isDraggingRef.current = true
      dragOffsetRef.current = { x: pt.x - vtPosRef.current.x, y: pt.y - vtPosRef.current.y }
      e.preventDefault()
    }
  }, [clientToCanvas, hitTest])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return
    const pt = clientToCanvas(e.clientX, e.clientY)
    vtPosRef.current = { x: pt.x - dragOffsetRef.current.x, y: pt.y - dragOffsetRef.current.y }
    e.preventDefault()
  }, [clientToCanvas])

 const onMouseUp = useCallback(() => {
  isDraggingRef.current = false
  saveAvatarTransform()
}, [saveAvatarTransform])

  // ── Touch drag + pinch ──
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const pt = clientToCanvas(e.touches[0].clientX, e.touches[0].clientY)
      if (hitTest(pt.x, pt.y)) {
        isDraggingRef.current = true
        dragOffsetRef.current = { x: pt.x - vtPosRef.current.x, y: pt.y - vtPosRef.current.y }
        e.preventDefault()
      }
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false
      pinchStartDistRef.current = getTouchDist(e.touches[0], e.touches[1])
      pinchStartScaleRef.current = vtScaleRef.current
      // pivot = midpoint of pinch in canvas coords
      const mid = clientToCanvas(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2,
      )
      pinchCenterRef.current = mid
      pinchStartPosRef.current = { ...vtPosRef.current }
      e.preventDefault()
    }
  }, [clientToCanvas, hitTest])

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && isDraggingRef.current) {
      const pt = clientToCanvas(e.touches[0].clientX, e.touches[0].clientY)
      vtPosRef.current = { x: pt.x - dragOffsetRef.current.x, y: pt.y - dragOffsetRef.current.y }
      e.preventDefault()
    } else if (e.touches.length === 2) {
      const dist = getTouchDist(e.touches[0], e.touches[1])
      const newScale = Math.max(0.08, Math.min(5, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)))
      // scale around pinch center
      const ratio = newScale / pinchStartScaleRef.current
      const pivot = pinchCenterRef.current
      const startPos = pinchStartPosRef.current
      vtPosRef.current = {
        x: pivot.x - (pivot.x - startPos.x) * ratio,
        y: pivot.y - (pivot.y - startPos.y) * ratio,
      }
      vtScaleRef.current = newScale
      setVtScale(newScale)
      e.preventDefault()
    }
  }, [clientToCanvas])

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) {
      // pinch ended — re-anchor if one finger remains
      if (e.touches.length === 1) {
        const pt = clientToCanvas(e.touches[0].clientX, e.touches[0].clientY)
        if (hitTest(pt.x, pt.y)) {
          isDraggingRef.current = true
          dragOffsetRef.current = { x: pt.x - vtPosRef.current.x, y: pt.y - vtPosRef.current.y }
        }
      } else {
        isDraggingRef.current = false
      }
    }
  saveAvatarTransform()
}, [clientToCanvas, hitTest, saveAvatarTransform])

  // ── Scale buttons ──
  const adjustScale = useCallback((delta: number) => {
    const ns = Math.max(0.08, Math.min(5, vtScaleRef.current + delta))
    vtScaleRef.current = ns
    setVtScale(ns)
    saveAvatarTransform()
  }, [saveAvatarTransform])

  // ── Live2D folder upload ──
  const handleLive2DUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    live2d.loadModel(files)
    e.target.value = ''
  }, [live2d])

  // ── Image file upload ──
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setCustomAvatarUrl(ev.target!.result as string)
      setUseCustom(true)
      useCustomRef.current = true
      setShowAvatarPicker(false)
      setShowNameInput(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [])

  // ── Start recording ──
  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setMicError(null)
    recordedChunksRef.current = []
    recordedBlobRef.current = null

    let audioStream: MediaStream | null = null
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    sampleRate: { ideal: 48000 },
    channelCount: { ideal: 1 },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
})
      audioStreamRef.current = audioStream
    } catch {
      setMicError('マイクへのアクセスが拒否されました（映像のみ録画）')
    }

    const canvasStream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30)
    const videoTrack = canvasStream.getVideoTracks()[0]
    const settings = videoTrack.getSettings()

    setVideoTrackInfo(
    `Canvas: ${canvas.width}×${canvas.height} / Track: ${settings.width ?? '?'}×${settings.height ?? '?'} / ${settings.frameRate ?? '?'}fps`
    )
    
    const tracks = [...canvasStream.getVideoTracks(), ...(audioStream?.getAudioTracks() ?? [])]
    const combined = new MediaStream(tracks)

    const mimeCandidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]

    const mimeType = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type)) ?? ''

    const recorderOptions: MediaRecorderOptions = {
  videoBitsPerSecond: 12_000_000,
  audioBitsPerSecond: 192_000,
}

if (mimeType) {
  recorderOptions.mimeType = mimeType
}

let mr: MediaRecorder

try {
  mr = new MediaRecorder(combined, recorderOptions)
} catch {
  try {
    mr = mimeType
      ? new MediaRecorder(combined, { mimeType })
      : new MediaRecorder(combined)
  } catch {
    mr = new MediaRecorder(combined)
  }
}

    const actualMimeType = mr.mimeType || mimeType || 'video/webm'
    recordedMimeTypeRef.current = actualMimeType

    mr.ondataavailable = ev => {
      if (ev.data.size > 0) recordedChunksRef.current.push(ev.data)
    }

    mr.onstop = () => {
      audioStreamRef.current?.getTracks().forEach(t => t.stop())
      audioStreamRef.current = null

      const blob = new Blob(recordedChunksRef.current, { type: actualMimeType })
      recordedBlobRef.current = blob

      if (previewVideoRef.current) {
        previewVideoRef.current.src = URL.createObjectURL(blob)
      }
    }
    mr.start(1000)
    mediaRecorderRef.current = mr

    setRecordingTime(0)
    setAppState('recording')
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
  }, [])

  // ── Stop recording ──
  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    const dur = recordingTime || 1
    setPlaybackDuration(dur)
    setPlaybackTime(0)

    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    mediaRecorderRef.current = null
    setAppState('preview')
  }, [recordingTime])

  // ── Playback ──
  const startPlayback = useCallback(() => {
    setPlaybackTime(0)
    setAppState('playing')
    const pv = previewVideoRef.current
    if (pv && recordedBlobRef.current) {
      pv.currentTime = 0
      pv.play()
      pv.onended = () => { setAppState('preview'); setPlaybackTime(0) }
    }
    playbackTimerRef.current = setInterval(() => {
      setPlaybackTime(t => {
        if (t + 1 >= playbackDuration) { clearInterval(playbackTimerRef.current!); return t + 1 }
        return t + 1
      })
    }, 1000)
  }, [playbackDuration])

  const stopPlayback = useCallback(() => {
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current)
    previewVideoRef.current?.pause()
    setAppState('preview')
    setPlaybackTime(0)
  }, [])

  // ── Retake ──
  const retake = useCallback(async () => {
  if (playbackTimerRef.current) clearInterval(playbackTimerRef.current)

  const pv = previewVideoRef.current
  if (pv) {
    pv.pause()
    pv.src = ''
  }

  recordedBlobRef.current = null
  setRecordingTime(0)
  setPlaybackTime(0)
  setAppState('idle')

  // 保存画面などを挟んでカメラが停止していたら再起動
  const currentTrack = cameraStreamRef.current?.getVideoTracks()[0]

  if (!currentTrack || currentTrack.readyState !== 'live') {
    try {
      setCameraReady(false)
      setCameraError(null)

      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      })

      cameraStreamRef.current = s

      const v = hiddenVideoRef.current
      if (v) {
        v.srcObject = s
        await v.play()
        setCameraReady(true)
      }
    } catch (e) {
      setCameraError('カメラを再起動できませんでした')
    }
  }
}, [])

  // ── Save ──
  const save = useCallback(() => {
    const blob = recordedBlobRef.current
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ext = recordedMimeTypeRef.current.includes('mp4') ? 'mp4' : 'webm'
      a.href = url
      a.download = `VTuLog_${Date.now()}.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }
    setShowSaved(true)
    setTimeout(() => { setShowSaved(false); retake() }, 2200)
  }, [retake])

  // ── Cleanup ──
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current)
  }, [])

  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--color-bg)', fontFamily: 'var(--font-body)' }}>
      {/* hidden camera video source */}
      <video ref={hiddenVideoRef} autoPlay playsInline muted style={{ display: 'none' }} />

      {/* hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      {/* webkitdirectory lets user pick entire model folder */}
      <input
        ref={live2dFolderInputRef}
        type="file"
        // @ts-ignore – webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleLive2DUpload}
      />

      {/* phone frame */}
      <div
        className="relative overflow-hidden flex flex-col"
        style={{
          width: 'min(390px, 100vw)',
          height: 'min(844px, 100vh)',
          borderRadius: 'min(44px, 5vw)',
          background: 'var(--color-surface)',
          boxShadow: '0 0 0 1px rgba(123,47,255,0.4), 0 0 60px rgba(123,47,255,0.15), 0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* status bar */}
        <div className="flex items-center justify-between px-6 pt-3 pb-1 shrink-0 z-10"
          style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--color-muted)' }}>
          <span>9:41</span>
          <div className="flex gap-1 items-center">
            {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full" style={{ background: 'var(--color-muted)' }} />)}
            <div className="ml-1 w-5 h-2.5 rounded-sm border" style={{ borderColor: 'var(--color-muted)' }}>
              <div className="w-3/4 h-full rounded-sm" style={{ background: 'var(--color-cyan)' }} />
            </div>
          </div>
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-5 pb-2 shrink-0 z-10">
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 600, lineHeight: 1, color: 'var(--color-text)' }}>
            VTu<span style={{ color: 'var(--color-pink)' }}>Log</span>
          </h1>
          <div className="flex items-center gap-2">
            {isCapturing && cameraReady && (
              <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-cyan)' }} />
                <span style={{ fontSize: '10px', color: 'var(--color-cyan)', fontFamily: 'var(--font-display)' }}>LIVE</span>
              </div>
            )}
            {isPreviewMode && (
              <div className="glass rounded-full px-3 py-1" style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                {formatTime(playbackDuration)}
              </div>
            )}
          </div>
        </div>

        {videoTrackInfo && (
  <div
    style={{
      fontSize: '10px',
      color: 'var(--color-cyan)',
      padding: '4px 12px',
      textAlign: 'center',
      flexShrink: 0,
    }}
  >
    {videoTrackInfo}
  </div>
)}
        
        {/* viewfinder */}
        <div className="relative flex-1 mx-3 rounded-2xl overflow-hidden" style={{ minHeight: 0 }}>

          {/* ── Canvas (camera + composited avatar) ── */}
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: 'cover',
              display: isCapturing ? 'block' : 'none',
              cursor: useCustom && avatarImgRef.current ? 'grab' : 'default',
              touchAction: 'none',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />

          {/* Camera error/loading overlay */}
          {!cameraReady && isCapturing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: '#0D0B1E', zIndex: 5 }}>
              {cameraError ? (
                <>
                  <span style={{ fontSize: '36px' }}>📷</span>
                  <p style={{ fontSize: '13px', color: 'var(--color-muted)', textAlign: 'center', padding: '0 28px' }}>{cameraError}</p>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
                  <p style={{ fontSize: '12px', color: 'var(--color-muted)' }}>カメラ起動中…</p>
                </>
              )}
            </div>
          )}


          {/* ── Preview / playback video ── */}
          <video
            ref={previewVideoRef}
            playsInline
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover', display: isPreviewMode ? 'block' : 'none' }}
          />

          {/* Recording border */}
          {appState === 'recording' && (
            <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ border: '2px solid rgba(255,59,59,0.7)', zIndex: 15 }} />
          )}

          {/* Viewfinder corners */}
          {isCapturing && (
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 12 }}>
              {(['top-3 left-3 border-t-2 border-l-2 rounded-tl-lg',
                'top-3 right-3 border-t-2 border-r-2 rounded-tr-lg',
                'bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg',
                'bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg',
              ]).map(c => (
                <div key={c} className={`absolute w-6 h-6 ${c}`} style={{ borderColor: 'var(--color-cyan)', opacity: 0.55 }} />
              ))}
            </div>
          )}

          {/* REC indicator */}
          {appState === 'recording' && (
            <div className="absolute top-4 left-4 flex items-center gap-2 glass rounded-full px-3 py-1.5" style={{ zIndex: 20 }}>
              <div className="w-2 h-2 rounded-full animate-rec-blink" style={{ background: 'var(--color-rec)' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--color-rec)', fontWeight: 600 }}>
                REC {formatTime(recordingTime)}
              </span>
            </div>
          )}

          {/* Preview badge */}
          {isPreviewMode && (
            <div className="absolute top-4 left-4 glass rounded-full px-3 py-1.5 animate-fade-in" style={{ zIndex: 20 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--color-cyan)', fontWeight: 600 }}>
                {appState === 'playing' ? `▶ ${formatTime(playbackTime)}` : '⏸ プレビュー'}
              </span>
            </div>
          )}

          {/* Playback progress bar */}
          {isPreviewMode && (
            <div className="absolute bottom-0 left-0 right-0 h-1" style={{ zIndex: 20 }}>
              <div className="h-full progress-bar transition-all"
                style={{ width: appState === 'playing' ? `${(playbackTime / playbackDuration) * 100}%` : '100%', opacity: appState === 'playing' ? 1 : 0.3 }} />
            </div>
          )}

          {/* ── Avatar controls (scale + picker trigger) ── */}
          {isCapturing && (
            <div className="absolute left-3 bottom-4 flex flex-col gap-2" style={{ zIndex: 20 }}>
              {/* Avatar picker button */}
              <button
                className="glass rounded-xl px-2.5 py-2 flex items-center gap-1.5 transition-all active:scale-95"
                style={{ border: `1px solid ${displayAvatarColor}44` }}
                onClick={() => setShowAvatarPicker(v => !v)}
              >
                {useCustom && customAvatarUrl ? (
                  <img src={customAvatarUrl} className="w-5 h-5 rounded-md object-cover" alt="" />
                ) : (
                  <span style={{ fontSize: '14px' }}>👤</span>
                )}
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-display)', color: displayAvatarColor }}>
                  {displayAvatarName}
                </span>
              </button>

              {/* Scale controls */}
              {(isLive2DActive || (useCustom ? !!avatarImgRef.current : !!presetSvgImgRef.current)) && (
                <div className="glass rounded-xl flex items-center gap-1 px-2 py-1.5" style={{ border: '1px solid var(--color-border)' }}>
                  <button
                    className="w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'rgba(255,63,164,0.2)', fontSize: '14px', lineHeight: 1, color: 'var(--color-pink)' }}
                    onClick={() => adjustScale(-0.05)}
                  >−</button>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-display)', color: 'var(--color-muted)', minWidth: '32px', textAlign: 'center' }}>
                    {Math.round(vtScale * 100)}%
                  </span>
                  <button
                    className="w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'rgba(255,63,164,0.2)', fontSize: '14px', lineHeight: 1, color: 'var(--color-pink)' }}
                    onClick={() => adjustScale(0.05)}
                  >+</button>
                </div>
              )}
            </div>
          )}

          {/* Avatar picker popup */}
          {showAvatarPicker && (
            <div
              className="absolute bottom-16 left-3 glass rounded-2xl p-3 animate-zoom-in"
              style={{ zIndex: 30, width: '220px', border: '1px solid var(--color-border)' }}
              onClick={e => e.stopPropagation()}
            >
              <p style={{ fontSize: '10px', color: 'var(--color-muted)', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>プリセットキャラ</p>
              <div className="flex gap-2 mb-3">
                {PRESET_AVATARS.map((av, i) => (
                  <button key={av.id}
                    className="flex-1 flex flex-col items-center gap-1 rounded-xl py-2 transition-all"
                    style={{
                      background: !useCustom && selectedPreset === i ? `${av.color}22` : 'transparent',
                      border: !useCustom && selectedPreset === i ? `1px solid ${av.color}55` : '1px solid transparent',
                    }}
                    onClick={() => { setSelectedPreset(i); setUseCustom(false); useCustomRef.current = false; useLive2DRef.current = false; live2d.cleanup(); setShowAvatarPicker(false) }}
                  >
                    <AvatarFace avatar={av} size={34} animated={false} />
                    <span style={{ fontSize: '9px', color: av.color, fontFamily: 'var(--font-display)' }}>{av.name}</span>
                  </button>
                ))}
              </div>
              <div className="h-px mb-3" style={{ background: 'var(--color-border)' }} />
              <p style={{ fontSize: '10px', color: 'var(--color-muted)', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>オリジナルVTuber</p>
              {customAvatarUrl && (
                <button
                  className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 mb-2 transition-all"
                  style={{
                    background: useCustom ? 'rgba(255,63,164,0.15)' : 'transparent',
                    border: useCustom ? '1px solid rgba(255,63,164,0.4)' : '1px solid var(--color-border)',
                  }}
                  onClick={() => { setUseCustom(true); setShowAvatarPicker(false) }}
                >
                  <img src={customAvatarUrl} className="w-8 h-8 rounded-lg object-cover shrink-0" alt="" />
                  <span style={{ fontSize: '11px', color: 'var(--color-pink)', fontFamily: 'var(--font-display)', textAlign: 'left' }}>
                    {avatarName}
                  </span>
                  {useCustom && <span style={{ marginLeft: 'auto', fontSize: '14px' }}>✓</span>}
                </button>
              )}
              <button
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all active:scale-95"
                style={{ background: 'rgba(255,63,164,0.1)', border: '1px dashed rgba(255,63,164,0.45)' }}
                onClick={() => { setShowAvatarPicker(false); fileInputRef.current?.click() }}
              >
                <span style={{ fontSize: '16px' }}>📁</span>
                <span style={{ fontSize: '11px', color: 'var(--color-pink)', fontFamily: 'var(--font-display)' }}>
                  {customAvatarUrl ? '画像を変更' : 'VTuberをアップロード'}
                </span>
              </button>
              {(useCustom || isLive2DActive) && (
                <p style={{ fontSize: '9px', color: 'var(--color-muted)', marginTop: '8px', textAlign: 'center' }}>
                  ドラッグで移動・ピンチで拡縮
                </p>
              )}

              {/* ── moc3 / Live2D section ── */}
              <div className="h-px mt-3 mb-3" style={{ background: 'var(--color-border)' }} />
              <p style={{ fontSize: '10px', color: 'var(--color-muted)', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>
                Live2D moc3 モデル
              </p>

              {/* Loaded model row */}
              {live2d.status === 'loaded' && (
                <button
                  className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 mb-2 transition-all"
                  style={{
                    background: isLive2DActive ? 'rgba(0,229,255,0.15)' : 'transparent',
                    border: isLive2DActive ? '1px solid rgba(0,229,255,0.4)' : '1px solid var(--color-border)',
                  }}
                  onClick={() => { useLive2DRef.current = true; setUseCustom(false); useCustomRef.current = false; setShowAvatarPicker(false) }}
                >
                  <span style={{ fontSize: '18px' }}>🎭</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-cyan)', fontFamily: 'var(--font-display)', textAlign: 'left', flex: 1 }}>
                    {live2d.modelName}
                  </span>
                  {isLive2DActive && <span style={{ fontSize: '12px', color: 'var(--color-cyan)' }}>✓</span>}
                </button>
              )}

              {/* Folder select button */}
              <button
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all active:scale-95"
                style={{
                  background: live2d.status === 'loading' ? 'rgba(0,229,255,0.05)' : 'rgba(0,229,255,0.08)',
                  border: '1px dashed rgba(0,229,255,0.4)',
                  opacity: live2d.status === 'loading' ? 0.6 : 1,
                }}
                onClick={() => live2dFolderInputRef.current?.click()}
                disabled={live2d.status === 'loading'}
              >
                {live2d.status === 'loading'
                  ? <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
                  : <span style={{ fontSize: '16px' }}>📂</span>}
                <span style={{ fontSize: '11px', color: 'var(--color-cyan)', fontFamily: 'var(--font-display)' }}>
                  {live2d.status === 'loaded' ? 'モデルを変更' : live2d.status === 'loading' ? '読み込み中…' : 'モデルフォルダを選択'}
                </span>
              </button>
              <p style={{ fontSize: '9px', color: 'var(--color-muted)', marginTop: '6px', lineHeight: 1.6 }}>
                .model3.json を含むフォルダを丸ごと選択してください
              </p>

              {/* Diagnostics panel — shown while loading and on error */}
              {(live2d.status === 'loading' || live2d.status === 'error') && (
                <Live2DDiagPanel
                  diag={live2d.diagnostics}
                  status={live2d.status}
                  errorMsg={live2d.errorMsg}
                />
              )}
            </div>
          )}

          {/* Name input overlay */}
          {showNameInput && (
            <div className="absolute inset-0 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(13,11,30,0.88)', zIndex: 40 }}>
              <div className="glass rounded-3xl p-6 mx-6 w-full" style={{ border: '1px solid rgba(255,63,164,0.4)' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: 'var(--color-text)', marginBottom: '4px', fontWeight: 600 }}>
                  アップロード完了！
                </p>
                <p style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '16px' }}>
                  VTuberの名前を設定してください
                </p>
                <input
                  type="text"
                  value={avatarName}
                  onChange={e => setAvatarName(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 outline-none mb-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: 'var(--font-display)', fontSize: '16px' }}
                  autoFocus
                />
                <button
                  className="w-full rounded-xl py-2.5 transition-all active:scale-95 glow-pink"
                  style={{ background: 'linear-gradient(135deg, var(--color-pink), var(--color-purple))', fontFamily: 'var(--font-display)', fontSize: '14px', color: 'white', fontWeight: 600 }}
                  onClick={() => setShowNameInput(false)}
                >
                  決定
                </button>
              </div>
            </div>
          )}

          {/* tap-outside to close picker */}
          {showAvatarPicker && (
            <div className="absolute inset-0" style={{ zIndex: 25 }} onClick={() => setShowAvatarPicker(false)} />
          )}
        </div>

        {/* mic error notice */}
        {micError && isCapturing && (
          <div className="mx-3 mt-1.5 rounded-xl px-3 py-1.5 flex items-center gap-2 shrink-0"
            style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)' }}>
            <span style={{ fontSize: '12px' }}>🎙</span>
            <span style={{ fontSize: '10px', color: 'rgba(255,100,100,0.9)' }}>{micError}</span>
          </div>
        )}

        {/* controls */}
        <div className="shrink-0 px-5 pt-3 pb-6">

          {appState === 'idle' && (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <p style={{ fontSize: '11px', color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>
                ドラッグで移動 / ピンチ・ボタンで拡縮
              </p>
              <div className="relative">
                <div className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: 'var(--color-pink)', opacity: 0.3 }} />
                <button
                  className="relative w-20 h-20 rounded-full btn-record flex items-center justify-center glow-pink"
                  onClick={startRecording}
                  disabled={!!cameraError}
                  style={{ opacity: cameraError ? 0.45 : 1 }}
                >
                  <div className="w-6 h-6 rounded-full bg-white/90" />
                </button>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--color-muted)' }}>タップして録画開始</p>
            </div>
          )}

          {appState === 'recording' && (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-rec-blink" style={{ background: 'var(--color-rec)' }} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--color-rec)' }}>録画中…</span>
              </div>
              <button
                className="w-20 h-20 rounded-full btn-stop flex items-center justify-center glow-rec"
                onClick={stopRecording}
              >
                <div className="w-7 h-7 rounded-md" style={{ background: 'white' }} />
              </button>
              <p style={{ fontSize: '11px', color: 'var(--color-muted)' }}>タップして停止</p>
            </div>
          )}

          {appState === 'preview' && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--color-muted)' }}>録画時間</span>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--color-text)', fontWeight: 600 }}>
                    {formatTime(playbackDuration)}
                  </div>
                </div>
                <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{displayAvatarName}</div>
              </div>
              <div className="flex gap-3">
                <button className="flex-1 glass rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-all active:scale-95" onClick={retake}>
                  <span style={{ fontSize: '22px' }}>🔄</span>
                  <span style={{ fontSize: '12px', color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>撮り直し</span>
                </button>
                <button className="flex-1 rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-all active:scale-95"
                  style={{ background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.4)' }} onClick={startPlayback}>
                  <span style={{ fontSize: '22px' }}>▶️</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--color-cyan)' }}>再生</span>
                </button>
                <button className="flex-1 rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-all active:scale-95 glow-pink"
                  style={{ background: 'linear-gradient(135deg, var(--color-pink), var(--color-purple))' }} onClick={save}>
                  <span style={{ fontSize: '22px' }}>💾</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'white', fontWeight: 600 }}>保存</span>
                </button>
              </div>
            </div>
          )}

          {appState === 'playing' && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-3 px-1">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--color-cyan)' }}>{formatTime(playbackTime)}</span>
                <div className="flex-1 mx-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-panel)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(playbackTime / playbackDuration) * 100}%`, background: 'linear-gradient(90deg, var(--color-pink), var(--color-cyan))' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--color-muted)' }}>{formatTime(playbackDuration)}</span>
              </div>
              <button className="w-full glass rounded-2xl py-3.5 flex items-center justify-center gap-2 transition-all active:scale-95" onClick={stopPlayback}>
                <div className="w-4 h-4 rounded-sm" style={{ background: 'var(--color-cyan)' }} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--color-cyan)' }}>停止</span>
              </button>
            </div>
          )}
        </div>

        {/* saved toast */}
        {showSaved && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 50 }}>
            <div className="glass rounded-3xl px-8 py-6 flex flex-col items-center gap-3 animate-zoom-in"
              style={{ border: '1px solid rgba(255,63,164,0.5)', boxShadow: '0 0 40px rgba(255,63,164,0.3)' }}>
              <div style={{ fontSize: '48px' }}>✨</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--color-pink)', fontWeight: 600 }}>保存しました！</div>
              <div style={{ fontSize: '13px', color: 'var(--color-muted)' }}>端末にダウンロードされました</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
