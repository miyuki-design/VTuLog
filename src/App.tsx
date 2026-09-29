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

      {diag && (<div>
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
