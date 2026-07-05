import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Html, Line, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { LOW_WALL_HEIGHT, SCALE, WALL_HEIGHT, WALL_THICKNESS, isLoadBearingByDefault, outline } from './floorplan'
import type { Room, Wall } from './floorplan'
import { interp, roomCenter, roomPoints, toWorld } from './geometry'
import type { Selection } from './geometry'
import { createBrickTexture, brickRepeat } from './BrickTexture'
import { DoorModel } from './DoorModel'

function roomColor(type: Room['type'], selected: boolean) {
  if (selected) return '#ffd36a'
  if (type === 'wet') return '#dfe9f4'
  if (type === 'balcony') return '#dcebdc'
  if (type === 'wood') return '#eadbc6'
  if (type === 'public') return '#e7e0d6'
  return '#eee8de'
}

function RoomFloor({ room, selected, showLabels, onSelect }: { room: Room; selected: boolean; showLabels: boolean; onSelect: () => void }) {
  const points = roomPoints(room)
  const center = roomCenter(room)
  const [x, , z] = toWorld(center[0], center[1])
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    points.forEach((point, index) => {
      const [wx, , wz] = toWorld(point[0], point[1])
      if (index === 0) s.moveTo(wx, wz)
      else s.lineTo(wx, wz)
    })
    s.closePath()
    return s
  }, [points])
  return (
    <group>
      <mesh
        position={[0, 0.028, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color={roomColor(room.type, selected)} roughness={0.72} emissive={selected ? '#503400' : '#000000'} emissiveIntensity={selected ? 0.08 : 0} side={THREE.DoubleSide} />
      </mesh>
      {selected && (
        <Line points={[...points, points[0]].map(([px, py]) => { const [wx, , wz] = toWorld(px, py); return new THREE.Vector3(wx, 0.07, wz) })} color="#ffb000" lineWidth={3} />
      )}
      {showLabels && (
        <Text position={[x, 0.075, z]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.16} color={selected ? '#5b3900' : '#4c4035'} anchorX="center" anchorY="middle">
          {room.name}
        </Text>
      )}
    </group>
  )
}

// 缓存砖块纹理，避免重复创建
const textureCache = new Map<string, THREE.CanvasTexture>()

function getBrickTexture(scheme: 'load-bearing' | 'non-load-bearing' | 'low-wall'): THREE.CanvasTexture {
  if (!textureCache.has(scheme)) {
    textureCache.set(scheme, createBrickTexture(scheme))
  }
  return textureCache.get(scheme)!
}

function WallSegment({ from, to, height, thickness, selected, loadBearing, low, onSelect }: {
  from: [number, number]; to: [number, number]; height: number; thickness: number;
  selected: boolean; loadBearing: boolean; low: boolean; onSelect: () => void
}) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy)
  if (len <= 0.001) return null
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
  const [x, , z] = toWorld(mid[0], mid[1])
  const angle = Math.atan2(dy, dx)

  // 选择砖块纹理方案
  const scheme: 'load-bearing' | 'non-load-bearing' | 'low-wall' = low ? 'low-wall' : loadBearing ? 'load-bearing' : 'non-load-bearing'
  const texture = useMemo(() => getBrickTexture(scheme), [scheme])

  // 根据墙长计算纹理 repeat
  const textureRepeatX = useMemo(() => brickRepeat(len * SCALE), [len])
  // 砖块 repeat Y = 墙高 / 砖高（0.12m/块）
  const textureRepeatY = height / 0.12

  return (
    <mesh
      position={[x, height / 2, z]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
    >
      <boxGeometry args={[len * SCALE, height, selected ? thickness * 1.45 : thickness]} />
      <meshStandardMaterial
        map={texture}
        map-repeat={[textureRepeatX, textureRepeatY]}
        map-wrapS={THREE.RepeatWrapping}
        map-wrapT={THREE.RepeatWrapping}
        roughness={0.7}
        roughnessMap={texture}
        roughnessMap-repeat={[textureRepeatX, textureRepeatY]}
        roughnessMap-wrapS={THREE.RepeatWrapping}
        roughnessMap-wrapT={THREE.RepeatWrapping}
        color={selected ? '#ffb000' : '#ffffff'}
        emissive={selected ? '#553600' : '#000000'}
        emissiveIntensity={selected ? 0.1 : 0}
      />
    </mesh>
  )
}

