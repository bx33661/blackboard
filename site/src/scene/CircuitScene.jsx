import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

/*
 * The hero board. Every chip is a recorded node: its height is the recorded severity, its top face carries
 * the node type and title. Copper traces are explicit relations and signals run in their recorded direction.
 */

const TOP = 0.16;

export const CHIPS = [
  { id: 'goal', p: [-4.3, -2.75], s: [2.5, 1.15], h: 0.32, c: '#7fb4ff', zh: ['目标', '确认管理 API 的匿名访问边界'], en: ['Goal', 'Map the admin API access boundary'] },
  { id: 'hyp', p: [0.4, -2.95], s: [2.4, 1.05], h: 0.28, c: '#f2b44b', zh: ['猜测 · 待验证', '管理读接口可能遗漏统一鉴权'], en: ['Hypothesis · open', 'Read endpoints may skip auth'] },
  { id: 'fact', p: [4.5, -2.4], s: [2.2, 1.05], h: 0.22, c: '#22d3ee', zh: ['事实', '读写路由挂载不同中间件'], en: ['Fact', 'Read and write routes differ'] },
  { id: 'crit', p: [-4.1, 0.3], s: [2.4, 1.2], h: 1.35, c: '#ff5a5a', zh: ['发现 · 严重', '匿名暴露全量用户列表'], en: ['Finding · critical', 'User list exposed anonymously'] },
  { id: 'high', p: [-0.5, 0.15], s: [2.3, 1.1], h: 0.95, c: '#ff8a3d', zh: ['发现 · 高危', '导出接口跨租户越权'], en: ['Finding · high', 'Cross-tenant export access'] },
  { id: 'cur', p: [3.5, 1.15], s: [2.6, 1.25], h: 0.5, c: '#66e0ae', zh: ['问题 · 当前', '上传与导出能否组合利用'], en: ['Question · current', 'Can uploads chain with exports?'] },
  { id: 'obs', p: [-3.8, 3.05], s: [2.4, 1.05], h: 0.24, c: '#3fd1c0', zh: ['观察', '上传接口接受同源 SVG'], en: ['Observation', 'Upload accepts same-origin SVG'] },
  { id: 'med', p: [0.7, 3.2], s: [2.3, 1.05], h: 0.6, c: '#e9cf5a', zh: ['发现 · 中危', '导出文件可枚举下载路径'], en: ['Finding · medium', 'Export paths are enumerable'] },
];

// [from, to, polyline] — polylines on the board surface with 45° corners.
const TRACES = [
  ['goal', 'hyp', [[-3.05, -2.75], [-1.2, -2.75], [-0.9, -2.95], [-0.8, -2.95]]],
  ['fact', 'hyp', [[3.4, -2.4], [2.3, -2.4], [1.95, -2.75], [1.6, -2.75]]],
  ['hyp', 'high', [[0.4, -2.42], [0.4, -1.3], [-0.2, -0.7], [-0.2, -0.4]]],
  ['crit', 'high', [[-2.9, 0.3], [-1.65, 0.3]]],
  ['high', 'cur', [[0.65, 0.15], [1.5, 0.15], [2.0, 0.65], [2.2, 0.65]]],
  ['obs', 'med', [[-2.6, 3.05], [-0.6, 3.05], [-0.45, 3.2]]],
  ['med', 'cur', [[1.85, 3.2], [2.7, 3.2], [3.1, 2.8], [3.1, 1.78]]],
  ['fact', 'cur', [[4.5, -1.87], [4.5, -0.1], [4.1, 0.3], [4.1, 0.52]]],
  ['crit', 'obs', [[-4.1, 0.9], [-4.1, 2.1], [-3.8, 2.4], [-3.8, 2.52]]],
];

const SPEED = { reduced: 0.08, normal: 1 };

