import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { isLoadBearingByDefault, rooms as initialRooms, walls as initialWalls, WALL_HEIGHT, WALL_THICKNESS } from './floorplan'
import type { OpeningSwing, OpeningType, Point, Room, RoomType, Wall } from './floorplan'
import { FloorplanCanvas } from './Scene'
import { TOP_DOWN_VIEWBOX, TopDownEditor } from './TopDownEditor'
import type { EditorLayers, EditorTool } from './TopDownEditor'
import type { Selection } from './geometry'
import { roomArea, roomPoints, selectionKey, wallLength } from './geometry'

const roomTypes: RoomType[] = ['living', 'wet', 'balcony', 'wood', 'public']
const openingTypes: OpeningType[] = ['door', 'window', 'opening', 'sliding']
const openingSwings: OpeningSwing[] = ['left', 'right']
const STORAGE_KEY = 'tianyifu-floorplan-editor-v30'
const PREFS_KEY = 'tianyifu-floorplan-editor-prefs-v27'

interface PersistedFloorplan {
  rooms: Room[]
  walls: Wall[]
}

interface EditorPrefs {
  showLabels: boolean
  showOutline: boolean
  showFurniture: boolean
  viewMode: '3d' | '2d'
  editorTool: EditorTool
  showDimensions: boolean
  layers: EditorLayers
}

const defaultPrefs: EditorPrefs = {
  showLabels: true,
  showOutline: true,
  showFurniture: true,
  viewMode: '3d',
  editorTool: 'select',
  showDimensions: true,
  layers: { grid: true, rooms: true, walls: true, openings: true, labels: true },
}

function loadEditorPrefs(): EditorPrefs {
  if (typeof localStorage === 'undefined') return defaultPrefs
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...defaultPrefs, ...JSON.parse(raw), layers: { ...defaultPrefs.layers, ...JSON.parse(raw).layers } } : defaultPrefs
  } catch (error) {
    console.warn('Failed to load editor prefs', error)
    return defaultPrefs
  }
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function isRoom(value: unknown): value is Room {
  const room = value as Partial<Room>
  return !!room && typeof room.id === 'string' && typeof room.name === 'string' && roomTypes.includes(room.type as RoomType) && ['x', 'y', 'w', 'd'].every((key) => typeof room[key as keyof Room] === 'number') && (!room.points || room.points.every(isPoint))
}

function isWall(value: unknown): value is Wall {
  const wall = value as Partial<Wall>
  return !!wall && typeof wall.id === 'string' && isPoint(wall.from) && isPoint(wall.to)
}

function parseFloorplanPayload(value: unknown): PersistedFloorplan {
  const payload = value as Partial<PersistedFloorplan>
  if (!payload || !Array.isArray(payload.rooms) || !Array.isArray(payload.walls)) throw new Error('JSON 必须包含 rooms 和 walls 数组')
  if (!payload.rooms.every(isRoom)) throw new Error('rooms 数据格式不正确')
  if (!payload.walls.every(isWall)) throw new Error('walls 数据格式不正确')
  return { rooms: payload.rooms, walls: payload.walls }
}

function loadPersistedFloorplan(): PersistedFloorplan {
  if (typeof localStorage === 'undefined') return { rooms: initialRooms, walls: initialWalls }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { rooms: initialRooms, walls: initialWalls }
  try {
    return parseFloorplanPayload(JSON.parse(raw))
  } catch (error) {
    console.warn('Failed to load persisted floorplan', error)
    return { rooms: initialRooms, walls: initialWalls }
  }
}

function svgRoomColor(type: RoomType) {
  if (type === 'wet') return '#dfe9f4'
  if (type === 'balcony') return '#dcebdc'
  if (type === 'wood') return '#eadbc6'
  if (type === 'public') return '#e7e0d6'
  return '#eee8de'
}

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}


function samePoint(a: Point, b: Point, eps = 0.001) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps
}

function pointOnWallT(point: Point, wall: Wall) {
  const dx = wall.to[0] - wall.from[0]
  const dy = wall.to[1] - wall.from[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq <= 0.0001) return 0
  return ((point[0] - wall.from[0]) * dx + (point[1] - wall.from[1]) * dy) / lenSq
}

function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | undefined {
  const dax = a2[0] - a1[0]
  const day = a2[1] - a1[1]
  const dbx = b2[0] - b1[0]
  const dby = b2[1] - b1[1]
  const denom = dax * dby - day * dbx
  if (Math.abs(denom) < 0.0001) return undefined
  const s = ((b1[0] - a1[0]) * dby - (b1[1] - a1[1]) * dbx) / denom
  const t = ((b1[0] - a1[0]) * day - (b1[1] - a1[1]) * dax) / denom
  if (s <= 0.001 || s >= 0.999 || t <= 0.001 || t >= 0.999) return undefined
  return [Number((a1[0] + s * dax).toFixed(3)), Number((a1[1] + s * day).toFixed(3))]
}

function uniquePoints(points: Point[]) {
  return points.reduce<Point[]>((out, point) => out.some((item) => samePoint(item, point)) ? out : [...out, point], [])
}