function WallMesh({ walls, selectedId, onSelectWall }: { walls: Wall[]; selectedId?: string; onSelectWall: (id: string) => void }) {
  const segments = useMemo(() => {
    const out: Array<{
      id: string; wallId: string; from: [number, number]; to: [number, number];
      height: number; thickness: number; low: boolean; loadBearing: boolean
    }> = []
    for (const wall of walls) {
      const from = wall.from
      const to = wall.to
      const len = Math.hypot(to[0] - from[0], to[1] - from[1])
      const low = wall.kind === 'low'
      const height = wall.height ?? (low ? LOW_WALL_HEIGHT : WALL_HEIGHT)
      const thickness = (wall.thickness ?? WALL_THICKNESS) * (low ? 0.82 : 1)
      // 使用 wall.loadBearing 如果已设置，否则根据 ID 推断
      const loadBearing = wall.loadBearing ?? isLoadBearingByDefault(wall.id)
      const openings = [...(wall.openings ?? [])].sort((a, b) => a.start - b.start)
      let cursor = 0
      openings.forEach((op, idx) => {
        if (op.start > cursor) out.push({
          id: `${wall.id}-${idx}a`, wallId: wall.id,
          from: interp(from, to, cursor / len), to: interp(from, to, op.start / len),
          height, thickness, low, loadBearing,
        })
        cursor = Math.max(cursor, op.end)
      })
      if (cursor < len) out.push({
        id: `${wall.id}-tail`, wallId: wall.id,
        from: interp(from, to, cursor / len), to,
        height, thickness, low, loadBearing,
      })
    }
    return out
  }, [walls])

  // 收集所有 door opening 信息，用于放置 DoorModel
  const doors = useMemo(() => {
    const out: Array<{
      wall: Wall; opening: NonNullable<Wall['openings']>[number];
      worldPos: [number, number, number]; width: number
    }> = []
    for (const wall of walls) {
      const len = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1])
      if (len <= 0.001) continue
      for (const opening of wall.openings ?? []) {
        if (opening.type !== 'door') continue
        const a = opening.start / len
        const b = opening.end / len
        const width = (opening.end - opening.start) * SCALE
        // opening 中心点
        const midT = (a + b) / 2
        const mx = wall.from[0] + (wall.to[0] - wall.from[0]) * midT
        const my = wall.from[1] + (wall.to[1] - wall.from[1]) * midT
        const [wx, , wz] = toWorld(mx, my)
        out.push({
          wall,
          opening,
          worldPos: [wx, 0, wz],
          width,
        })
      }
    }
    return out
  }, [walls])

  return (
    <group>
      {segments.map((s) => (
        <WallSegment
          key={s.id}
          from={s.from}
          to={s.to}
          height={s.height}
          thickness={s.thickness}
          selected={selectedId === s.wallId}
          onSelect={() => onSelectWall(s.wallId)}
          loadBearing={s.loadBearing}
          low={s.low}
        />
      ))}
      {doors.map((door, index) => {
        const hingeSide = door.opening.swing === 'right' ? 'start' : 'end'
        // 根据 swing 在 opening 起点或终点放置门扇
        const hingeT = hingeSide === 'start'
          ? door.opening.start / (Math.hypot(door.wall.to[0] - door.wall.from[0], door.wall.to[1] - door.wall.from[1]) || 1)
          : door.opening.end / (Math.hypot(door.wall.to[0] - door.wall.from[0], door.wall.to[1] - door.wall.from[1]) || 1)
        const hx = door.wall.from[0] + (door.wall.to[0] - door.wall.from[0]) * hingeT
        const hy = door.wall.from[1] + (door.wall.to[1] - door.wall.from[1]) * hingeT
        const [hwx, , hwz] = toWorld(hx, hy)
        return (
          <DoorModel
            key={`door-${index}`}
            position={[hwx, 0, hwz]}
            width={door.width}
            swing={door.opening.swing ?? 'left'}
            hingeSide={hingeSide}
            opened={false}
          />
        )
      })}
    </group>
  )
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

function SceneContent({ rooms, walls, selection, showLabels, showOutline, showFurniture, onSelect }: { rooms: Room[]; walls: Wall[]; selection: Selection; showLabels: boolean; showOutline: boolean; showFurniture: boolean; onSelect: (selection: Selection) => void }) {
  return (
    <group onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={['#f7efe3']} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[3, 7, 5]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[14, 11]} />
        <meshStandardMaterial color="#e8dfd2" roughness={0.8} />
      </mesh>
      {rooms.map((room) => <RoomFloor key={room.id} room={room} selected={selection?.type === 'room' && selection.id === room.id} showLabels={showLabels} onSelect={() => onSelect({ type: 'room', id: room.id })} />)}
      <WallMesh walls={walls} selectedId={selection?.type === 'wall' ? selection.id : undefined} onSelectWall={(id) => onSelect({ type: 'wall', id })} />
      {showFurniture && <Furniture />}
      {showOutline && <OutlineGuide />}
      {showLabels && (
        <>
          <Html position={[-4.8, 2.9, -4.2]}><div className="pill">左侧阶梯入户/电梯厅</div></Html>
          <Html position={[-0.4, 1.5, -4.5]}><div className="pill">北侧窄长设备平台</div></Html>
          <Html position={[4.6, 2.9, 2.2]}><div className="pill">东南主卧外凸套房</div></Html>
        </>
      )}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={16} maxPolarAngle={Math.PI / 2.05} target={[0, 0.6, 0]} />
    </group>
  )
}

export function FloorplanCanvas(props: { rooms: Room[]; walls: Wall[]; selection: Selection; showLabels: boolean; showOutline: boolean; showFurniture: boolean; onSelect: (selection: Selection) => void }) {
  return (
    <Canvas shadows camera={{ position: [5.5, 6.5, 7.5], fov: 42 }}>
      <Suspense fallback={null}><SceneContent {...props} /></Suspense>
    </Canvas>
  )
}