/* ---------- text textures for chip faces ---------- */
function useFaceTexture(chip, fontsReady, lang) {
  const [kind, title] = chip[lang] || chip.zh;
  return useMemo(() => {
    const scale = 220;
    const w = Math.round(chip.s[0] * scale);
    const h = Math.round(chip.s[1] * scale);
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = h * 2;
    const g = cv.getContext('2d');
    g.scale(2, 2);
    g.fillStyle = '#0e1614';
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, `${chip.c}38`);
    grad.addColorStop(1, `${chip.c}08`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = chip.c;
    g.fillRect(0, 0, 9, h);
    const pad = 30;
    g.font = '500 26px "Geist Variable", "PingFang SC", sans-serif';
    g.fillStyle = chip.c;
    g.fillText(kind, pad, 52);
    g.font = '600 36px "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Geist Variable", sans-serif';
    g.fillStyle = '#eef3f0';
    const max = w - pad * 2;
    let line = '';
    let y = 112;
    // Wrap CJK by character and Latin by word.
    const tokens = lang === 'en' ? title.split(/(\s+)/) : [...title];
    for (const tk of tokens) {
      if (line && g.measureText(line + tk).width > max) { g.fillText(line.trim(), pad, y); line = tk.trimStart(); y += 46; }
      else line += tk;
    }
    g.fillText(line, pad, y);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [chip, fontsReady, lang]);
}

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function Chip({ chip, index, hovered, setHovered, fontsReady, start, lang }) {
  const g = useRef();
  const body = useRef();
  const face = useRef();
  const tex = useFaceTexture(chip, fontsReady, lang);
  const isHover = hovered === chip.id;
  const glow = chip.h > 0.8;
  useFrame(({ clock }, dt) => {
    const k = easeOut((clock.elapsedTime - start.current - 0.25 - index * 0.11) / 0.9);
    const h = Math.max(0.001, chip.h * k);
    body.current.scale.y = h;
    body.current.position.y = h / 2;
    face.current.position.y = h + 0.003;
    face.current.material.opacity = k;
    const lift = isHover ? 0.18 : 0;
    g.current.position.y += (TOP + lift - g.current.position.y) * Math.min(1, dt * 10);
  });
  return (
    <group ref={g} position={[chip.p[0], TOP, chip.p[1]]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(chip.id); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(null); document.body.style.cursor = ''; }}>
      <mesh ref={body} castShadow>
        <boxGeometry args={[chip.s[0], 1, chip.s[1]]} />
        <meshStandardMaterial color="#141d1a" roughness={0.32} metalness={0.55} />
      </mesh>
      <mesh ref={face} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[chip.s[0] - 0.04, chip.s[1] - 0.04]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} color={isHover ? '#ffffff' : '#c9d2ce'} />
      </mesh>
      {/* pins along the long edges */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.03, side * (chip.s[1] / 2 + 0.05)]}>
          <boxGeometry args={[chip.s[0] * 0.8, 0.04, 0.08]} />
          <meshStandardMaterial color="#b9844f" metalness={1} roughness={0.3} />
        </mesh>
      ))}
      {(glow || isHover) && (
        <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[chip.s[0] + 0.7, chip.s[1] + 0.7]} />
          <meshBasicMaterial color={chip.c} transparent opacity={isHover ? 0.2 : 0.13} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {glow && (
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[chip.s[0] + 0.02, 0.03, chip.s[1] + 0.02]} />
          <meshBasicMaterial color={chip.c} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function polyline(points) {
  const pts = points.map(([x, z]) => new THREE.Vector3(x, TOP + 0.014, z));
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, lens, total: lens[lens.length - 1] };
}
function at({ pts, lens, total }, t, out) {
  const d = t * total;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < d) i++;
  const k = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
  return out.lerpVectors(pts[i - 1], pts[i], k);
}

