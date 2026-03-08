import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import type { Visit, Stats } from '../lib/supabase'
import {
  Globe, Monitor, Clock, TrendingUp,
  Users, Eye, MapPin, RefreshCw
} from 'lucide-react'


function parseStats(visits: Visit[]): Stats {
  const today = new Date().toDateString()
  const pages: Record<string, number>     = {}
  const countries: Record<string, number> = {}
  const referrers: Record<string, number> = {}
  const screens: Record<string, number>   = {}
  const byHour = Array(24).fill(0)

  visits.forEach(v => {
    pages[v.page] = (pages[v.page] || 0) + 1

    const c = v.country || 'Inconnu'
    countries[c] = (countries[c] || 0) + 1

    const r = v.referrer
      ? new URL(v.referrer).hostname.replace('www.', '')
      : 'Direct'
    referrers[r] = (referrers[r] || 0) + 1

    const s = v.screen || 'Inconnu'
    screens[s] = (screens[s] || 0) + 1

    const h = new Date(v.created_at).getHours()
    byHour[h]++
  })

  return {
    total: visits.length,
    today: visits.filter(v => new Date(v.created_at).toDateString() === today).length,
    pages, countries, referrers, screens, byHour,
  }
}

function TopList({ data, icon, label }: {
  data: Record<string, number>
  icon: React.ReactNode
  label: string
}) {
  const sorted = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const max = sorted[0]?.[1] || 1

  return (
    <div className="glass-effect rounded-2xl p-5 border border-white/10">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-4">
        {icon} {label}
      </h3>
      <div className="space-y-2">
        {sorted.map(([key, count]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-gray-400 truncate w-32 shrink-0">{key}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(count / max) * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <span className="text-xs font-mono text-gray-400 w-6 text-right shrink-0">{count}</span>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-xs text-gray-600">Aucune donnée</p>
        )}
      </div>
    </div>
  )
}

function HourChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)
  return (
    <div className="glass-effect rounded-2xl p-5 border border-white/10">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-4">
        <Clock size={14} /> Visites par heure (aujourd'hui)
      </h3>
      <div className="flex items-end gap-1 h-20">
        {data.map((val, h) => (
          <motion.div
            key={h}
            className="flex-1 bg-gradient-to-t from-primary/60 to-secondary/40 rounded-sm"
            style={{ minHeight: 2 }}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(4, (val / max) * 100)}%` }}
            transition={{ duration: 0.6, delay: h * 0.02 }}
            title={`${h}h : ${val} visite(s)`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-600">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  )
}

function RecentVisits({ visits }: { visits: Visit[] }) {
  return (
    <div className="glass-effect rounded-2xl p-5 border border-white/10">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-4">
        <Eye size={14} /> Visites récentes
      </h3>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {visits.slice(0, 20).map(v => (
          <div key={v.id} className="flex items-center gap-3 py-2 border-b border-white/5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30
                            flex items-center justify-center text-xs shrink-0">
              {v.page === '/' ? '🏠' :
               v.page.includes('project') ? '📁' :
               v.page.includes('contact') ? '✉️' :
               v.page.includes('whiteboard') ? '🎨' : '📄'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-white truncate">{v.page}</div>
              <div className="text-[10px] text-gray-500 flex gap-2 mt-0.5">
                {v.country && <span>🌍 {v.city ? `${v.city}, ` : ''}{v.country}</span>}
                <span>{new Date(v.created_at).toLocaleString('fr-FR', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit'
                })}</span>
              </div>
            </div>
          </div>
        ))}
        {visits.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-8">Aucune visite enregistrée</p>
        )}
      </div>
    </div>
  )
}

export default function VisitorStats() {
  const [visits, setVisits]     = useState<Visit[]>([])
  const [loading, setLoading]   = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('visits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    setVisits(data || [])
    setLastUpdate(new Date())
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Refresh automatique toutes les 60 secondes
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  const stats = parseStats(visits)

  return (
    <div className="space-y-6">

      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Analytiques visiteurs</h2>
          <p className="text-xs text-gray-500 mt-1">
            Mis à jour : {lastUpdate.toLocaleTimeString('fr-FR')}
          </p>
        </div>
        <motion.button
          onClick={load}
          disabled={loading}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-2 glass-effect rounded-xl border border-white/10
                     text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </motion.button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total visites',    value: stats.total,   icon: <Users size={18} />,     color: 'from-violet-500 to-purple-600' },
          { label: "Aujourd'hui",      value: stats.today,   icon: <TrendingUp size={18} />, color: 'from-pink-500 to-rose-600' },
          { label: 'Pages uniques',    value: Object.keys(stats.pages).length,     icon: <Eye size={18} />,    color: 'from-cyan-500 to-blue-600' },
          { label: 'Pays',             value: Object.keys(stats.countries).length, icon: <Globe size={18} />,  color: 'from-emerald-500 to-teal-600' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-effect rounded-2xl p-4 border border-white/10"
          >
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${kpi.color}
                             flex items-center justify-center text-white mb-3`}>
              {kpi.icon}
            </div>
            <div className="text-2xl font-bold text-white">
              {loading ? '—' : kpi.value}
            </div>
            <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Graphique horaire */}
      <HourChart data={stats.byHour} />

      {/* Grille des tops */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <TopList data={stats.pages}     icon={<Monitor size={14} />} label="Pages les plus visitées" />
        <TopList data={stats.countries} icon={<MapPin size={14} />}  label="Pays"                    />
        <TopList data={stats.referrers} icon={<Globe size={14} />}   label="Sources de trafic"       />
      </div>

      {/* Visites récentes */}
      <RecentVisits visits={visits} />
    </div>
  )
}