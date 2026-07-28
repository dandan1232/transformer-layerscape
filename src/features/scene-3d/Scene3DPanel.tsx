import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Focus, MousePointer2, Orbit, RefreshCcw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Color,
  Object3D,
  Vector3,
  type InstancedMesh,
} from 'three'
import { useStore } from 'zustand'
import type { ModelTrace, TraceEntityId } from '../../domain/trace/trace'
import {
  detectDeviceCapabilities,
  type DeviceCapabilities,
} from '../../platform/capabilities'
import { selectCurrentStep, selectSelectedEntity } from '../../store/explorer-selectors'
import type { ExplorerStoreApi } from '../../store/explorer-store'
import {
  createSceneLayout,
  getCameraTransitionAlpha,
  getGuidedCameraPose,
  getSceneFocus,
  type SceneLayout,
  type ScenePosition,
} from './scene-layout'
import './Scene3DPanel.css'

interface Scene3DPanelProps {
  readonly store: ExplorerStoreApi
  readonly isActive: boolean
  readonly capabilities?: DeviceCapabilities
}

const palette = {
  token: new Color('#f6be55'),
  tokenSelected: new Color('#ffdf91'),
  tokenHover: new Color('#71b9eb'),
  tokenEmbedding: '#e87a4d',
  positionEmbedding: '#64aee0',
  hiddenInput: '#f6be55',
  normalized: '#8bcaa6',
  head: '#64aee0',
  headSelected: '#f6be55',
  residual: '#f0a95b',
  mlp: '#9d8ec9',
  output: '#6dcf9a',
  outputSelected: '#ffcf69',
  void: '#09111f',
}

function TokenInstances({
  trace,
  layout,
  selectedTokenIndex,
  onSelectToken,
}: {
  trace: ModelTrace
  layout: SceneLayout
  selectedTokenIndex: number | null
  onSelectToken: (index: number) => void
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Object3D(), [])
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    layout.tokens.forEach((token, index) => {
      transform.position.set(...token.position)
      transform.scale.setScalar(1)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [layout.tokens, transform])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    layout.tokens.forEach((_, index) => {
      const color =
        index === selectedTokenIndex
          ? palette.tokenSelected
          : index === hoveredIndex
            ? palette.tokenHover
            : palette.token
      mesh.setColorAt(index, color)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [hoveredIndex, layout.tokens, selectedTokenIndex])

  const readInstance = (event: {
    readonly instanceId?: number
    stopPropagation: () => void
  }) => {
    event.stopPropagation()
    return event.instanceId ?? null
  }

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, trace.input.tokens.length]}
        onClick={(event) => {
          const index = readInstance(event)
          if (index !== null) onSelectToken(index)
        }}
        onPointerMove={(event) => setHoveredIndex(readInstance(event))}
        onPointerOut={() => setHoveredIndex(null)}
      >
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshStandardMaterial roughness={0.4} metalness={0.15} vertexColors />
      </instancedMesh>
      {layout.tokens.map((token, index) => (
        <Html
          key={token.id}
          position={[token.position[0], token.position[1] - 0.48, token.position[2]]}
          center
          distanceFactor={9}
          className="scene3d-label"
        >
          <span aria-hidden="true">T{index + 1} · {trace.input.tokens[index].trim()}</span>
        </Html>
      ))}
    </>
  )
}