function Trace({ from, to, points, index, hovered, start, speed }) {
  const line = useMemo(() => polyline(points), [points]);
  const pulses = useRef([]);
  const copper = useRef([]);
  const v = useMemo(() => new THREE.Vector3(), []);
  const active = hovered && (hovered === from || hovered === to);
  const dim = hovered && !active;
  useFrame(({ clock }) => {
    const t0 = clock.elapsedTime - start.current - 1.3 - index * 0.08;
    const on = t0 > 0;
    copper.current.forEach((m) => {
      if (!m) return;
      m.material.emissiveIntensity = active ? 2.2 : dim ? 0.15 : 0.7;
      m.material.opacity = easeOut(t0 / 0.6);
    });
    pulses.current.forEach((p, i) => {
      if (!p) return;
      p.visible = on && !dim;
      const t = ((t0 * 0.3 * speed + i * 0.5 + index * 0.137) % 1 + 1) % 1;
      at(line, t, v);
      p.position.copy(v);
      p.scale.setScalar((active ? 1.5 : 1) * (0.5 + Math.sin(t * Math.PI) * 0.7));
    });
  });
  return (
    <group>
      {line.pts.slice(1).map((b, i) => {
        const a = line.pts[i];
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = a.distanceTo(b);
        return (
          <mesh key={i} ref={(el) => (copper.current[i] = el)} position={mid} rotation-y={Math.atan2(b.x - a.x, b.z - a.z)}>
            <boxGeometry args={[0.085, 0.012, len + 0.085]} />
            <meshStandardMaterial color="#b9844f" metalness={1} roughness={0.25} emissive="#a8642a" transparent />
          </mesh>
        );
      })}
      {[0, 1].map((i) => (
        <mesh key={i} ref={(el) => (pulses.current[i] = el)} visible={false}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshBasicMaterial color={[2.2, 4, 3.2]} toneMapped={false} />
        </mesh>
      ))}
      {/* via at the destination */}
      <mesh position={line.pts[line.pts.length - 1]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.05, 0.1, 20]} />
        <meshStandardMaterial color="#d6b48a" metalness={1} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Cursor({ start }) {
  const chip = CHIPS.find((c) => c.id === 'cur');
  const gem = useRef();
  const rings = useRef([]);
  const beam = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = easeOut((t - start.current - 1.6) / 1.2);
    gem.current.rotation.y = t * 0.9;
    gem.current.position.y = TOP + chip.h + 0.9 + (1 - k) * 3 + Math.sin(t * 1.6) * 0.1;
    gem.current.scale.setScalar(Math.max(0.001, k));
    beam.current.material.opacity = 0.07 * k;
    rings.current.forEach((r, i) => {
      const q = (t * 0.42 + i / 3) % 1;
      r.scale.setScalar(0.7 + q * 3.4);
      r.material.opacity = 0.6 * (1 - q) * k;
    });
  });
  return (
    <group position={[chip.p[0], 0, chip.p[1]]}>
      <mesh ref={gem}>
        <octahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#66e0ae" emissive="#66e0ae" emissiveIntensity={2.6} metalness={0.3} roughness={0.1} toneMapped={false} />
      </mesh>
      <pointLight position={[0, TOP + chip.h + 1, 0]} color="#66e0ae" intensity={7} distance={6} />
      <mesh ref={beam} position={[0, TOP + chip.h + 0.42, 0]}>
        <coneGeometry args={[0.55, 0.95, 32, 1, true]} />
        <meshBasicMaterial color="#66e0ae" transparent side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => (rings.current[i] = el)} position={[0, TOP + 0.02, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.9, 0.94, 72]} />
          <meshBasicMaterial color="#66e0ae" transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Stars() {
  const ref = useRef();
  const geo = useMemo(() => {
    const n = 2200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 26 + Math.random() * 34;
      const t = Math.random() * Math.PI * 2;
      const u = Math.random() * 1.4 - 0.2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((_, dt) => { ref.current.rotation.y += dt * 0.01; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.13} color="#cdf5e6" transparent opacity={0.8} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function Board() {
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(15.6, 52, '#1b3a2e', '#11231c');
    g.position.y = TOP + 0.002;
    return g;
  }, []);
  return (
    <group>
      <mesh receiveShadow>
        <boxGeometry args={[16, 0.32, 10.2]} />
        <meshStandardMaterial color="#0a1310" roughness={0.4} metalness={0.35} />
      </mesh>
      <mesh position={[0, TOP + 0.001, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[15.6, 9.8]} />
        <meshStandardMaterial color="#0c1714" roughness={0.55} metalness={0.2} />
      </mesh>
      <primitive object={grid} />
      {[[-7.6, -4.7], [7.6, -4.7], [-7.6, 4.7], [7.6, 4.7]].map(([x, z], i) => (
        <mesh key={i} position={[x, TOP + 0.01, z]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.13, 0.24, 28]} />
          <meshStandardMaterial color="#c9a26b" metalness={1} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function Rig({ start }) {
  const { camera, pointer, size } = useThree();
  const look = useMemo(() => new THREE.Vector3(0, 0, 0.3), []);
  const tall = size.width / size.height < 1.2;
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const intro = 1 - easeOut((t - start.current) / 2.6);
    const tx = pointer.x * 1.4 + Math.sin(t * 0.11) * 0.9;
    const ty = (tall ? 27 : 10.2) + pointer.y * 0.9 + intro * 6;
    const tz = (tall ? 19 : 10.4) + Math.cos(t * 0.11) * 0.5 + intro * 4;
    const k = Math.min(1, dt * 1.6);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
    camera.lookAt(look);
  });
  return null;
}

function Scene({ speed, lang }) {
  const [hovered, setHovered] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);
  const start = useRef(0);
  const { clock } = useThree();
  useEffect(() => { start.current = clock.elapsedTime; }, [clock]);
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady(true)); }, []);
  return (
    <>
      <color attach="background" args={['#0a0f0d']} />
      <fog attach="fog" args={['#0a0f0d', 22, 64]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[-6, 12, 5]} intensity={1.2} color="#effff8" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[9, 3, -7]} intensity={0.7} color="#3fd1c0" />
      <directionalLight position={[2, 2, 10]} intensity={0.25} color="#d6b48a" />
      <Stars />
      <group>
        <Board />
        {CHIPS.map((c, i) => (
          <Chip key={c.id} chip={c} index={i} hovered={hovered} setHovered={setHovered} fontsReady={fontsReady} start={start} lang={lang} />
        ))}
        {TRACES.map(([from, to, pts], i) => (
          <Trace key={i} from={from} to={to} points={pts} index={i} hovered={hovered} start={start} speed={speed} />
        ))}
        <Cursor start={start} />
      </group>
      <Rig start={start} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={1.15} radius={0.7} />
        <Vignette offset={0.25} darkness={0.75} />
      </EffectComposer>
    </>
  );
}

export default function CircuitScene({ active = true, reduced = false, lang = 'zh' }) {
  return (
    <Canvas shadows dpr={[1, 1.75]} frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 18, 16], fov: 38, near: 0.1, far: 140 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}>
      <Scene speed={reduced ? SPEED.reduced : SPEED.normal} lang={lang} />
    </Canvas>
  );
}
