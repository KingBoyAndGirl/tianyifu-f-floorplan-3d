import { useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { Room, Wall } from './floorplan'
import { roomArea, roomCenter, roomPoints } from './geometry'
import type { Selection } from './geometry'

export const TOP_DOWN_VIEWBOX = { minX: 0, minY: 0, width: 104, height: 74 }
const GRID = 1
const SNAP_DISTANCE = 2
const LINE_SNAP_DISTANCE = 1.25

export type EditorTool = 'select' | 'drawWall'
export interface EditorLayers { grid: boolean; rooms: boolean; walls: boolean; openings: boolean; labels: boolean }

type DragState =
  | { kind: 'room'; id: string; startX: number; startY: number; originalX: number; originalY: number; originalPoints?: [number, number][] }
  | { kind: 'wall-from' | 'wall-to'; id: string; startX: number; startY: number; original: [number, number] }
  | { kind: 'room-point'; id: string; index: number; startX: number; startY: number; original: [number, number]; originalPoints: [number, number][] }
  | null

type DrawState = { start: [number, number]; current: [number, number]; snapped?: [number, number]; intersections?: [number, number][] } | null

function snap(value: number) {
  return Math.round(value / GRID) * GRID
}

function snapPoint(point: [number, number]): [number, number] {
  return [snap(point[0]), snap(point[1])]
}

function orthogonalPoint(start: [number, number], current: [number, number], force: boolean): [number, number] {
  const dx = current[0] - start[0]
  const dy = current[1] - start[1]
  if (!force && Math.abs(Math.abs(dx) - Math.abs(dy)) < 3) return current
  return Math.abs(dx) >= Math.abs(dy) ? [current[0], start[1]] : [start[0], current[1]]
}

function collectWallEndpoints(walls: Wall[], excludeId?: string): Array<[number, number]> {
  return walls.flatMap((wall) => wall.id === excludeId ? [] : [wall.from, wall.to])
}

function nearestEndpoint(point: [number, number], endpoints: Array<[number, number]>): [number, number] | undefined {
  let nearest: [number, number] | undefined
  let best = SNAP_DISTANCE
  for (const endpoint of endpoints) {
    const distance = lineLength(point, endpoint)
    if (distance <= best) {
      nearest = endpoint
      best = distance
    }
  }
  return nearest
}

function projectPointToSegment(point: [number, number], from: [number, number], to: [number, number]): [number, number] {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq <= 0.0001) return from
  const t = Math.max(0, Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / lenSq))
  return [from[0] + dx * t, from[1] + dy * t]
}

function nearestWallProjection(point: [number, number], walls: Wall[]): [number, number] | undefined {
  let nearest: [number, number] | undefined
  let best = LINE_SNAP_DISTANCE
  for (const wall of walls) {
    const projection = projectPointToSegment(point, wall.from, wall.to)
    const distance = lineLength(point, projection)
    if (distance <= best) {
      nearest = snapPoint(projection)
      best = distance
    }
  }
  return nearest
}

function segmentIntersection(a1: [number, number], a2: [number, number], b1: [number, number], b2: [number, number]): [number, number] | undefined {
  const dax = a2[0] - a1[0]
  const day = a2[1] - a1[1]
  const dbx = b2[0] - b1[0]
  const dby = b2[1] - b1[1]
  const denom = dax * dby - day * dbx
  if (Math.abs(denom) < 0.0001) return undefined
  const s = ((b1[0] - a1[0]) * dby - (b1[1] - a1[1]) * dbx) / denom
  const t = ((b1[0] - a1[0]) * day - (b1[1] - a1[1]) * dax) / denom
  if (s < 0 || s > 1 || t < 0 || t > 1) return undefined
  return [a1[0] + s * dax, a1[1] + s * day]
}

function wallIntersections(from: [number, number], to: [number, number], walls: Wall[]): [number, number][] {
  return walls.map((wall) => segmentIntersection(from, to, wall.from, wall.to)).filter((point): point is [number, number] => !!point)
}

function roomFill(type: Room['type'], selected: boolean) {
  if (selected) return '#ffd36a'
  if (type === 'wet') return '#dfe9f4'
  if (type === 'balcony') return '#dcebdc'
  if (type === 'wood') return '#eadbc6'
  if (type === 'public') return '#e7e0d6'
  return '#eee8de'
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(svg.getScreenCTM()?.inverse())
}

function wallMid(wall: Wall): [number, number] {
  return [(wall.from[0] + wall.to[0]) / 2, (wall.from[1] + wall.to[1]) / 2]
}