function EmbeddingLayer({
  layout,
  selectedEntityId,
  onSelectTokenEmbedding,
  onSelectPositionEmbedding,
}: {
  layout: SceneLayout
  selectedEntityId: TraceEntityId | null
  onSelectTokenEmbedding: () => void
  onSelectPositionEmbedding: () => void
}) {
  const positions = useMemo(
    () =>
      layout.tokens.map((token) => ({
        token: [token.position[0], -1.18, 1.28] as ScenePosition,
        position: [token.position[0], -0.9, 1.04] as ScenePosition,
        hidden: [token.position[0], -0.62, 0.82] as ScenePosition,
      })),
    [layout.tokens],
  )
  const tokenSelected = selectedEntityId === 'operation:embedding'
  const positionSelected = selectedEntityId === 'operation:position-embedding'

  return (
    <>
      {positions.map((position, index) => (
        <group key={`embedding-${layout.tokens[index].id}`}>
          <Line
            points={[layout.tokens[index].position, position.token]}
            color={tokenSelected ? palette.tokenSelected : '#8e7650'}
            lineWidth={tokenSelected ? 1.8 : 0.8}
          />
          <Line
            points={[position.token, position.hidden]}
            color={tokenSelected ? palette.tokenEmbedding : '#6d493d'}
            lineWidth={tokenSelected ? 1.8 : 0.8}
          />
          <Line
            points={[position.position, position.hidden]}
            color={positionSelected ? palette.positionEmbedding : '#37526e'}
            lineWidth={positionSelected ? 1.8 : 0.8}
          />
          <mesh
            position={position.token as [number, number, number]}
            scale={tokenSelected ? 1.15 : 1}
            onClick={(event) => {
              event.stopPropagation()
              onSelectTokenEmbedding()
            }}
          >
            <boxGeometry args={[0.42, 0.14, 0.42]} />
            <meshStandardMaterial
              color={palette.tokenEmbedding}
              emissive={tokenSelected ? palette.tokenEmbedding : palette.void}
              emissiveIntensity={tokenSelected ? 0.3 : 0.02}
              roughness={0.42}
            />
          </mesh>
          <mesh
            position={position.position as [number, number, number]}
            scale={positionSelected ? 1.15 : 1}
            onClick={(event) => {
              event.stopPropagation()
              onSelectPositionEmbedding()
            }}
          >
            <boxGeometry args={[0.32, 0.12, 0.32]} />
            <meshStandardMaterial
              color={palette.positionEmbedding}
              emissive={positionSelected ? palette.positionEmbedding : palette.void}
              emissiveIntensity={positionSelected ? 0.32 : 0.03}
              roughness={0.36}
            />
          </mesh>
          <mesh
            position={position.hidden as [number, number, number]}
            rotation={[0, 0, Math.PI / 4]}
            scale={positionSelected ? 1.16 : 1}
            onClick={(event) => {
              event.stopPropagation()
              onSelectPositionEmbedding()
            }}
          >
            <octahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial
              color={palette.hiddenInput}
              emissive={positionSelected ? palette.hiddenInput : palette.void}
              emissiveIntensity={positionSelected ? 0.28 : 0.03}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}
      <Html
        center
        distanceFactor={9}
        position={[0, -0.42, 1.38]}
        className="scene3d-label scene3d-label--embedding"
      >
        <span aria-hidden="true">TOKEN EMB ＋ POSITION → X</span>
      </Html>
    </>
  )
}

function NormalizationRail({
  layout,
  selected,
  onSelect,
}: {
  layout: SceneLayout
  selected: boolean
  onSelect: () => void
}) {
  const positions = useMemo(
    () =>
      layout.tokens.map(
        (token) => [token.position[0], -0.25, 0.5] as ScenePosition,
      ),
    [layout.tokens],
  )

  return (
    <>
      {positions.length > 1 && (
        <Line
          points={[positions[0], positions.at(-1)!]}
          color={selected ? palette.normalized : '#3f675d'}
          lineWidth={selected ? 2.2 : 1}
        />
      )}
      {positions.map((position, index) => (
        <group key={`layernorm-${layout.tokens[index].id}`}>
          <Line
            points={[[position[0], -0.62, 0.82], position]}
            color={selected ? palette.normalized : '#5f7569'}
            lineWidth={selected ? 1.8 : 0.8}
          />
          <mesh
            position={position as [number, number, number]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={selected ? 1.18 : 1}
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
            }}
          >
            <torusGeometry args={[0.18, 0.055, 12, 28]} />
            <meshStandardMaterial
              color={palette.normalized}
              emissive={selected ? palette.normalized : palette.void}
              emissiveIntensity={selected ? 0.3 : 0.03}
              roughness={0.34}
              metalness={0.16}
            />
          </mesh>
        </group>
      ))}
      <Html
        center
        distanceFactor={9}
        position={[0, -0.08, 0.72]}
        className="scene3d-label scene3d-label--normalization"
      >
        <span aria-hidden="true">LAYER NORM · μ→0 · σ→1</span>
      </Html>
    </>
  )
}

function HeadNode({
  position,
  index,
  selected,
  onSelect,
}: {
  position: ScenePosition
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={position as [number, number, number]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        scale={selected || hovered ? 1.12 : 1}
      >
        <torusGeometry args={[0.48, 0.14, 18, 40]} />
        <meshStandardMaterial
          color={selected ? palette.headSelected : palette.head}
          emissive={selected ? palette.headSelected : palette.void}
          emissiveIntensity={selected ? 0.32 : 0.04}
          roughness={0.32}
          metalness={0.3}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.2, 20, 20]} />
        <meshStandardMaterial color={selected ? palette.headSelected : palette.output} />
      </mesh>
      <Html center distanceFactor={8} position={[0, -0.78, 0]} className="scene3d-label scene3d-label--head">
        <span aria-hidden="true">HEAD {index + 1} · 4D</span>
      </Html>
    </group>
  )
}

