import { Suspense, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Html, Line, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'
import { LOW_WALL_HEIGHT, SCALE, WALL_HEIGHT, WALL_THICKNESS, outline, rooms, walls } from './floorplan'
import type { Room } from './floorplan'

function toWorld(x: number, y: number): [number, number, number] {
  return [(x - 52) * SCALE, 0, (y - 36) * SCALE]
}

function roomColor(type: Room['type']) {
  if (type === 'wet') return '#dfe9f4'
  if (type === 'balcony') return '#dcebdc'
  if (type === 'wood') return '#eadbc6'
  if (type === 'public') return '#e7e0d6'
  return '#eee8de'
}

function RoomFloor({ room, showLabels }: { room: Room; showLabels: boolean }) {
  const [x, , z] = toWorld(room.x + room.w / 2, room.y + room.d / 2)
  return (
    <group>
      <mesh position={[x, 0.01, z]} receiveShadow>
        <boxGeometry args={[room.w * SCALE, 0.03, room.d * SCALE]} />
        <meshStandardMaterial color={roomColor(room.type)} roughness={0.72} />
      </mesh>
      {showLabels && (
        <Text position={[x, 0.045, z]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.16} color="#4c4035" anchorX="center" anchorY="middle">
          {room.name}
        </Text>
      )}
    </group>
  )
}

function WallSegment({ from, to, height, thickness, color = '#fffaf0' }: { from: [number, number]; to: [number, number]; height: number; thickness: number; color?: string }) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy)
  if (len <= 0.001) return null
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
  const [x, , z] = toWorld(mid[0], mid[1])
  const angle = Math.atan2(dy, dx)
  return (
    <mesh position={[x, height / 2, z]} rotation={[0, -angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[len * SCALE, height, thickness]} />
      <meshStandardMaterial color={color} roughness={0.64} />
    </mesh>
  )
}

function WallMesh() {
  const segments = useMemo(() => {
    const out: Array<{ id: string; from: [number, number]; to: [number, number]; height: number; thickness: number; low: boolean }> = []
    for (const wall of walls) {
      const from = wall.from
      const to = wall.to
      const len = Math.hypot(to[0] - from[0], to[1] - from[1])
      const low = wall.kind === 'low'
      const height = wall.height ?? (low ? LOW_WALL_HEIGHT : WALL_HEIGHT)
      const thickness = (wall.thickness ?? WALL_THICKNESS) * (low ? 0.82 : 1)
      const openings = [...(wall.openings ?? [])].sort((a, b) => a.start - b.start)
      let cursor = 0
      openings.forEach((op, idx) => {
        if (op.start > cursor) {
          out.push({ id: `${wall.id}-${idx}a`, from: interp(from, to, cursor / len), to: interp(from, to, op.start / len), height, thickness, low })
        }
        cursor = Math.max(cursor, op.end)
      })
      if (cursor < len) out.push({ id: `${wall.id}-tail`, from: interp(from, to, cursor / len), to, height, thickness, low })
    }
    return out
  }, [])
  return (
    <group>
      {segments.map((s) => <WallSegment key={s.id} from={s.from} to={s.to} height={s.height} thickness={s.thickness} color={s.low ? '#f4efe4' : '#fffaf0'} />)}
    </group>
  )
}

function interp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function OutlineGuide() {
  const pts = outline.map(([x, y]) => {
    const [wx, , wz] = toWorld(x, y)
    return new THREE.Vector3(wx, 0.05, wz)
  })
  pts.push(pts[0].clone())
  return <Line points={pts} color="#7b6b59" lineWidth={2} dashed dashScale={0.5} />
}