function splitWallAtPoints(wall: Wall, points: Point[]) {
  const splitPoints = uniquePoints([wall.from, ...points, wall.to]).sort((a, b) => pointOnWallT(a, wall) - pointOnWallT(b, wall))
  const base: Omit<Wall, 'id' | 'from' | 'to' | 'openings'> = { thickness: wall.thickness, height: wall.height, kind: wall.kind }
  const totalLen = wallLength(wall) || 1
  const segments: Wall[] = []
  for (let i = 0; i < splitPoints.length - 1; i++) {
    const from = splitPoints[i]
    const to = splitPoints[i + 1]
    const segLen = Math.hypot(to[0] - from[0], to[1] - from[1])
    if (segLen <= 0.01) continue
    const segStart = pointOnWallT(from, wall) * totalLen
    const segEnd = pointOnWallT(to, wall) * totalLen
    const openings = (wall.openings ?? []).flatMap((opening) => {
      const start = Math.max(opening.start, segStart)
      const end = Math.min(opening.end, segEnd)
      if (end - start <= 0.05) return []
      return [{ ...opening, start: Number((start - segStart).toFixed(3)), end: Number((end - segStart).toFixed(3)) }]
    })
    segments.push({ ...base, id: `${wall.id}-s${i + 1}-${Date.now().toString(36)}`, from, to, ...(openings.length ? { openings } : {}) })
  }
  return segments.length ? segments : [wall]
}

function splitWallsByNewWall(existingWalls: Wall[], newWall: Wall) {
  const intersectionsByWall = new Map<string, Point[]>()
  const newWallIntersections: Point[] = []
  for (const wall of existingWalls) {
    const point = segmentIntersection(newWall.from, newWall.to, wall.from, wall.to)
    if (!point) continue
    intersectionsByWall.set(wall.id, [...(intersectionsByWall.get(wall.id) ?? []), point])
    newWallIntersections.push(point)
  }
  const nextExisting = existingWalls.flatMap((wall) => {
    const points = intersectionsByWall.get(wall.id)
    return points?.length ? splitWallAtPoints(wall, points) : [wall]
  })
  const newSegments = splitWallAtPoints(newWall, newWallIntersections)
  return [...nextExisting, ...newSegments]
}

function wallVector(wall: Wall): Point {
  return [wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]]
}

function cross(a: Point, b: Point) {
  return a[0] * b[1] - a[1] * b[0]
}

function areCollinear(a: Wall, b: Wall) {
  const av = wallVector(a)
  const bv = wallVector(b)
  return Math.abs(cross(av, bv)) <= 0.001 && Math.abs(cross(av, [b.from[0] - a.from[0], b.from[1] - a.from[1]])) <= 0.001
}

function sameWallProps(a: Wall, b: Wall) {
  return (a.kind ?? 'full') === (b.kind ?? 'full') && (a.height ?? WALL_HEIGHT) === (b.height ?? WALL_HEIGHT) && (a.thickness ?? WALL_THICKNESS) === (b.thickness ?? WALL_THICKNESS)
}

function projectDistance(point: Point, origin: Point, dir: Point) {
  return (point[0] - origin[0]) * dir[0] + (point[1] - origin[1]) * dir[1]
}

function normalizeDir(wall: Wall): Point {
  const v = wallVector(wall)
  const len = Math.hypot(v[0], v[1]) || 1
  const dir: Point = [v[0] / len, v[1] / len]
  return dir[0] < -0.001 || (Math.abs(dir[0]) <= 0.001 && dir[1] < 0) ? [-dir[0], -dir[1]] : dir
}

function openingsOnMergedWall(source: Wall, mergedFrom: Point, dir: Point) {
  const sourceStart = projectDistance(source.from, mergedFrom, dir)
  const sourceEnd = projectDistance(source.to, mergedFrom, dir)
  const base = Math.min(sourceStart, sourceEnd)
  const reversed = sourceStart > sourceEnd
  const sourceLen = wallLength(source)
  return (source.openings ?? []).map((opening) => {
    const start = reversed ? sourceLen - opening.end : opening.start
    const end = reversed ? sourceLen - opening.start : opening.end
    return { ...opening, start: Number((base + start).toFixed(3)), end: Number((base + end).toFixed(3)) }
  })
}

function tryMergePair(a: Wall, b: Wall): Wall | undefined {
  if (!sameWallProps(a, b) || !areCollinear(a, b)) return undefined
  const touching = samePoint(a.from, b.from) || samePoint(a.from, b.to) || samePoint(a.to, b.from) || samePoint(a.to, b.to)
  if (!touching) return undefined
  const dir = normalizeDir(a)
  const candidates = [a.from, a.to, b.from, b.to]
  const sorted = [...candidates].sort((p, q) => projectDistance(p, candidates[0], dir) - projectDistance(q, candidates[0], dir))
  const from = sorted[0]
  const to = sorted[sorted.length - 1]
  const openings = [...openingsOnMergedWall(a, from, dir), ...openingsOnMergedWall(b, from, dir)].sort((x, y) => x.start - y.start)
  return { id: `${a.id}-m-${Date.now().toString(36)}`, from, to, kind: a.kind, height: a.height, thickness: a.thickness, ...(openings.length ? { openings } : {}) }
}

function mergeAdjacentWalls(input: Wall[]) {
  let walls = [...input]
  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const merged = tryMergePair(walls[i], walls[j])
        if (!merged) continue
        walls = walls.filter((_, index) => index !== i && index !== j)
        walls.push(merged)
        changed = true
        break outer
      }
    }
  }
  return walls
}