function ConcatHub({
  position,
  headCount,
  headSize,
  selected,
  onSelect,
}: {
  position: ScenePosition
  headCount: number
  headSize: number
  selected: boolean
  onSelect: () => void
}) {
  const colors = [palette.headSelected, palette.head, palette.output]
  return (
    <group position={position as [number, number, number]} scale={selected ? 1.12 : 1}>
      {Array.from({ length: headCount }, (_, index) => (
        <mesh
          key={`concat-segment-${index}`}
          position={[0, (index - (headCount - 1) / 2) * 0.32, 0]}
          onClick={(event) => {
            event.stopPropagation()
            onSelect()
          }}
        >
          <boxGeometry args={[0.62, 0.26, 0.52]} />
          <meshStandardMaterial
            color={colors[index % colors.length]}
            emissive={selected ? colors[index % colors.length] : palette.void}
            emissiveIntensity={selected ? 0.28 : 0.03}
            roughness={0.34}
            metalness={0.18}
          />
        </mesh>
      ))}
      <Html center distanceFactor={8} position={[0, -0.78, 0]} className="scene3d-label scene3d-label--concat">
        <span aria-hidden="true">CONCAT · {headCount}×{headSize}D</span>
      </Html>
    </group>
  )
}

function ResidualNode({
  position,
  index,
  selected,
  onSelect,
}: {
  position: ScenePosition
  index: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <group position={position as [number, number, number]} scale={selected ? 1.15 : 1}>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <torusGeometry args={[0.28, 0.09, 14, 32]} />
        <meshStandardMaterial
          color={palette.residual}
          emissive={selected ? palette.residual : palette.void}
          emissiveIntensity={selected ? 0.34 : 0.03}
          roughness={0.32}
          metalness={0.18}
        />
      </mesh>
      <mesh scale={[0.28, 0.08, 0.08]}>
        <boxGeometry />
        <meshStandardMaterial color={palette.outputSelected} />
      </mesh>
      <mesh scale={[0.08, 0.28, 0.08]}>
        <boxGeometry />
        <meshStandardMaterial color={palette.outputSelected} />
      </mesh>
      <Html center distanceFactor={8} position={[0, -0.62, 0]} className="scene3d-label scene3d-label--residual">
        <span aria-hidden="true">RESIDUAL {String(index).padStart(2, '0')} · ＋</span>
      </Html>
    </group>
  )
}

function MlpNormNode({
  position,
  selected,
  onSelect,
}: {
  position: ScenePosition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <group position={position as [number, number, number]} scale={selected ? 1.14 : 1}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <cylinderGeometry args={[0.3, 0.3, 0.22, 28]} />
        <meshStandardMaterial
          color={palette.normalized}
          emissive={selected ? palette.normalized : palette.void}
          emissiveIntensity={selected ? 0.32 : 0.03}
          roughness={0.36}
        />
      </mesh>
      <Html center distanceFactor={8} position={[0, -0.58, 0]} className="scene3d-label scene3d-label--mlp-norm">
        <span aria-hidden="true">LN · BEFORE MLP</span>
      </Html>
    </group>
  )
}

function MlpTower({
  position,
  hiddenSize,
  selected,
  onSelect,
}: {
  position: ScenePosition
  hiddenSize: number
  selected: boolean
  onSelect: () => void
}) {
  const slabs = [
    { x: -0.38, height: 0.48, color: palette.head },
    { x: 0, height: 1.18, color: palette.mlp },
    { x: 0.38, height: 0.48, color: palette.output },
  ]
  return (
    <group position={position as [number, number, number]} scale={selected ? 1.1 : 1}>
      {slabs.map((slab, index) => (
        <mesh
          key={slab.x}
          position={[slab.x, 0, 0]}
          onClick={(event) => {
            event.stopPropagation()
            onSelect()
          }}
        >
          <boxGeometry args={[0.28, slab.height, 0.52]} />
          <meshStandardMaterial
            color={slab.color}
            emissive={selected ? slab.color : palette.void}
            emissiveIntensity={selected ? 0.3 : 0.03}
            roughness={0.34}
            metalness={index === 1 ? 0.2 : 0.08}
          />
        </mesh>
      ))}
      <Html center distanceFactor={8} position={[0, -0.86, 0]} className="scene3d-label scene3d-label--mlp">
        <span aria-hidden="true">MLP · {hiddenSize}→{hiddenSize * 4}→{hiddenSize}</span>
      </Html>
    </group>
  )
}

