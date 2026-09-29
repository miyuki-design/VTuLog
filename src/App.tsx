export default function App() {
  const sizes = [512, 180, 120, 60, 32]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0D0B1E',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '48px',
        padding: '48px 24px',
        fontFamily: 'var(--font-display, system-ui)',
      }}
    >
      {/* Label */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#FF3FA4', fontSize: '22px', fontWeight: 600, margin: 0, letterSpacing: '0.05em' }}>
          VTuLog
        </h1>
        <p style={{ color: '#8B82B0', fontSize: '12px', marginTop: '6px' }}>PWA アイコン プレビュー</p>
      </div>

      {/* Main icon */}
      <div style={{ borderRadius: '112px', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,63,164,0.3), 0 24px 80px rgba(0,0,0,0.6)' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
          {/* Background */}
          <rect width="512" height="512" fill="#C5EEFF"/>

          {/* Camera body */}
          <rect x="60" y="172" width="392" height="278" rx="48" fill="#FF3FA4"/>

          {/* Camera top bump */}
          <rect x="192" y="130" width="128" height="64" rx="22" fill="#FF3FA4"/>

          {/* Lens — white circle (camera lens + VTuber face stage) */}
          <circle cx="252" cy="311" r="116" fill="white"/>

          {/* Left eye iris */}
          <ellipse cx="214" cy="300" rx="27" ry="32" fill="#00CFFF"/>
          {/* Left pupil */}
          <circle cx="214" cy="305" r="14" fill="#0F0030"/>
          {/* Left catchlight */}
          <circle cx="222" cy="295" r="6" fill="white"/>

          {/* Right eye iris */}
          <ellipse cx="290" cy="300" rx="27" ry="32" fill="#00CFFF"/>
          {/* Right pupil */}
          <circle cx="290" cy="305" r="14" fill="#0F0030"/>
          {/* Right catchlight */}
          <circle cx="298" cy="295" r="6" fill="white"/>

          {/* Record dot */}
          <circle cx="406" cy="214" r="27" fill="#FF3B3B"/>
        </svg>
      </div>

      {/* Size preview row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {sizes.map(s => {
          const radius = Math.round(s * 0.22)
          return (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ borderRadius: `${radius}px`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={s} height={s}>
                  <rect width="512" height="512" fill="#C5EEFF"/>
                  <rect x="60" y="172" width="392" height="278" rx="48" fill="#FF3FA4"/>
                  <rect x="192" y="130" width="128" height="64" rx="22" fill="#FF3FA4"/>
                  <circle cx="252" cy="311" r="116" fill="white"/>
                  <ellipse cx="214" cy="300" rx="27" ry="32" fill="#00CFFF"/>
                  <circle cx="214" cy="305" r="14" fill="#0F0030"/>
                  <circle cx="222" cy="295" r="6" fill="white"/>
                  <ellipse cx="290" cy="300" rx="27" ry="32" fill="#00CFFF"/>
                  <circle cx="290" cy="305" r="14" fill="#0F0030"/>
                  <circle cx="298" cy="295" r="6" fill="white"/>
                  <circle cx="406" cy="214" r="27" fill="#FF3B3B"/>
                </svg>
              </div>
              <span style={{ color: '#8B82B0', fontSize: '11px' }}>{s}px</span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { color: '#FF3FA4', label: 'カメラ本体' },
          { color: '#00CFFF', label: 'VTuberの目' },
          { color: '#FF3B3B', label: '録画（REC）' },
          { color: '#C5EEFF', label: '背景' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: color }} />
            <span style={{ color: '#8B82B0', fontSize: '12px' }}>{label}</span>
          </div>
        ))}
      </div>

      <p style={{ color: '#5A4E7A', fontSize: '11px', textAlign: 'center', maxWidth: '320px', lineHeight: 1.7 }}>
        <code style={{ color: '#7B5FFF' }}>public/icon.svg</code> と <code style={{ color: '#7B5FFF' }}>public/manifest.json</code> を生成済み。<br />
        カメラアプリに戻るには App.tsx を元に戻してください。
      </p>
    </div>
  )
}