function openingIssues(wall: Wall) {
  const len = wallLength(wall)
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.start - b.start)
  const issues: string[] = []
  openings.forEach((opening, index) => {
    if (opening.start < 0 || opening.end > len) issues.push(`洞口 ${index + 1} 超出墙长`)
    if (opening.start >= opening.end) issues.push(`洞口 ${index + 1} 起点不小于终点`)
    if (opening.end - opening.start < 0.2) issues.push(`洞口 ${index + 1} 过短`)
    const prev = openings[index - 1]
    if (prev && opening.start < prev.end) issues.push(`洞口 ${index} 与 ${index + 1} 重叠`)
  })
  return issues
}

function repairWallOpenings(wall: Wall): Wall {
  const len = wallLength(wall)
  let cursor = 0
  const openings = [...(wall.openings ?? [])]
    .map((opening) => ({ ...opening, start: Math.max(0, Math.min(len, opening.start)), end: Math.max(0, Math.min(len, opening.end)) }))
    .map((opening) => opening.start <= opening.end ? opening : { ...opening, start: opening.end, end: opening.start })
    .sort((a, b) => a.start - b.start)
    .flatMap((opening) => {
      const start = Math.max(opening.start, cursor)
      const end = Math.max(opening.end, start)
      cursor = end
      if (end - start < 0.2) return []
      return [{ ...opening, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) }]
    })
  return { ...wall, ...(openings.length ? { openings } : { openings: undefined }) }
}


const dxfLayers = [
  { name: 'ROOMS', color: 3 },
  { name: 'WALLS', color: 7 },
  { name: 'WALL_SOLIDS', color: 8 },
  { name: 'OPENINGS', color: 5 },
  { name: 'OPENINGS_TEXT', color: 5 },
  { name: 'LABELS', color: 2 },
  { name: 'DIMENSIONS', color: 1 },
]

function dxfHeader() {
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n`
}

function dxfTables() {
  const layers = dxfLayers.map((layer) => `0\nLAYER\n2\n${layer.name}\n70\n0\n62\n${layer.color}\n6\nCONTINUOUS\n`).join('')
  return `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${dxfLayers.length}\n${layers}0\nENDTAB\n0\nENDSEC\n`
}

function dxfLine(layer: string, from: Point, to: Point) {
  return `0
LINE
8
${layer}
10
${from[0]}
20
${-from[1]}
30
0
11
${to[0]}
21
${-to[1]}
31
0
`
}

function dxfText(layer: string, point: Point, text: string, height = 1.6) {
  return `0
TEXT
8
${layer}
10
${point[0]}
20
${-point[1]}
30
0
40
${height}
1
${text}
`
}

function dxfPolyline(layer: string, points: Point[], closed = true) {
  return `0
LWPOLYLINE
8
${layer}
90
${points.length}
70
${closed ? 1 : 0}
${points.map((point) => `10
${point[0]}
20
${-point[1]}
`).join('')}`
}


function wallOutlinePoints(wall: Wall): Point[] {
  const dx = wall.to[0] - wall.from[0]
  const dy = wall.to[1] - wall.from[1]
  const len = Math.hypot(dx, dy) || 1
  const half = (wall.thickness ?? WALL_THICKNESS) / 2
  const nx = -dy / len * half
  const ny = dx / len * half
  return [
    [Number((wall.from[0] + nx).toFixed(3)), Number((wall.from[1] + ny).toFixed(3))],
    [Number((wall.to[0] + nx).toFixed(3)), Number((wall.to[1] + ny).toFixed(3))],
    [Number((wall.to[0] - nx).toFixed(3)), Number((wall.to[1] - ny).toFixed(3))],
    [Number((wall.from[0] - nx).toFixed(3)), Number((wall.from[1] - ny).toFixed(3))],
  ]
}

function svgOpeningSymbol(wall: Wall, opening: NonNullable<Wall['openings']>[number], len: number) {
  const a = opening.start / len
  const b = opening.end / len
  const x1 = wall.from[0] + (wall.to[0] - wall.from[0]) * a
  const y1 = wall.from[1] + (wall.to[1] - wall.from[1]) * a
  const x2 = wall.from[0] + (wall.to[0] - wall.from[0]) * b
  const y2 = wall.from[1] + (wall.to[1] - wall.from[1]) * b
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const type = opening.type ?? 'opening'
  if (type === 'window') return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#17a2a8" stroke-width="1.8" stroke-linecap="round"/><line x1="${x1}" y1="${y1 - 0.7}" x2="${x2}" y2="${y2 - 0.7}" stroke="#17a2a8" stroke-width="0.35"/></g>`
  if (type === 'sliding') return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7c5cff" stroke-width="1.8" stroke-linecap="round"/><line x1="${x1}" y1="${y1 - 0.6}" x2="${x2}" y2="${y2 - 0.6}" stroke="#7c5cff" stroke-width="0.35"/><line x1="${x1}" y1="${y1 + 0.6}" x2="${x2}" y2="${y2 + 0.6}" stroke="#7c5cff" stroke-width="0.35"/></g>`
  if (type === 'door') {
    const radius = Math.max(1.2, opening.end - opening.start)
    const sweep = opening.swing === 'right' ? 1 : 0
    return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2d8fd5" stroke-width="2" stroke-linecap="round"/><path d="M ${x1} ${y1} A ${radius} ${radius} 0 0 ${sweep} ${mx} ${my + (opening.swing === 'right' ? radius / 2 : -radius / 2)}" fill="none" stroke="#2d8fd5" stroke-width="0.35"/></g>`
  }
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#888" stroke-width="2" stroke-linecap="round"/>`
}

function NumberInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function Inspector({ rooms, walls, selection, onUpdateRoom, onUpdateWall, onDeleteSelection, onDuplicateRoom, onRepairWall }: { rooms: Room[]; walls: Wall[]; selection: Selection; onUpdateRoom: (id: string, patch: Partial<Room>) => void; onUpdateWall: (id: string, patch: Partial<Wall>) => void; onDeleteSelection: () => void; onDuplicateRoom: (id: string) => void; onRepairWall: (id: string) => void }) {
  const selectedRoom = selection?.type === 'room' || selection?.type === 'room-point' ? rooms.find((room) => room.id === selection.id) : undefined
  const selectedWall = selection?.type === 'wall' ? walls.find((wall) => wall.id === selection.id) : undefined
  const selectedWallIssues = selectedWall ? openingIssues(selectedWall) : []

  if (selectedRoom) {
    return (
      <section className="card inspector" key={selectionKey(selection)}>
        <h2>房间属性</h2>
        <label className="field"><span>名称</span><input value={selectedRoom.name} onChange={(event) => onUpdateRoom(selectedRoom.id, { name: event.target.value })} /></label>
        <label className="field"><span>类型</span><select value={selectedRoom.type} onChange={(event) => onUpdateRoom(selectedRoom.id, { type: event.target.value as RoomType })}>{roomTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <div className="grid2"><NumberInput label="X" value={selectedRoom.x} onChange={(x) => onUpdateRoom(selectedRoom.id, { x })} /><NumberInput label="Y" value={selectedRoom.y} onChange={(y) => onUpdateRoom(selectedRoom.id, { y })} /></div>
        <div className="grid2"><NumberInput label="宽 W" value={selectedRoom.w} onChange={(w) => onUpdateRoom(selectedRoom.id, { w })} /><NumberInput label="深 D" value={selectedRoom.d} onChange={(d) => onUpdateRoom(selectedRoom.id, { d })} /></div>
        <div className="metric"><span>真实面积</span><b>{roomArea(selectedRoom).toFixed(1)}</b><small>模型单位²</small></div>
        <div className="polygonEditor">
          <div className="rowTitle"><h3>房间顶点</h3><button onClick={() => onUpdateRoom(selectedRoom.id, { points: selectedRoom.points ? [...selectedRoom.points, roomPoints(selectedRoom)[0]] : roomPoints(selectedRoom) })}>{selectedRoom.points ? '增加顶点' : '转多边形'}</button></div>
          {selectedRoom.points ? selectedRoom.points.map((point, index) => (
            <div className="pointRow" key={index}>
              <NumberInput label={`P${index + 1} X`} value={point[0]} onChange={(x) => onUpdateRoom(selectedRoom.id, { points: selectedRoom.points?.map((item, i) => i === index ? [x, item[1]] : item) })} />
              <NumberInput label={`P${index + 1} Y`} value={point[1]} onChange={(y) => onUpdateRoom(selectedRoom.id, { points: selectedRoom.points?.map((item, i) => i === index ? [item[0], y] : item) })} />
              <button className="danger smallBtn" disabled={(selectedRoom.points?.length ?? 0) <= 3} onClick={() => onUpdateRoom(selectedRoom.id, { points: selectedRoom.points?.filter((_, i) => i !== index) })}>删除</button>
            </div>
          )) : <p className="muted">当前房间仍是矩形。点击“转多边形”后可编辑顶点，适合 L 型、异形阳台和走廊。</p>}
          {selectedRoom.points && <button className="wide" onClick={() => onUpdateRoom(selectedRoom.id, { points: undefined })}>恢复矩形模式</button>}
        </div>
        <div className="controls"><button onClick={() => onDuplicateRoom(selectedRoom.id)}>复制房间</button><button className="danger" onClick={onDeleteSelection}>删除</button></div>
      </section>
    )
  }

  if (selectedWall) {
    return (
      <section className="card inspector" key={selectionKey(selection)}>
        <h2>墙体属性</h2>
        <div className="muted">ID：{selectedWall.id}</div>
        <div className="grid2"><NumberInput label="起点 X" value={selectedWall.from[0]} onChange={(x) => onUpdateWall(selectedWall.id, { from: [x, selectedWall.from[1]] })} /><NumberInput label="起点 Y" value={selectedWall.from[1]} onChange={(y) => onUpdateWall(selectedWall.id, { from: [selectedWall.from[0], y] })} /></div>
        <div className="grid2"><NumberInput label="终点 X" value={selectedWall.to[0]} onChange={(x) => onUpdateWall(selectedWall.id, { to: [x, selectedWall.to[1]] })} /><NumberInput label="终点 Y" value={selectedWall.to[1]} onChange={(y) => onUpdateWall(selectedWall.id, { to: [selectedWall.to[0], y] })} /></div>
                <div className="grid2"><NumberInput label="厚度" value={selectedWall.thickness ?? WALL_THICKNESS} step={0.01} onChange={(thickness) => onUpdateWall(selectedWall.id, { thickness })} /><NumberInput label="高度" value={selectedWall.height ?? (selectedWall.kind === 'low' ? 1.1 : WALL_HEIGHT)} step={0.1} onChange={(height) => onUpdateWall(selectedWall.id, { height })} /></div>
        <label className="field"><span>承重墙</span><input type="checkbox" checked={selectedWall.loadBearing ?? isLoadBearingByDefault(selectedWall.id)} onChange={(event) => onUpdateWall(selectedWall.id, { loadBearing: event.target.checked })} /></label>
        <label className="field"><span>墙体类型</span><select value={selectedWall.kind ?? 'full'} onChange={(event) => onUpdateWall(selectedWall.id, { kind: event.target.value as Wall['kind'] })}><option value="full">full</option><option value="low">low</option></select></label>
        <div className="metric"><span>长度</span><b>{wallLength(selectedWall).toFixed(1)}</b><small>模型单位</small></div>
        <div className="openingsEditor">
          <div className="rowTitle"><h3>门洞 / 窗洞</h3><button onClick={() => onUpdateWall(selectedWall.id, { openings: [...(selectedWall.openings ?? []), { start: 1, end: Math.min(4, Math.max(2, wallLength(selectedWall) - 1)), type: 'door', swing: 'left' }] })}>新增洞口</button></div>
          {selectedWallIssues.length > 0 && <div className="issueBox"><b>洞口问题</b>{selectedWallIssues.map((issue) => <span key={issue}>{issue}</span>)}<button onClick={() => onRepairWall(selectedWall.id)}>修复当前墙</button></div>}
          {(selectedWall.openings ?? []).length === 0 && <p className="muted">当前墙体没有洞口。洞口按墙体起点到终点的距离记录。</p>}
          {(selectedWall.openings ?? []).map((opening, index) => (
            <div className="openingRow typed" key={index}>
              <NumberInput label="Start" value={opening.start} step={0.5} onChange={(start) => onUpdateWall(selectedWall.id, { openings: (selectedWall.openings ?? []).map((item, i) => i === index ? { ...item, start } : item) })} />
              <NumberInput label="End" value={opening.end} step={0.5} onChange={(end) => onUpdateWall(selectedWall.id, { openings: (selectedWall.openings ?? []).map((item, i) => i === index ? { ...item, end } : item) })} />
              <label className="field compact"><span>类型</span><select value={opening.type ?? 'opening'} onChange={(event) => onUpdateWall(selectedWall.id, { openings: (selectedWall.openings ?? []).map((item, i) => i === index ? { ...item, type: event.target.value as OpeningType } : item) })}>{openingTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label className="field compact"><span>开向</span><select value={opening.swing ?? 'left'} onChange={(event) => onUpdateWall(selectedWall.id, { openings: (selectedWall.openings ?? []).map((item, i) => i === index ? { ...item, swing: event.target.value as OpeningSwing } : item) })}>{openingSwings.map((swing) => <option key={swing} value={swing}>{swing}</option>)}</select></label>
              <button className="danger smallBtn" onClick={() => onUpdateWall(selectedWall.id, { openings: (selectedWall.openings ?? []).filter((_, i) => i !== index) })}>删除</button>
            </div>
          ))}
        </div>
        <button className="danger wide" onClick={onDeleteSelection}>删除墙体</button>
      </section>
    )
  }

  return <section className="card inspector empty"><h2>属性面板</h2><p>点击 3D 场景里的房间地面或墙体开始编辑。当前支持位置、尺寸、墙高、墙厚和类型编辑。</p></section>
}

export default function App() {
  const initialData = useMemo(() => loadPersistedFloorplan(), [])
  const initialPrefs = useMemo(() => loadEditorPrefs(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rooms, setRooms] = useState<Room[]>(initialData.rooms)
  const [walls, setWalls] = useState<Wall[]>(initialData.walls)
  const [selection, setSelection] = useState<Selection>(null)
  const [showLabels, setShowLabels] = useState(initialPrefs.showLabels)
  const [showOutline, setShowOutline] = useState(initialPrefs.showOutline)
  const [showFurniture, setShowFurniture] = useState(initialPrefs.showFurniture)
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(initialPrefs.viewMode)
  const [editorTool, setEditorTool] = useState<EditorTool>(initialPrefs.editorTool)
  const [showDimensions, setShowDimensions] = useState(initialPrefs.showDimensions)
  const [layers, setLayers] = useState<EditorLayers>(initialPrefs.layers)
  const [saveStatus, setSaveStatus] = useState('已自动保存')
  const [objectFilter, setObjectFilter] = useState('')
  const [importError, setImportError] = useState('')

  useEffect(() => {
    const payload = JSON.stringify({ rooms, walls })
    localStorage.setItem(STORAGE_KEY, payload)
    setSaveStatus(`已自动保存 ${new Date().toLocaleTimeString()}`)
  }, [rooms, walls])

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ showLabels, showOutline, showFurniture, viewMode, editorTool, showDimensions, layers }))
  }, [showLabels, showOutline, showFurniture, viewMode, editorTool, showDimensions, layers])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
        event.preventDefault()
        deleteSelection()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selection])

  const totalArea = useMemo(() => rooms.reduce((sum, room) => sum + roomArea(room), 0), [rooms])
  const fullWallLength = useMemo(() => walls.reduce((sum, wall) => sum + wallLength(wall), 0), [walls])

  const toggleLayer = (key: keyof EditorLayers) => setLayers((value) => ({ ...value, [key]: !value[key] }))

  const normalizedObjectFilter = objectFilter.trim().toLowerCase()
  const filteredRooms = rooms.filter((room, index) => !normalizedObjectFilter || `r${index + 1} ${room.id} ${room.name}`.toLowerCase().includes(normalizedObjectFilter))
  const filteredWalls = walls.filter((wall, index) => !normalizedObjectFilter || `w${index + 1} ${wall.id}`.toLowerCase().includes(normalizedObjectFilter))

  const updateRoom = (id: string, patch: Partial<Room>) => setRooms((items) => items.map((room) => room.id === id ? { ...room, ...patch } : room))
  const updateWall = (id: string, patch: Partial<Wall>) => setWalls((items) => items.map((wall) => wall.id === id ? { ...wall, ...patch } : wall))
  const deleteSelection = () => {
    if (!selection) return
    if (selection.type === 'room-point') {
      setRooms((items) => items.map((room) => {
        if (room.id !== selection.id) return room
        const points = roomPoints(room)
        if (points.length <= 3) return room
        return { ...room, points: points.filter((_, index) => index !== selection.index) }
      }))
      setSelection({ type: 'room', id: selection.id })
      return
    }
    if (selection.type === 'room') setRooms((items) => items.filter((room) => room.id !== selection.id))
    if (selection.type === 'wall') setWalls((items) => items.filter((wall) => wall.id !== selection.id))
    setSelection(null)
  }
  const duplicateRoom = (id: string) => {
    const room = rooms.find((item) => item.id === id)
    if (!room) return
    const copy = { ...room, id: `${room.id}-copy-${Date.now().toString(36)}`, name: `${room.name} 副本`, x: room.x + 3, y: room.y + 3 }
    setRooms((items) => [...items, copy])
    setSelection({ type: 'room', id: copy.id })
  }
  const addWall = () => {
    const id = `wall-${Date.now().toString(36)}`
    setWalls((items) => [...items, { id, from: [20, 20], to: [34, 20], kind: 'full' }])
    setSelection({ type: 'wall', id })
  }
  const cleanupWalls = () => {
    setWalls((items) => mergeAdjacentWalls(items))
    setSelection(null)
  }
  const repairWall = (id: string) => setWalls((items) => items.map((wall) => wall.id === id ? repairWallOpenings(wall) : wall))
  const repairAllOpenings = () => setWalls((items) => items.map(repairWallOpenings))
  const resetPrefs = () => {
    localStorage.removeItem(PREFS_KEY)
    setShowLabels(defaultPrefs.showLabels)
    setShowOutline(defaultPrefs.showOutline)
    setShowFurniture(defaultPrefs.showFurniture)
    setViewMode(defaultPrefs.viewMode)
    setEditorTool(defaultPrefs.editorTool)
    setShowDimensions(defaultPrefs.showDimensions)
    setLayers(defaultPrefs.layers)
  }
  const addDrawnWall = (wall: Wall) => {
    setWalls((items) => splitWallsByNewWall(items, wall))
  }
  const exportJson = () => {
    const payload = JSON.stringify({ rooms, walls }, null, 2)
    void navigator.clipboard?.writeText(payload)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'floorplan-edit.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  const importJsonFile = async (file: File) => {
    try {
      const payload = parseFloorplanPayload(JSON.parse(await file.text()))
      setRooms(payload.rooms)
      setWalls(payload.walls)
      setSelection(null)
      setImportError('')
      setSaveStatus(`已导入并保存 ${new Date().toLocaleTimeString()}`)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }
  const exportDxf = () => {
    const entities: string[] = []
    if (layers.rooms) rooms.forEach((room, index) => {
      const points = roomPoints(room)
      entities.push(dxfPolyline('ROOMS', points, true))
      const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length
      const cy = points.reduce((sum, point) => sum + point[1], 0) / points.length
      if (layers.labels) entities.push(dxfText('LABELS', [cx, cy], `R${index + 1} ${room.name}`))
      if (showDimensions) entities.push(dxfText('DIMENSIONS', [cx, cy + 2], `${roomArea(room).toFixed(0)} area`, 1.2))
    })
    if (layers.walls) walls.forEach((wall, index) => {
      entities.push(dxfLine('WALLS', wall.from, wall.to))
      entities.push(dxfPolyline('WALL_SOLIDS', wallOutlinePoints(wall), true))
      const len = wallLength(wall) || 1
      const mid: Point = [(wall.from[0] + wall.to[0]) / 2, (wall.from[1] + wall.to[1]) / 2]
      if (layers.labels) entities.push(dxfText('LABELS', mid, `W${index + 1}`, 1.1))
      if (showDimensions) entities.push(dxfText('DIMENSIONS', [mid[0], mid[1] + 1.5], len.toFixed(0), 1.1))
      if (layers.openings) (wall.openings ?? []).forEach((opening) => {
        const a = opening.start / len
        const b = opening.end / len
        const p1: Point = [wall.from[0] + (wall.to[0] - wall.from[0]) * a, wall.from[1] + (wall.to[1] - wall.from[1]) * a]
        const p2: Point = [wall.from[0] + (wall.to[0] - wall.from[0]) * b, wall.from[1] + (wall.to[1] - wall.from[1]) * b]
        entities.push(dxfLine('OPENINGS', p1, p2))
        entities.push(dxfText('OPENINGS_TEXT', [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], opening.type ?? 'opening', 0.9))
      })
    })
    const dxf = `${dxfHeader()}${dxfTables()}0\nSECTION\n2\nENTITIES\n${entities.join('')}0\nENDSEC\n0\nEOF\n`
    const blob = new Blob([dxf], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'floorplan-plan.dxf'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportSvg = () => {
    const roomSvg = layers.rooms ? rooms.map((room, index) => {
      const points = roomPoints(room)
      const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length
      const cy = points.reduce((sum, point) => sum + point[1], 0) / points.length
      const label = layers.labels ? `R${index + 1} · ${room.name}` : room.name
      const area = showDimensions ? `<text x="${cx}" y="${cy + 1.5}" font-size="1.7" text-anchor="middle" dominant-baseline="middle" fill="#8a5d12">${roomArea(room).toFixed(0)}㎡</text>` : ''
      return `<g data-layer="rooms"><polygon points="${points.map((point) => point.join(',')).join(' ')}" fill="${svgRoomColor(room.type)}" stroke="#6d5c4a" stroke-width="0.25"/><text x="${cx}" y="${cy - (showDimensions ? 1 : 0)}" font-size="2" text-anchor="middle" dominant-baseline="middle" font-weight="700">${xmlEscape(label)}</text>${area}</g>`
    }).join('\n') : ''
    const wallSvg = layers.walls ? walls.map((wall, index) => {
      const len = wallLength(wall) || 1
      const midX = (wall.from[0] + wall.to[0]) / 2
      const midY = (wall.from[1] + wall.to[1]) / 2
      const openings = layers.openings ? (wall.openings ?? []).map((opening) => svgOpeningSymbol(wall, opening, len)).join('') : ''
      const wallLabel = showDimensions ? `<text x="${midX}" y="${midY - 1.2}" font-size="1.7" text-anchor="middle" dominant-baseline="middle" fill="#9a5b14">${layers.labels ? `W${index + 1} · ` : ''}${len.toFixed(0)}</text>` : ''
      return `<g data-layer="walls"><line x1="${wall.from[0]}" y1="${wall.from[1]}" x2="${wall.to[0]}" y2="${wall.to[1]}" stroke="${wall.kind === 'low' ? '#9f927f' : '#2f251d'}" stroke-width="1.2" stroke-linecap="square"/>${openings}${wallLabel}</g>`
    }).join('\n') : ''
    const gridSvg = layers.grid ? `<g data-layer="grid" stroke="rgba(116,97,75,.16)" stroke-width="0.08">${Array.from({ length: 27 }, (_, i) => `<line x1="${i * 4}" y1="0" x2="${i * 4}" y2="74"/>`).join('')}${Array.from({ length: 19 }, (_, i) => `<line x1="0" y1="${i * 4}" x2="104" y2="${i * 4}"/>`).join('')}</g>` : ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${TOP_DOWN_VIEWBOX.minX} ${TOP_DOWN_VIEWBOX.minY} ${TOP_DOWN_VIEWBOX.width} ${TOP_DOWN_VIEWBOX.height}">\n<rect x="0" y="0" width="104" height="74" fill="#fbf4e8"/>\n${gridSvg}\n${roomSvg}\n${wallSvg}\n</svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'floorplan-plan.svg'
    a.click()
    URL.revokeObjectURL(url)
  }
  const clearSavedDraft = () => {
    localStorage.removeItem(STORAGE_KEY)
    reset()
    setSaveStatus('已清除草稿并恢复默认')
  }
  const reset = () => {
    setRooms(initialRooms)
    setWalls(initialWalls)
    setSelection(null)
  }

  return (
    <main className="app editorApp">
      <header className="header">
        <div>
          <h1>天一府 F户型｜户型编辑器 V30</h1>
          <p>路线 B 第二十一版：DXF 导出新增 WALL_SOLIDS 墙厚轮廓图层，墙体不再只有中心线。</p>
        </div>
        <div className="badges"><span className="badge">Editor</span><span className="badge">Room/Wall Select</span><span className="badge">JSON Export</span><span className="badge">2D/3D</span><span className="badge">Draw Wall</span><span className="badge">Snap</span><span className="badge">Door/Window</span><span className="badge">Polygon Room</span><span className="badge">Vertex Drag</span><span className="badge">Insert Vertex</span><span className="badge">Intersections</span><span className="badge">Auto Split</span><span className="badge">Opening Migration</span><span className="badge">Wall Merge</span><span className="badge">Opening Validate</span><span className="badge">Layers</span><span className="badge">Search</span><span className="badge">SVG Layers</span><span className="badge">Prefs</span><span className="badge">DXF</span><span className="badge">DXF Layers</span><span className="badge">Wall Solids</span><span className="badge">V30</span></div>
      </header>
      <section className="layout editorLayout">
        <div className="canvasWrap">
          {viewMode === '3d' ? (
            <FloorplanCanvas rooms={rooms} walls={walls} selection={selection} showLabels={showLabels} showOutline={showOutline} showFurniture={showFurniture} onSelect={setSelection} />
          ) : (
            <TopDownEditor rooms={rooms} walls={walls} selection={selection} tool={editorTool} showDimensions={showDimensions} layers={layers} onSelect={setSelection} onUpdateRoom={updateRoom} onUpdateWall={updateWall} onAddWall={addDrawnWall} />
          )}
          <div className="overlay"><div className="pill"><b>{viewMode === '3d' ? '3D 预览' : '2D 编辑'}：</b>{viewMode === '3d' ? '点击房间/墙体选中，右侧改参数' : '拖房间或墙体端点，按 Delete 删除'}</div><div className="pill">{viewMode === '3d' ? '滚轮缩放 / 右键平移 / 左键旋转' : '1 单位网格吸附'}</div></div>
        </div>
        <aside className="panel editorPanel">
          <section className="card stats">
            <h2>项目统计</h2>
            <div className="statGrid"><div><b>{rooms.length}</b><span>房间</span></div><div><b>{walls.length}</b><span>墙体</span></div><div><b>{totalArea.toFixed(0)}</b><span>面积单位²</span></div><div><b>{fullWallLength.toFixed(0)}</b><span>墙长单位</span></div></div>
          </section>
          <section className="card toolbar">
            <h2>工具</h2>
            <div className="viewSwitch"><button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>3D 预览</button><button className={viewMode === '2d' ? 'active' : ''} onClick={() => setViewMode('2d')}>2D 编辑</button></div>
            <div className="toolSwitch"><button className={editorTool === 'select' ? 'active' : ''} onClick={() => { setEditorTool('select'); setViewMode('2d') }}>选择/拖拽</button><button className={editorTool === 'drawWall' ? 'active' : ''} onClick={() => { setEditorTool('drawWall'); setViewMode('2d') }}>画墙</button><button className={showDimensions ? 'active' : ''} onClick={() => setShowDimensions((v) => !v)}>尺寸标注</button><button onClick={exportSvg}>导出 SVG</button><button onClick={exportDxf}>导出 DXF</button></div>
            <div className="layerSwitch"><button className={layers.grid ? 'active' : ''} onClick={() => toggleLayer('grid')}>网格</button><button className={layers.rooms ? 'active' : ''} onClick={() => toggleLayer('rooms')}>房间</button><button className={layers.walls ? 'active' : ''} onClick={() => toggleLayer('walls')}>墙体</button><button className={layers.openings ? 'active' : ''} onClick={() => toggleLayer('openings')}>门窗</button><button className={layers.labels ? 'active' : ''} onClick={() => toggleLayer('labels')}>编号</button></div>
            <div className="controls"><button onClick={() => setShowLabels((v) => !v)}>{showLabels ? '隐藏标注' : '显示标注'}</button><button onClick={() => setShowOutline((v) => !v)}>{showOutline ? '隐藏轮廓' : '显示轮廓'}</button><button onClick={() => setShowFurniture((v) => !v)}>{showFurniture ? '隐藏家具' : '显示家具'}</button><button onClick={addWall}>新增墙体</button><button onClick={cleanupWalls}>清理墙体</button><button onClick={repairAllOpenings}>修复洞口</button></div>
            <div className="controls"><button onClick={exportJson}>导出 JSON</button><button onClick={() => fileInputRef.current?.click()}>导入 JSON</button><button className="danger" onClick={reset}>重置数据</button><button className="danger" onClick={clearSavedDraft}>清除草稿</button><button onClick={resetPrefs}>重置偏好</button></div>
            <input ref={fileInputRef} className="hiddenInput" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importJsonFile(file) }} />
            <div className="saveStatus">{saveStatus}</div>
            {importError && <div className="errorText">{importError}</div>}
          </section>
          <section className="card objectList"><h2>对象列表</h2><input className="objectSearch" placeholder="搜索房间/墙体..." value={objectFilter} onChange={(event) => setObjectFilter(event.target.value)} /><h3>房间</h3>{filteredRooms.map((room) => { const index = rooms.findIndex((item) => item.id === room.id); return <button key={room.id} className={selection?.type !== 'wall' && selection?.id === room.id ? 'active' : ''} onClick={() => setSelection({ type: 'room', id: room.id })}>R{index + 1} · {room.name}</button> })}<h3>墙体</h3>{filteredWalls.map((wall) => { const index = walls.findIndex((item) => item.id === wall.id); return <button key={wall.id} className={selection?.type === 'wall' && selection.id === wall.id ? 'active' : ''} onClick={() => setSelection({ type: 'wall', id: wall.id })}>W{index + 1} · {wall.id}</button> })}</section>
          <Inspector rooms={rooms} walls={walls} selection={selection} onUpdateRoom={updateRoom} onUpdateWall={updateWall} onDeleteSelection={deleteSelection} onDuplicateRoom={duplicateRoom} onRepairWall={repairWall} />
          <section className="note"><span className="warn">路线 B 进度：</span>当前 DXF 同时导出墙体中心线与 WALL_SOLIDS 墙厚轮廓。下一阶段建议做房间 HATCH 填充和门窗 Block。</section>
        </aside>
      </section>
    </main>
  )
}