function OutputNode({
  position,
  token,
  selected,
  onSelect,
}: {
  position: ScenePosition
  token: string
  selected: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={position as [number, number, number]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        scale={selected || hovered ? 1.14 : 1}
        rotation={[0.25, 0.35, 0]}
      >
        <octahedronGeometry args={[0.48, 0]} />
        <meshStandardMaterial
          color={selected ? palette.outputSelected : palette.output}
          emissive={selected ? palette.outputSelected : palette.void}
          emissiveIntensity={selected ? 0.28 : 0.03}
          roughness={0.28}
          metalness={0.2}
        />
      </mesh>
      <Html center distanceFactor={8} position={[0, -0.76, 0]} className="scene3d-label scene3d-label--output">
        <span aria-hidden="true">NEXT · {token}</span>
      </Html>
    </group>
  )
}

function QKVGate({
  position,
  selected,
  onSelect,
}: {
  position: ScenePosition
  selected: boolean
  onSelect: () => void
}) {
  const channels = [
    { label: 'Q', color: '#e87a4d', y: 0.62 },
    { label: 'K', color: '#64aee0', y: 0 },
    { label: 'V', color: '#6dcf9a', y: -0.62 },
  ]
  return (
    <group position={position as [number, number, number]}>
      {channels.map((channel) => (
        <group key={channel.label} position={[0, channel.y, 0]}>
          <mesh
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
            }}
            scale={selected ? 1.08 : 1}
          >
            <boxGeometry args={[0.7, 0.34, 0.7]} />
            <meshStandardMaterial
              color={channel.color}
              emissive={selected ? channel.color : palette.void}
              emissiveIntensity={selected ? 0.25 : 0.02}
              roughness={0.38}
            />
          </mesh>
          <Html center distanceFactor={8} className="scene3d-label scene3d-label--channel">
            <span aria-hidden="true">{channel.label}</span>
          </Html>
        </group>
      ))}
    </group>
  )
}

function CameraRig({
  focus,
  cameraMode,
  reducedMotion,
}: {
  focus: ScenePosition
  cameraMode: 'guided' | 'manual'
  reducedMotion: boolean
}) {
  const { camera } = useThree()
  const pose = useMemo(() => getGuidedCameraPose(focus), [focus])
  const desiredPosition = useMemo(() => new Vector3(...pose.position), [pose.position])
  const desiredTarget = useMemo(() => new Vector3(...pose.target), [pose.target])

  useFrame((_, delta) => {
    if (cameraMode === 'manual') return
    const alpha = getCameraTransitionAlpha(delta, reducedMotion)
    camera.position.lerp(desiredPosition, alpha)
    camera.lookAt(desiredTarget)
  })

  return null
}

function WebGLContextGuard({
  onLost,
}: {
  readonly onLost: () => void
}) {
  const { gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      onLost()
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.dataset.contextListener = 'ready'
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      delete canvas.dataset.contextListener
    }
  }, [gl, onLost])

  return null
}

