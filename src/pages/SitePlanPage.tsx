import React, { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion } from 'framer-motion'
import {
  Home, User, FolderGit2, Wrench, FileText, BrainCircuit, Mail, Boxes,
  Bot, Database, Cloud, Sparkles, Code2, PenTool, Network, Server,
} from 'lucide-react'

/* ──────────────────────────────────────────────────────────────────────────
 *  Plan du site — adjoumani-koffi.com
 *  Lib: @xyflow/react (React Flow v12)  ->  npm i @xyflow/react
 *  Adapte les `route:` et les libelles a ta structure reelle.
 * ────────────────────────────────────────────────────────────────────────── */

type Cat = 'root' | 'page' | 'feature' | 'project' | 'infra'

interface Item {
  id: string
  label: string
  sub?: string
  cat: Cat
  icon: keyof typeof ICONS
  route?: string
  parent?: string
}

const ICONS = {
  Home, User, FolderGit2, Wrench, FileText, BrainCircuit, Mail, Boxes,
  Bot, Database, Cloud, Sparkles, Code2, PenTool, Network, Server,
}

// palette par categorie (couleurs concretes car rendu hors Tailwind dans React Flow)
const CAT: Record<Cat, { accent: string; glow: string }> = {
  root:    { accent: '#a5b4fc', glow: 'rgba(129,140,248,.55)' },
  page:    { accent: '#6366f1', glow: 'rgba(99,102,241,.45)' },
  feature: { accent: '#22d3ee', glow: 'rgba(34,211,238,.45)' },
  project: { accent: '#ec4899', glow: 'rgba(236,72,153,.45)' },
  infra:   { accent: '#a78bfa', glow: 'rgba(167,139,250,.45)' },
}

const ITEMS: Item[] = [
  { id: 'root', label: 'adjoumani-koffi.com', sub: 'Portfolio', cat: 'root', icon: 'Sparkles' },

  // ── pages principales (navbar) ──
  { id: 'accueil', label: 'Accueil', cat: 'page', icon: 'Home', route: '/', parent: 'root' },
  { id: 'apropos', label: 'À propos', cat: 'page', icon: 'User', route: '/about', parent: 'root' },
  { id: 'projets', label: 'Projets', cat: 'page', icon: 'FolderGit2', route: '/projects', parent: 'root' },
  { id: 'competences', label: 'Compétences', cat: 'page', icon: 'Boxes', route: '/skills', parent: 'root' },
  { id: 'cv', label: 'CV', cat: 'page', icon: 'FileText', route: '/cv', parent: 'root' },
  { id: 'ialab', label: 'IA Lab', cat: 'page', icon: 'BrainCircuit', route: '/ia-lab', parent: 'root' },
  { id: 'contact', label: 'Contact', cat: 'page', icon: 'Mail', route: '/contact', parent: 'root' },
  { id: 'outils', label: 'Outils', sub: 'menu', cat: 'page', icon: 'Wrench', parent: 'root' },
  { id: 'backend', label: 'Backend / Infra', sub: 'blog-api', cat: 'infra', icon: 'Server', parent: 'root' },

  // ── IA Lab ──
  { id: 'clone', label: 'Clone IA', sub: 'RAG + Groq', cat: 'feature', icon: 'Bot', route: '/ia-lab', parent: 'ialab' },
  { id: 'kb', label: 'Knowledge Base', sub: 'admin', cat: 'feature', icon: 'Database', parent: 'ialab' },
  { id: 'blog', label: 'Blog', cat: 'feature', icon: 'FileText', parent: 'ialab' },

  // ── Outils ──
  { id: 'codeforge', label: 'CodeForge', sub: 'WebIDE', cat: 'feature', icon: 'Code2', route: '/playground', parent: 'outils' },
  { id: 'novamind', label: 'NovaMind', sub: 'diagrammes', cat: 'feature', icon: 'Network', parent: 'outils' },
  { id: 'inkspace', label: 'InkSpace v3', sub: 'whiteboard', cat: 'feature', icon: 'PenTool', parent: 'outils' },

  // ── Projets vitrines ──
  { id: 'immoci', label: 'ImmoCI', cat: 'project', icon: 'FolderGit2', parent: 'projets' },
  { id: 'supermart', label: 'SuperMart Pro', cat: 'project', icon: 'FolderGit2', parent: 'projets' },
  { id: 'mediquick', label: 'MediQuick', cat: 'project', icon: 'FolderGit2', parent: 'projets' },
  { id: 'rekord', label: 'REKORD', cat: 'project', icon: 'FolderGit2', parent: 'projets' },
  { id: 'pulmocollect', label: 'PulmoCollect', cat: 'project', icon: 'FolderGit2', parent: 'projets' },
  { id: 'africonnect', label: 'AfriConnect', cat: 'project', icon: 'FolderGit2', parent: 'projets' },

  // ── Infra ──
  { id: 'pinecone', label: 'Pinecone', sub: 'vecteurs', cat: 'infra', icon: 'Network', parent: 'backend' },
  { id: 'mongo', label: 'MongoDB', cat: 'infra', icon: 'Database', parent: 'backend' },
  { id: 'cloudinary', label: 'Cloudinary', sub: 'images', cat: 'infra', icon: 'Cloud', parent: 'backend' },
  { id: 'groq', label: 'Groq', sub: 'LLM', cat: 'infra', icon: 'Sparkles', parent: 'backend' },
]

