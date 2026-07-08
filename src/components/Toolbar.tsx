export default function Toolbar() {
  return (
    <div style={{
      height: '44px',
      borderBottom: '1px solid #ddd',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '700', color: '#1a1a1a' }}>
        <span style={{ fontSize: '24px', lineHeight: 1 }}>👮</span>
        <span style={{ fontFamily: 'Menlo, Consolas, Monaco, "Adwaita Mono", "Liberation Mono", "Lucida Console", monospace' }}>Slop Cop</span>
      </span>
    </div>
  )
}