function SceneGraph({
  store,
  trace,
  layout,
  selectedEntityId,
  selectedTokenIndex,
  selectedHeadIndex,
  cameraMode,
  reducedMotion,
  reducedDetail,
  onContextLost,
}: {
  store: ExplorerStoreApi
  trace: ModelTrace
  layout: SceneLayout
  selectedEntityId: TraceEntityId | null
  selectedTokenIndex: number | null
  selectedHeadIndex: number | null
  cameraMode: 'guided' | 'manual'
  reducedMotion: boolean
  reducedDetail: boolean
  onContextLost: () => void
}) {
  const focus = getSceneFocus(layout, selectedEntityId)
  const attentionPosition = layout.byId['operation:attention'].position
  const qkvPosition = layout.byId['operation:qkv'].position
  const attentionResidualPosition = layout.byId['operation:residual-attention'].position
  const mlpNormPosition = layout.byId['operation:mlp-layernorm'].position
  const mlpPosition = layout.byId['operation:mlp'].position
  const mlpResidualPosition = layout.byId['operation:residual-mlp'].position
  const controlsTarget = useMemo(() => new Vector3(...focus), [focus])

  return (
    <>
      <color attach="background" args={[palette.void]} />
      <fog attach="fog" args={[palette.void, 8, 20]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 7, 5]} intensity={2.1} color="#ffe1a3" />
      <pointLight position={[-4, 2, 3]} intensity={18} distance={9} color="#64aee0" />

      <mesh position={[0, -2.05, 0.35]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[11, 7]} />
        <meshStandardMaterial color="#111d30" transparent opacity={0.62} roughness={0.78} />
      </mesh>
      <gridHelper args={[11, 22, '#35516e', '#1c2b41']} position={[0, -2.03, 0.35]} />

      {!reducedDetail &&
        layout.tokens.map((token) => (
          <Line
            key={`${token.id}-qkv`}
            points={[[token.position[0], -0.25, 0.5], qkvPosition]}
            color={selectedEntityId === token.id || selectedEntityId === 'operation:qkv' ? '#f6be55' : '#37526e'}
            lineWidth={selectedEntityId === token.id || selectedEntityId === 'operation:qkv' ? 1.8 : 0.65}
            transparent
            opacity={0.72}
          />
        ))}
      {layout.heads.map((head) => (
        <Line
          key={`qkv-${head.id}`}
          points={[qkvPosition, head.position]}
          color={selectedEntityId === head.id || selectedEntityId === 'operation:qkv' ? '#f6be55' : '#49647f'}
          lineWidth={selectedEntityId === head.id || selectedEntityId === 'operation:qkv' ? 2 : 0.9}
        />
      ))}
      {layout.heads.map((head) => (
        <Line
          key={`${head.id}-concat`}
          points={[head.position, attentionPosition]}
          color={selectedEntityId === head.id || selectedEntityId === 'operation:attention' ? '#f6be55' : '#4f718e'}
          lineWidth={selectedEntityId === head.id || selectedEntityId === 'operation:attention' ? 2 : 0.9}
        />
      ))}
      <Line
        points={[attentionPosition, attentionResidualPosition]}
        color={selectedEntityId === 'operation:residual-attention' ? '#f6be55' : '#8e7650'}
        lineWidth={selectedEntityId === 'operation:residual-attention' ? 2 : 1.3}
      />
      <Line
        points={[layout.byId['operation:position-embedding'].position, attentionResidualPosition]}
        color={selectedEntityId === 'operation:residual-attention' ? '#f6be55' : '#6d5b43'}
        lineWidth={selectedEntityId === 'operation:residual-attention' ? 1.8 : 0.75}
        dashed
        dashSize={0.18}
        gapSize={0.12}
      />
      <Line
        points={[attentionResidualPosition, mlpNormPosition, mlpPosition, mlpResidualPosition]}
        color={selectedEntityId === 'operation:mlp' || selectedEntityId === 'operation:mlp-layernorm' ? '#f6be55' : '#6d628a'}
        lineWidth={selectedEntityId === 'operation:mlp' || selectedEntityId === 'operation:mlp-layernorm' ? 2 : 1.05}
      />
      <Line
        points={[attentionResidualPosition, mlpResidualPosition]}
        color={selectedEntityId === 'operation:residual-mlp' ? '#f6be55' : '#8e7650'}
        lineWidth={selectedEntityId === 'operation:residual-mlp' ? 1.8 : 0.75}
        dashed
        dashSize={0.18}
        gapSize={0.12}
      />
      <Line
        points={[mlpResidualPosition, layout.output.position]}
        color={selectedEntityId === 'operation:residual-mlp' ? '#f6be55' : '#597a69'}
        lineWidth={selectedEntityId === 'operation:residual-mlp' ? 2 : 1.3}
      />
      <TokenInstances
        trace={trace}
        layout={layout}
        selectedTokenIndex={selectedTokenIndex}
        onSelectToken={(index) => store.getState().selectToken(index)}
      />
      <EmbeddingLayer
        layout={layout}
        selectedEntityId={selectedEntityId}
        onSelectTokenEmbedding={() => store.getState().selectEntity('operation:embedding')}
        onSelectPositionEmbedding={() =>
          store.getState().selectEntity('operation:position-embedding')
        }
      />
      <NormalizationRail
        layout={layout}
        selected={selectedEntityId === 'operation:layernorm'}
        onSelect={() => store.getState().selectEntity('operation:layernorm')}
      />
      <QKVGate
        position={qkvPosition}
        selected={selectedEntityId === 'operation:qkv'}
        onSelect={() => store.getState().selectEntity('operation:qkv')}
      />
      {layout.heads.map((head, index) => (
        <HeadNode
          key={head.id}
          position={head.position}
          index={index}
          selected={selectedHeadIndex === index || selectedEntityId === head.id}
          onSelect={() => store.getState().selectHead(index)}
        />
      ))}
      <ConcatHub
        position={attentionPosition}
        headCount={trace.model.heads}
        headSize={trace.model.hiddenSize / trace.model.heads}
        selected={selectedEntityId === 'operation:attention'}
        onSelect={() => store.getState().selectEntity('operation:attention')}
      />
      <ResidualNode
        position={attentionResidualPosition}
        index={1}
        selected={selectedEntityId === 'operation:residual-attention'}
        onSelect={() => store.getState().selectEntity('operation:residual-attention')}
      />
      <MlpNormNode
        position={mlpNormPosition}
        selected={selectedEntityId === 'operation:mlp-layernorm'}
        onSelect={() => store.getState().selectEntity('operation:mlp-layernorm')}
      />
      <MlpTower
        position={mlpPosition}
        hiddenSize={trace.model.hiddenSize}
        selected={selectedEntityId === 'operation:mlp'}
        onSelect={() => store.getState().selectEntity('operation:mlp')}
      />
      <ResidualNode
        position={mlpResidualPosition}
        index={2}
        selected={selectedEntityId === 'operation:residual-mlp'}
        onSelect={() => store.getState().selectEntity('operation:residual-mlp')}
      />
      <OutputNode
        position={layout.output.position}
        token={trace.output.sampledToken}
        selected={selectedEntityId === layout.output.id}
        onSelect={() => store.getState().selectEntity(layout.output.id)}
      />

      <CameraRig focus={focus} cameraMode={cameraMode} reducedMotion={reducedMotion} />
      <WebGLContextGuard onLost={onContextLost} />
      <OrbitControls
        makeDefault
        target={controlsTarget}
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        minDistance={3.8}
        maxDistance={18}
        maxPolarAngle={Math.PI * 0.72}
        onStart={() => store.getState().setCameraMode('manual')}
      />
    </>
  )
}