function Furniture() {
  const blocks: Array<[number, number, number, number, number, string]> = [
    [28, 10, 5, 5, 0.45, '#f2eadf'], [43, 11, 7, 4, 0.35, '#f2eadf'], [39, 49, 13, 5, 0.42, '#f2eadf'],
    [56, 38, 3, 12, 0.65, '#f2eadf'], [84, 55, 9, 8, 0.42, '#f2eadf'], [14, 56, 8, 7, 0.42, '#f2eadf'],
  ]
  return <group>{blocks.map((b, i) => { const [x, , z] = toWorld(b[0] + b[2] / 2, b[1] + b[3] / 2); return <mesh key={i} position={[x, b[4] / 2, z]} castShadow><boxGeometry args={[b[2] * SCALE, b[4], b[3] * SCALE]} /><meshStandardMaterial color={b[5]} roughness={0.7} /></mesh> })}</group>
}

function Scene({ showLabels, showOutline }: { showLabels: boolean; showOutline: boolean }) {
  return (
    <>
      <color attach="background" args={['#f7efe3']} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[3, 7, 5]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[14, 11]} />
        <meshStandardMaterial color="#e8dfd2" roughness={0.8} />
      </mesh>
      {rooms.map((room) => <RoomFloor key={room.id} room={room} showLabels={showLabels} />)}
      <WallMesh />
      <Furniture />
      {showOutline && <OutlineGuide />}
      {showLabels && (
        <>
          <Html position={[-4.8, 2.9, -4.2]}><div className="pill">左侧阶梯入户/电梯厅</div></Html>
          <Html position={[-0.4, 1.5, -4.5]}><div className="pill">北侧窄长设备平台</div></Html>
          <Html position={[4.6, 2.9, 2.2]}><div className="pill">东南主卧外凸套房</div></Html>
        </>
      )}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={16} maxPolarAngle={Math.PI / 2.05} target={[0, 0.6, 0]} />
    </>
  )
}

function App() {
  const [showLabels, setShowLabels] = useState(false)
  const [showOutline, setShowOutline] = useState(true)
  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>天一府 F户型｜React Three Fiber 白模 V9</h1>
          <p>已从单文件 SVG 伪 3D 重构为 React + Three.js 真 3D 白模。鼠标左键旋转，滚轮缩放，右键平移。</p>
        </div>
        <div className="badges"><span className="badge">React</span><span className="badge">Three.js</span><span className="badge">OrbitControls</span><span className="badge">V9</span></div>
      </header>
      <section className="layout">
        <div className="canvasWrap">
          <Canvas shadows camera={{ position: [5.5, 6.5, 7.5], fov: 42 }}>
            <Suspense fallback={null}><Scene showLabels={showLabels} showOutline={showOutline} /></Suspense>
          </Canvas>
          <div className="overlay"><div className="pill"><b>操作：</b>左键旋转 / 滚轮缩放 / 右键平移</div><div className="pill">墙高约 2.8m，矮墙约 1.1m</div></div>
        </div>
        <aside className="panel">
          <h2>本轮重构</h2>
          <ul>
            <li>从 SVG 投影重构为真正 Three.js 3D 场景。</li>
            <li>户型数据拆到 <code>floorplan.ts</code>，房间、墙体、门洞可继续数据化维护。</li>
            <li>使用 OrbitControls，支持旋转、缩放、平移。</li>
            <li>保留 V7/V8 的三处外轮廓重点：左侧入户/电梯厅、北侧设备平台、右侧主卧套房。</li>
          </ul>
          <div className="controls"><button onClick={() => setShowLabels(v => !v)}>标注开关</button><button onClick={() => setShowOutline(v => !v)}>虚线轮廓</button></div>
          <div className="note"><span className="warn">说明：</span>当前是可交互 3D 白模，不是施工 CAD。下一步可继续做墙体多边形、门窗洞口、尺寸编辑和 DXF 导出。</div>
          <h3>参考图</h3>
          <div className="refs"><img src="/assets/reference-floorplan.jpeg" /><img src="/assets/feedback-reference-1.png" /><img src="/assets/feedback-reference-2.png" /></div>
        </aside>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