function lineLength(from: [number, number], to: [number, number]) {
  return Math.hypot(to[0] - from[0], to[1] - from[1])
}

export function TopDownEditor({ rooms, walls, selection, tool, showDimensions, layers, onSelect, onUpdateRoom, onUpdateWall, onAddWall }: { rooms: Room[]; walls: Wall[]; selection: Selection; tool: EditorTool; showDimensions: boolean; layers: EditorLayers; onSelect: (selection: Selection) => void; onUpdateRoom: (id: string, patch: Partial<Room>) => void; onUpdateWall: (id: string, patch: Partial<Wall>) => void; onAddWall: (wall: Wall) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [draw, setDraw] = useState<DrawState>(null)
  const [snapHint, setSnapHint] = useState<[number, number] | null>(null)
  const gridLines = useMemo(() => {
    const lines = []
    for (let x = TOP_DOWN_VIEWBOX.minX; x <= TOP_DOWN_VIEWBOX.width; x += 4) lines.push(<line key={`x-${x}`} x1={x} y1={TOP_DOWN_VIEWBOX.minY} x2={x} y2={TOP_DOWN_VIEWBOX.height} />)
    for (let y = TOP_DOWN_VIEWBOX.minY; y <= TOP_DOWN_VIEWBOX.height; y += 4) lines.push(<line key={`y-${y}`} x1={TOP_DOWN_VIEWBOX.minX} y1={y} x2={TOP_DOWN_VIEWBOX.width} y2={y} />)
    return lines
  }, [])

  const getSnappedPointer = (event: PointerEvent<SVGElement>, options?: { start?: [number, number]; excludeWallId?: string }): { point: [number, number]; snapped?: [number, number] } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const p = clientToSvg(svg, event.clientX, event.clientY)
    let point = snapPoint([p.x, p.y])
    if (options?.start) point = snapPoint(orthogonalPoint(options.start, point, event.shiftKey))
    const snapped = nearestEndpoint(point, collectWallEndpoints(walls, options?.excludeWallId))
    return { point: snapped ?? point, snapped }
  }

  const startRoomDrag = (event: PointerEvent<SVGRectElement>, room: Room) => {
    if (tool !== 'select') return
    event.stopPropagation()
    onSelect({ type: 'room', id: room.id })
    const svg = svgRef.current
    if (!svg) return
    const p = clientToSvg(svg, event.clientX, event.clientY)
    setDrag({ kind: 'room', id: room.id, startX: p.x, startY: p.y, originalX: room.x, originalY: room.y, originalPoints: room.points })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startWallHandleDrag = (event: PointerEvent<SVGCircleElement>, wall: Wall, kind: 'wall-from' | 'wall-to') => {
    if (tool !== 'select') return
    event.stopPropagation()
    onSelect({ type: 'wall', id: wall.id })
    const svg = svgRef.current
    if (!svg) return
    const p = clientToSvg(svg, event.clientX, event.clientY)
    setDrag({ kind, id: wall.id, startX: p.x, startY: p.y, original: kind === 'wall-from' ? wall.from : wall.to })
    event.currentTarget.setPointerCapture(event.pointerId)
  }


  const startRoomPointDrag = (event: PointerEvent<SVGCircleElement>, room: Room, index: number) => {
    if (tool !== 'select') return
    event.stopPropagation()
    onSelect({ type: 'room-point', id: room.id, index })
    const svg = svgRef.current
    if (!svg) return
    const p = clientToSvg(svg, event.clientX, event.clientY)
    const points = roomPoints(room)
    setDrag({ kind: 'room-point', id: room.id, index, startX: p.x, startY: p.y, original: points[index], originalPoints: points })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const insertRoomPoint = (event: PointerEvent<SVGCircleElement>, room: Room, afterIndex: number) => {
    if (tool !== 'select') return
    event.stopPropagation()
    const points = roomPoints(room)
    const a = points[afterIndex]
    const b = points[(afterIndex + 1) % points.length]
    const point: [number, number] = [snap((a[0] + b[0]) / 2), snap((a[1] + b[1]) / 2)]
    const next = [...points.slice(0, afterIndex + 1), point, ...points.slice(afterIndex + 1)]
    onUpdateRoom(room.id, { points: next })
    onSelect({ type: 'room-point', id: room.id, index: afterIndex + 1 })
  }

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const result = getSnappedPointer(event)
    if (!result) return
    const point = result.point
    if (tool === 'drawWall') {
      setDraw({ start: point, current: point, snapped: result.snapped })
      onSelect(null)
      return
    }
    onSelect(null)
  }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (draw) {
      const result = getSnappedPointer(event, { start: draw.start })
      if (result) setDraw((current) => current ? { ...current, current: result.point, snapped: result.snapped, intersections: wallIntersections(current.start, result.point, walls) } : current)
      return
    }
    if (!drag || !svgRef.current) return
    const p = clientToSvg(svgRef.current, event.clientX, event.clientY)
    const dx = p.x - drag.startX
    const dy = p.y - drag.startY
    if (drag.kind === 'room') {
      const patch: Partial<Room> = { x: snap(drag.originalX + dx), y: snap(drag.originalY + dy) }
      if (drag.originalPoints) patch.points = drag.originalPoints.map((point) => [snap(point[0] + dx), snap(point[1] + dy)])
      onUpdateRoom(drag.id, patch)
    }
    if (drag.kind === 'room-point') {
      const point: [number, number] = [snap(drag.original[0] + dx), snap(drag.original[1] + dy)]
      const snapped = nearestEndpoint(point, collectWallEndpoints(walls)) ?? nearestWallProjection(point, walls)
      setSnapHint(snapped ?? null)
      onUpdateRoom(drag.id, { points: drag.originalPoints.map((item, index) => index === drag.index ? (snapped ?? point) : item) })
    }
    if (drag.kind === 'wall-from' || drag.kind === 'wall-to') {
      const wall = walls.find((item) => item.id === drag.id)
      const anchor = drag.kind === 'wall-from' ? wall?.to : wall?.from
      let point: [number, number] = [snap(drag.original[0] + dx), snap(drag.original[1] + dy)]
      if (anchor) point = snapPoint(orthogonalPoint(anchor, point, event.shiftKey))
      const snapped = nearestEndpoint(point, collectWallEndpoints(walls, drag.id))
      if (drag.kind === 'wall-from') onUpdateWall(drag.id, { from: snapped ?? point })
      if (drag.kind === 'wall-to') onUpdateWall(drag.id, { to: snapped ?? point })
    }
  }

  const finishDraw = () => {
    if (draw && lineLength(draw.start, draw.current) > 0.5) {
      const id = `wall-${Date.now().toString(36)}`
      onAddWall({ id, from: draw.start, to: draw.current, kind: 'full' })
      onSelect({ type: 'wall', id })
    }
    setDraw(null)
  }

  return (
    <div className="topDownWrap">
      <svg
        ref={svgRef}
        className={tool === 'drawWall' ? 'topDownSvg drawMode' : 'topDownSvg'}
        viewBox={`${TOP_DOWN_VIEWBOX.minX} ${TOP_DOWN_VIEWBOX.minY} ${TOP_DOWN_VIEWBOX.width} ${TOP_DOWN_VIEWBOX.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { setDrag(null); setSnapHint(null); finishDraw() }}
        onPointerCancel={() => { setDrag(null); setSnapHint(null); setDraw(null) }}
      >
        <rect x={TOP_DOWN_VIEWBOX.minX} y={TOP_DOWN_VIEWBOX.minY} width={TOP_DOWN_VIEWBOX.width} height={TOP_DOWN_VIEWBOX.height} className="svgBg" />
        {layers.grid && <g className="gridLines">{gridLines}</g>}
        {layers.rooms && <g className="rooms2d">
          {rooms.map((room, roomIndex) => {
            const selected = (selection?.type === 'room' || selection?.type === 'room-point') && selection.id === room.id
            const points = roomPoints(room)
            const center = roomCenter(room)
            return (
              <g key={room.id}>
                <polygon points={points.map((point) => point.join(',')).join(' ')} fill={roomFill(room.type, selected)} className={selected ? 'roomRect selected' : 'roomRect'} onPointerDown={(event) => startRoomDrag(event as unknown as PointerEvent<SVGRectElement>, room)} />
                <text x={center[0]} y={center[1] - (showDimensions ? 1.2 : 0)} className="roomText">{layers.labels ? `R${roomIndex + 1} · ${room.name}` : room.name}</text>
                {showDimensions && <text x={center[0]} y={center[1] + 1.4} className="dimText">{roomArea(room).toFixed(0)}㎡</text>}
                {selected && tool === 'select' && points.map((point, index) => {
                  const next = points[(index + 1) % points.length]
                  const mid: [number, number] = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2]
                  const pointSelected = selection?.type === 'room-point' && selection.id === room.id && selection.index === index
                  return (
                    <g key={index}>
                      <circle cx={mid[0]} cy={mid[1]} r={0.86} className="insertPointHandle" onPointerDown={(event) => insertRoomPoint(event, room, index)} />
                      <text x={mid[0]} y={mid[1] + 0.08} className="insertPointText">+</text>
                      <circle cx={point[0]} cy={point[1]} r={pointSelected ? 1.35 : 1.05} className={pointSelected ? 'roomPointHandle selected' : 'roomPointHandle'} onPointerDown={(event) => startRoomPointDrag(event, room, index)} />
                      <text x={point[0]} y={point[1] - 1.45} className="pointIndex">{index + 1}</text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </g>}
        {layers.walls && <g className="walls2d">
          {walls.map((wall, wallIndex) => {
            const selected = selection?.type === 'wall' && selection.id === wall.id
            const mid = wallMid(wall)
            return (
              <g key={wall.id}>
                <line x1={wall.from[0]} y1={wall.from[1]} x2={wall.to[0]} y2={wall.to[1]} className={selected ? 'wallLine selected' : wall.kind === 'low' ? 'wallLine low' : 'wallLine'} onPointerDown={(event) => { if (tool !== 'select') return; event.stopPropagation(); onSelect({ type: 'wall', id: wall.id }) }} />
                {layers.openings && (wall.openings ?? []).map((opening, index) => {
                  const len = lineLength(wall.from, wall.to) || 1
                  const a = opening.start / len
                  const b = opening.end / len
                  const x1 = wall.from[0] + (wall.to[0] - wall.from[0]) * a
                  const y1 = wall.from[1] + (wall.to[1] - wall.from[1]) * a
                  const x2 = wall.from[0] + (wall.to[0] - wall.from[0]) * b
                  const y2 = wall.from[1] + (wall.to[1] - wall.from[1]) * b
                  const mx = (x1 + x2) / 2
                  const my = (y1 + y2) / 2
                  const type = opening.type ?? 'opening'
                  const radius = Math.max(1.2, opening.end - opening.start)
                  return (
                    <g key={index} className={`openingSymbol ${type}`}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} className="openingLine" />
                      {type === 'door' && <path d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 ${opening.swing === 'right' ? 1 : 0} ${mx} ${my + (opening.swing === 'right' ? radius / 2 : -radius / 2)}`} className="doorSwing" />}
                      {type === 'window' && <line x1={x1} y1={y1 - 0.7} x2={x2} y2={y2 - 0.7} className="windowLite" />}
                      {type === 'sliding' && (
                        <>
                          <line x1={x1} y1={y1 - 0.6} x2={x2} y2={y2 - 0.6} className="slidingLite" />
                          <line x1={x1} y1={y1 + 0.6} x2={x2} y2={y2 + 0.6} className="slidingLite" />
                        </>
                      )}
                    </g>
                  )
                })}
                {showDimensions && <text x={mid[0]} y={mid[1] - 1.1} className="wallDimText">{layers.labels ? `W${wallIndex + 1} · ` : ''}{lineLength(wall.from, wall.to).toFixed(0)}</text>}
                {selected && tool === 'select' && (
                  <>
                    <circle cx={wall.from[0]} cy={wall.from[1]} r={1.15} className="handle" onPointerDown={(event) => startWallHandleDrag(event, wall, 'wall-from')} />
                    <circle cx={wall.to[0]} cy={wall.to[1]} r={1.15} className="handle" onPointerDown={(event) => startWallHandleDrag(event, wall, 'wall-to')} />
                  </>
                )}
              </g>
            )
          })}
        </g>}
        {snapHint && <circle cx={snapHint[0]} cy={snapHint[1]} r={1.7} className="snapHint" />}
        {draw?.snapped && <circle cx={draw.snapped[0]} cy={draw.snapped[1]} r={1.7} className="snapHint" />}
        {draw?.intersections?.map((point, index) => <circle key={index} cx={point[0]} cy={point[1]} r={1.25} className="intersectionHint" />)}
        {draw && (
          <g className="drawPreview">
            <line x1={draw.start[0]} y1={draw.start[1]} x2={draw.current[0]} y2={draw.current[1]} />
            <circle cx={draw.start[0]} cy={draw.start[1]} r={1} />
            <circle cx={draw.current[0]} cy={draw.current[1]} r={1} />
            <text x={(draw.start[0] + draw.current[0]) / 2} y={(draw.start[1] + draw.current[1]) / 2 - 1.2} className="wallDimText">{lineLength(draw.start, draw.current).toFixed(0)}</text>
          </g>
        )}
      </svg>
      <div className="topDownHelp"><b>2D 编辑：</b>{tool === 'drawWall' ? '拖动绘制新墙；靠近墙端点自动吸附；交点会高亮提示。' : '拖房间/顶点；点边中 + 插入顶点；顶点可吸附墙端点和墙线。'}</div>
    </div>
  )
}