function SceneFallback({
  trace,
  layout,
  message = '当前环境不提供可用 WebGL；课程、二维视图和三维实体选择仍可完整使用。',
}: {
  trace: ModelTrace
  layout: SceneLayout
  message?: string
}) {
  return (
    <div className="scene3d-fallback" role="img" aria-label="三维场景安全预览">
      <svg viewBox="0 0 760 390" aria-hidden="true">
        <path className="scene3d-fallback__plane" d="M80 300 430 92 695 226 342 350Z" />
        <g className="scene3d-fallback__embedding" transform="translate(104 58)">
          <rect className="is-token" width="112" height="34" rx="5" />
          <text x="56" y="22" textAnchor="middle">TOKEN EMB</text>
          <text className="is-operator" x="132" y="23">＋</text>
          <rect className="is-position" x="154" width="112" height="34" rx="5" />
          <text x="210" y="22" textAnchor="middle">POSITION</text>
          <text className="is-operator" x="286" y="23">＝</text>
          <rect className="is-hidden" x="310" width="72" height="34" rx="5" />
          <text x="346" y="22" textAnchor="middle">X</text>
          <path className="is-flow" d="M346 34v18" />
          <rect className="is-normalized" x="300" y="52" width="92" height="30" rx="15" />
          <text x="346" y="72" textAnchor="middle">LAYER NORM</text>
        </g>
        {layout.tokens.map((token, index) => (
          <g key={token.id} transform={`translate(${125 + index * 82} ${290 - index * 34})`}>
            <circle r="13" />
            <text y="32" textAnchor="middle">T{index + 1}</text>
          </g>
        ))}
        <circle className="scene3d-fallback__core" cx="430" cy="154" r="28" />
        <text x="430" y="158" textAnchor="middle">H1 · 4D</text>
        <circle className="scene3d-fallback__core is-second-head" cx="462" cy="210" r="28" />
        <text x="462" y="214" textAnchor="middle">H2 · 4D</text>
        <path className="scene3d-fallback__head-line" d="M454 164 510 184M486 204 510 190" />
        <rect className="scene3d-fallback__concat" x="508" y="170" width="58" height="34" rx="5" />
        <text x="537" y="191" textAnchor="middle">CONCAT</text>
        <path className="scene3d-fallback__block-line" d="M566 187H586M610 187H628M690 187H708" />
        <circle className="scene3d-fallback__residual" cx="598" cy="187" r="13" />
        <text x="598" y="192" textAnchor="middle">＋</text>
        <path className="scene3d-fallback__bypass" d="M537 204v38h61v-42M598 200v52h122v-52" />
        <rect className="scene3d-fallback__mlp" x="628" y="158" width="62" height="58" rx="4" />
        <text x="659" y="181" textAnchor="middle">MLP</text>
        <text className="is-dimension" x="659" y="200" textAnchor="middle">
          {trace.model.hiddenSize}→{trace.model.hiddenSize * 4}→{trace.model.hiddenSize}
        </text>
        <circle className="scene3d-fallback__residual" cx="720" cy="187" r="13" />
        <text x="720" y="192" textAnchor="middle">＋</text>
        <path className="scene3d-fallback__output-line" d="M733 187 744 144" />
        <circle className="scene3d-fallback__output" cx="748" cy="132" r="12" />
      </svg>
      <p>{message}</p>
    </div>
  )
}