// ── layout en arbre (tidy tree) ──
const LEVEL_H = 200
const LEAF_GAP = 215

function computeLayout(items: Item[]) {
  const childrenOf: Record<string, string[]> = {}
  for (const it of items) {
    if (it.parent) (childrenOf[it.parent] ||= []).push(it.id)
  }
  const pos = new Map<string, { x: number; y: number }>()
  let leaf = 0
  const place = (id: string, depth: number): number => {
    const kids = childrenOf[id] || []
    let x: number
    if (kids.length === 0) {
      x = leaf * LEAF_GAP
      leaf++
    } else {
      const xs = kids.map((k) => place(k, depth + 1))
      x = (xs[0] + xs[xs.length - 1]) / 2
    }
    pos.set(id, { x, y: depth * LEVEL_H })
    return x
  }
  place('root', 0)
  return pos
}

// ── noeud personnalise ──
function SiteNode({ data }: NodeProps) {
  const item = (data as any).item as Item
  const Icon = ICONS[item.icon]
  const c = CAT[item.cat]
  const isRoot = item.cat === 'root'
  return (
    <div
      className="apf-flow-node"
      style={{
        ['--accent' as any]: c.accent,
        ['--glow' as any]: c.glow,
        minWidth: isRoot ? 220 : 150,
        cursor: item.route ? 'pointer' : 'default',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="apf-flow-node__icon" style={{ borderColor: c.accent, color: c.accent }}>
        <Icon size={isRoot ? 22 : 17} />
      </div>
      <div className="apf-flow-node__txt">
        <div className="apf-flow-node__label" style={{ fontSize: isRoot ? 15 : 13 }}>{item.label}</div>
        {item.sub && <div className="apf-flow-node__sub">{item.sub}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { site: SiteNode }

const STYLE_ID = 'site-plan-styles'
const CSS = `
.apf-flow-node {
  display:flex; align-items:center; gap:10px;
  padding:10px 14px; border-radius:16px;
  background: rgba(20,20,35,.65); backdrop-filter: blur(12px);
  border:1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  box-shadow: 0 0 0 1px rgba(255,255,255,.04), 0 8px 30px -8px var(--glow);
  color:#e5e7eb; transition: transform .25s cubic-bezier(.2,.7,.2,1), box-shadow .25s ease;
  animation: apf-node-pulse 4s ease-in-out infinite;
}
.apf-flow-node:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 0 0 1px var(--accent), 0 14px 40px -6px var(--glow); }
.apf-flow-node__icon {
  flex:0 0 auto; width:34px; height:34px; border-radius:11px;
  display:flex; align-items:center; justify-content:center;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border:1px solid; 
}
.apf-flow-node__txt { display:flex; flex-direction:column; line-height:1.15; }
.apf-flow-node__label { font-weight:700; letter-spacing:-.01em; }
.apf-flow-node__sub { font-size:10px; font-family:ui-monospace,monospace; color:#9ca3af; margin-top:1px; }
@keyframes apf-node-pulse {
  0%,100% { box-shadow: 0 0 0 1px rgba(255,255,255,.04), 0 8px 26px -10px var(--glow); }
  50%     { box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 10px 34px -6px var(--glow); }
}
.react-flow__edge-path { stroke-width:1.6; }
.react-flow__attribution { background: transparent; }
@media (prefers-reduced-motion: reduce) {
  .apf-flow-node { animation: none; }
}
`

const LEGEND: { cat: Cat; label: string }[] = [
  { cat: 'page', label: 'Pages' },
  { cat: 'feature', label: 'Fonctionnalités' },
  { cat: 'project', label: 'Projets' },
  { cat: 'infra', label: 'Backend / Infra' },
]

const SitePlanPage: React.FC = () => {
  // injecte le CSS des noeuds une seule fois
  React.useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }
  }, [])

  const { nodes, edges } = useMemo(() => {
    const pos = computeLayout(ITEMS)
    const byId = new Map(ITEMS.map((i) => [i.id, i]))

    const nodes: Node[] = ITEMS.map((it) => ({
      id: it.id,
      type: 'site',
      position: pos.get(it.id) || { x: 0, y: 0 },
      data: { item: it },
      draggable: true,
    }))

    const edges: Edge[] = ITEMS
      .filter((i) => i.parent)
      .map((i) => {
        const parent = byId.get(i.parent!)!
        const color = CAT[parent.cat === 'root' ? i.cat : parent.cat].accent
        return {
          id: `e-${i.parent}-${i.id}`,
          source: i.parent!,
          target: i.id,
          type: 'smoothstep',
          animated: true,
          style: { stroke: color, strokeOpacity: 0.6 },
        } as Edge
      })

    return { nodes, edges }
  }, [])

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    const route = (node.data as any)?.item?.route as string | undefined
    if (route) window.location.assign(route)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-28 pb-10 px-4 sm:px-6"
      style={{ background: 'radial-gradient(circle at 30% 0%, rgba(99,102,241,.10), transparent 55%), radial-gradient(circle at 80% 90%, rgba(236,72,153,.10), transparent 55%)' }}
    >
      <div className="text-center mb-6">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold">
          <span className="gradient-text">Plan du site</span>
        </h1>
        <p className="text-gray-400 mt-2 text-sm sm:text-base">
          Architecture interactive · glissez, zoomez, cliquez sur un nœud pour y aller
        </p>
      </div>

      <div className="rounded-3xl overflow-hidden border border-white/10 h-[calc(100vh-15rem)] min-h-[520px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: false }}
          nodesConnectable={false}
          edgesFocusable={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="rgba(129,140,248,.25)" />
          <Controls showInteractive={false} style={{ background: 'rgba(20,20,35,.7)', borderRadius: 12, border: '1px solid rgba(255,255,255,.08)' }} />
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(10,10,20,.6)"
            style={{ background: 'rgba(20,20,35,.7)', borderRadius: 12, border: '1px solid rgba(255,255,255,.08)' }}
            nodeColor={(n) => CAT[((n.data as any)?.item?.cat as Cat) || 'page'].accent}
          />
          <Panel position="top-left">
            <div className="flex flex-wrap gap-3 p-3 rounded-2xl" style={{ background: 'rgba(20,20,35,.7)', border: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(10px)' }}>
              {LEGEND.map((l) => (
                <div key={l.cat} className="flex items-center gap-2 text-xs text-gray-300">
                  <span className="w-3 h-3 rounded-full" style={{ background: CAT[l.cat].accent, boxShadow: `0 0 8px ${CAT[l.cat].glow}` }} />
                  {l.label}
                </div>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </motion.div>
  )
}

export default SitePlanPage