export function Scene3DPanel({
  store,
  isActive,
  capabilities = detectDeviceCapabilities(),
}: Scene3DPanelProps) {
  const trace = useStore(store, (state) => state.trace)
  const traceStatus = useStore(store, (state) => state.traceStatus)
  const currentStep = useStore(store, selectCurrentStep)
  const selectedEntity = useStore(store, selectSelectedEntity)
  const selectedEntityId = useStore(store, (state) => state.selectedEntityId)
  const selectedTokenIndex = useStore(store, (state) => state.selectedTokenIndex)
  const selectedHeadIndex = useStore(store, (state) => state.selectedHeadIndex)
  const cameraMode = useStore(store, (state) => state.cameraMode)
  const reducedMotion = useStore(store, (state) => state.reducedMotion)
  const layout = useMemo(() => (trace ? createSceneLayout(trace) : null), [trace])
  const [contextStatus, setContextStatus] = useState<'ready' | 'lost'>('ready')
  const [sceneRevision, setSceneRevision] = useState(0)
  const hasWebGL = capabilities.threeDMode !== 'none'
  const canRenderCanvas = hasWebGL && contextStatus === 'ready'
  const reducedDetail = capabilities.threeDMode === 'reduced'
  const handleContextLost = useCallback(() => {
    store.getState().setCameraMode('guided')
    setContextStatus('lost')
  }, [store])
  const retryContext = () => {
    setSceneRevision((revision) => revision + 1)
    setContextStatus('ready')
  }

  return (
    <section
      id="view-panel-3d"
      className={`workspace-panel scene-panel scene3d-panel${isActive ? ' is-mobile-active' : ''}`}
      role="tabpanel"
      aria-labelledby="mobile-view-3d"
    >
      <header className="scene-panel__header scene3d-header">
        <div>
          <p className="eyebrow">
            模型空间 ·{' '}
            {contextStatus === 'lost'
              ? 'Context 已暂停'
              : capabilities.threeDMode === 'full'
                ? 'WebGL 实时场景'
                : capabilities.threeDMode === 'reduced'
                  ? '简化 WebGL 场景'
                  : '安全预览'}
          </p>
          <h2 id="scene-heading">Transformer 微型观测场</h2>
        </div>
        <button
          className="scene-control"
          type="button"
          disabled={cameraMode === 'guided' || !trace}
          onClick={() => store.getState().setCameraMode('guided')}
        >
          <Focus size={17} aria-hidden="true" />
          返回讲解视角
        </button>
      </header>

      {trace && layout ? (
        <div className="scene3d-stage">
          {canRenderCanvas ? (
            <Canvas
              key={sceneRevision}
              className="scene3d-canvas"
              role="img"
              aria-label="可旋转的 Transformer 三维模型空间"
              dpr={reducedDetail ? 1 : [1, 1.5]}
              camera={{ position: [7, 5, 9], fov: 46, near: 0.1, far: 100 }}
              gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
              onPointerMissed={() => store.getState().selectEntity(null)}
            >
              <SceneGraph
                store={store}
                trace={trace}
                layout={layout}
                selectedEntityId={selectedEntityId}
                selectedTokenIndex={selectedTokenIndex}
                selectedHeadIndex={selectedHeadIndex}
                cameraMode={cameraMode}
                reducedMotion={reducedMotion}
                reducedDetail={reducedDetail}
                onContextLost={handleContextLost}
              />
            </Canvas>
          ) : (
            <SceneFallback
              trace={trace}
              layout={layout}
              message={
                contextStatus === 'lost'
                  ? '三维 Context 已丢失并暂停；当前选择与课程进度已保留。'
                  : undefined
              }
            />
          )}

          {contextStatus === 'lost' && (
            <div className="scene3d-context-alert" role="alert">
              <strong>三维渲染环境已丢失</strong>
              <p>可以尝试重新创建场景，或继续使用完整二维课程。</p>
              <div>
                <button type="button" onClick={retryContext}>
                  <RefreshCcw size={16} aria-hidden="true" />
                  尝试恢复三维
                </button>
                <button type="button" onClick={() => store.getState().setView('2d')}>
                  <ShieldCheck size={16} aria-hidden="true" />
                  切换到二维安全模式
                </button>
              </div>
            </div>
          )}

          <div className="scene3d-overlay" aria-hidden="true">
            <span>LAYER 01</span>
            <span>TOKEN AXIS</span>
          </div>
        </div>
      ) : (
        <div className="scene3d-loading" role="status">
          <Orbit size={28} aria-hidden="true" />
          <strong>{traceStatus === 'error' ? '三维轨迹暂不可用' : '正在建立模型空间'}</strong>
          <p>三维区域不会阻塞中文课程和二维计算。</p>
        </div>
      )}

      {trace && layout && (
        <>
          <div className="scene3d-readout">
            <div>
              <span>当前步骤</span>
              <strong>{currentStep?.title ?? '等待轨迹'}</strong>
            </div>
            <div>
              <span>当前焦点</span>
              <strong>{selectedEntity?.label ?? '场景总览'}</strong>
            </div>
            <div>
              <span>相机状态</span>
              <strong>{cameraMode === 'guided' ? '讲解视角' : '手动观察'}</strong>
            </div>
          </div>

          <nav className="scene3d-entities" aria-label="三维实体快捷选择">
            <div>
              <span>Token</span>
              {trace.input.tokens.map((token, index) => (
                <button
                  key={`${token}-${index}`}
                  type="button"
                  aria-label={`三维实体：Token ${index + 1} ${token.trim()}`}
                  aria-pressed={selectedTokenIndex === index}
                  onClick={() => store.getState().selectToken(index)}
                >
                  T{index + 1}
                </button>
              ))}
            </div>
            <div>
              <span>Embedding</span>
              <button
                type="button"
                aria-label="三维实体：Token Embedding"
                aria-pressed={selectedEntityId === 'operation:embedding'}
                onClick={() => store.getState().selectEntity('operation:embedding')}
              >
                TOKEN VEC
              </button>
              <button
                type="button"
                aria-label="三维实体：Position Embedding"
                aria-pressed={selectedEntityId === 'operation:position-embedding'}
                onClick={() =>
                  store.getState().selectEntity('operation:position-embedding')
                }
              >
                + POSITION
              </button>
            </div>
            <div>
              <span>Projection</span>
              <button
                type="button"
                aria-label="三维实体：LayerNorm"
                aria-pressed={selectedEntityId === 'operation:layernorm'}
                onClick={() => store.getState().selectEntity('operation:layernorm')}
              >
                NORM
              </button>
              <button
                type="button"
                aria-label="三维实体：Q K V Projection"
                aria-pressed={selectedEntityId === 'operation:qkv'}
                onClick={() => store.getState().selectEntity('operation:qkv')}
              >
                Q/K/V
              </button>
            </div>
            <div>
              <span>Attention</span>
              {layout.heads.map((head, index) => (
                <button
                  key={head.id}
                  type="button"
                  aria-label={`三维实体：Attention Head ${index + 1}`}
                  aria-pressed={selectedHeadIndex === index}
                  onClick={() => store.getState().selectHead(index)}
                >
                  H{index + 1}
                </button>
              ))}
              <button
                type="button"
                aria-label="三维实体：Multi-Head Concat"
                aria-pressed={selectedEntityId === 'operation:attention'}
                onClick={() => store.getState().selectEntity('operation:attention')}
              >
                CONCAT
              </button>
            </div>
            <div>
              <span>Block</span>
              <button
                type="button"
                aria-label="三维实体：Attention Residual"
                aria-pressed={selectedEntityId === 'operation:residual-attention'}
                onClick={() => store.getState().selectEntity('operation:residual-attention')}
              >
                RES 1
              </button>
              <button
                type="button"
                aria-label="三维实体：MLP LayerNorm"
                aria-pressed={selectedEntityId === 'operation:mlp-layernorm'}
                onClick={() => store.getState().selectEntity('operation:mlp-layernorm')}
              >
                LN 2
              </button>
              <button
                type="button"
                aria-label="三维实体：Feed-Forward MLP"
                aria-pressed={selectedEntityId === 'operation:mlp'}
                onClick={() => store.getState().selectEntity('operation:mlp')}
              >
                MLP
              </button>
              <button
                type="button"
                aria-label="三维实体：MLP Residual"
                aria-pressed={selectedEntityId === 'operation:residual-mlp'}
                onClick={() => store.getState().selectEntity('operation:residual-mlp')}
              >
                RES 2
              </button>
            </div>
            <div>
              <span>Output</span>
              <button
                type="button"
                aria-label={`三维实体：输出 Token ${trace.output.sampledToken}`}
                aria-pressed={selectedEntityId === layout.output.id}
                onClick={() => store.getState().selectEntity(layout.output.id)}
              >
                NEXT
              </button>
            </div>
          </nav>

          <p className="scene3d-description" aria-live="polite">
            <MousePointer2 size={15} aria-hidden="true" />
            {canRenderCanvas
              ? '拖动旋转、滚轮缩放；操作相机后可使用“返回讲解视角”。'
              : contextStatus === 'lost'
                ? '三维渲染已暂停；当前为安全预览，进度和选择不会丢失。'
                : '当前为安全预览；可使用下方实体按钮同步课程和二维选择。'}
            <span>1 Block · {trace.model.heads} Heads · {trace.input.tokens.length} Tokens</span>
          </p>
        </>
      )}
    </section>
  )
}
