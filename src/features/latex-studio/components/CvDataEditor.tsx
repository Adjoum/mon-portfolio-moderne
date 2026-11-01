// Données du CV, vérifiables et corrigeables avant toute génération : identité, profil, expériences,
// formations, compétences, projets, langues, certifications, publications, centres d'intérêt.
import { useId, type ReactNode } from 'react'
import type { CvData } from '../lib/cvData'
import { btn, btnGhost, field, label } from './ui'

type Section = keyof Omit<CvData, 'identity' | 'summary' | 'interests'>

const LIMITS: Record<Section, number> = { experiences: 15, education: 10, skills: 10, projects: 10, languages: 8, certifications: 15, publications: 40 }

function Input({ label: text, value, onChange, placeholder, type = 'text', wide = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; wide?: boolean }) {
  const id = useId()
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className={label} htmlFor={id}>{text}</label>
      <input id={id} type={type} className={field} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} maxLength={300} />
    </div>
  )
}

function Area({ label: text, value, onChange, rows = 3, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  const id = useId()
  return (
    <div className="sm:col-span-2">
      <label className={label} htmlFor={id}>{text}</label>
      <textarea id={id} className={`${field} resize-y`} rows={rows} value={value} onChange={e => onChange(e.target.value)} maxLength={2000} />
      {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
    </div>
  )
}

function Group({ title, count, children, open = false }: { title: string; count?: number; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-[#21262d] bg-[#0f1318]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-bold text-gray-200 sm:min-h-9">
        <span>{title}{count !== undefined && <span className="ml-1.5 font-normal text-gray-500">({count})</span>}</span>
        <span aria-hidden="true" className="text-gray-500 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-3 border-t border-[#21262d] p-3">{children}</div>
    </details>
  )
}

/** Liste d'éléments : monter, descendre, supprimer, ajouter (dans la limite du serveur) */
function List<T>({ items, max, onChange, blank, addLabel, render }: {
  items: T[]; max: number; onChange: (items: T[]) => void; blank: () => T; addLabel: string
  render: (item: T, update: (patch: Partial<T>) => void) => ReactNode
}) {
  const move = (i: number, d: number) => {
    const next = [...items]
    const [it] = next.splice(i, 1)
    next.splice(i + d, 0, it)
    onChange(next)
  }
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-[#2a313c] p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">{render(item, patch => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}</div>
          <div className="mt-2 flex flex-wrap justify-end gap-1">
            <button type="button" className={btnGhost} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter">↑</button>
            <button type="button" className={btnGhost} onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Descendre">↓</button>
            <button type="button" className={btnGhost} onClick={() => onChange(items.filter((_, j) => j !== i))}>Supprimer</button>
          </div>
        </div>
      ))}
      <button type="button" className={`${btn} w-full`} onClick={() => onChange([...items, blank()])} disabled={items.length >= max}>+ {addLabel}</button>
    </>
  )
}

// Saisie conservée telle quelle (lignes et éléments vides compris, sinon impossible d'en ajouter) :
// les éléments vides sont écartés à la génération du code et à l'envoi au serveur.
const lines = (v: string[]) => v.join('\n')
const fromLines = (v: string) => v.split('\n').slice(0, 8)
const commas = (v: string[]) => v.join(', ')
const fromCommas = (v: string, max: number) => v.split(/,\s?/).slice(0, max)

export function CvDataEditor({ cv, onChange }: { cv: CvData; onChange: (cv: CvData) => void }) {
  const set = <K extends keyof CvData>(key: K, value: CvData[K]) => onChange({ ...cv, [key]: value })
  const id = cv.identity
  const setId = (patch: Partial<CvData['identity']>) => set('identity', { ...id, ...patch })
  const list = <K extends Section>(key: K) => (items: CvData[K]) => set(key, items)

  return (
    <div className="space-y-2">
      <Group title="Identité et coordonnées" open>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label="Nom complet" value={id.fullName} onChange={v => setId({ fullName: v })} wide />
          <Input label="Titre professionnel" value={id.headline} onChange={v => setId({ headline: v })} wide />
          <Input label="E-mail" type="email" value={id.email} onChange={v => setId({ email: v })} />
          <Input label="Téléphone" type="tel" value={id.phone} onChange={v => setId({ phone: v })} />
          <Input label="Ville, pays" value={id.location} onChange={v => setId({ location: v })} wide />
        </div>
        <p className="text-[11px] text-gray-500">Liens (LinkedIn, GitHub, portfolio) : adresses web uniquement.</p>
        <List items={id.links} max={6} onChange={links => setId({ links })} blank={() => ({ label: '', url: '' })} addLabel="Ajouter un lien"
          render={(l, u) => <><Input label="Libellé" value={l.label} onChange={v => u({ label: v })} /><Input label="Adresse" type="url" value={l.url} onChange={v => u({ url: v })} placeholder="https://" /></>} />
      </Group>

      <Group title="Profil">
        <Area label="Résumé" value={cv.summary} onChange={v => set('summary', v)} rows={4} />
      </Group>

      <Group title="Expériences" count={cv.experiences.length}>
        <List items={cv.experiences} max={LIMITS.experiences} onChange={list('experiences')} addLabel="Ajouter une expérience"
          blank={() => ({ id: '', role: '', organization: '', location: '', start: '', end: '', bullets: [] })}
          render={(e, u) => <>
            <Input label="Poste" value={e.role} onChange={v => u({ role: v })} />
            <Input label="Organisation" value={e.organization} onChange={v => u({ organization: v })} />
            <Input label="Lieu" value={e.location} onChange={v => u({ location: v })} wide />
            <Input label="Début" value={e.start} onChange={v => u({ start: v })} placeholder="2021" />
            <Input label="Fin" value={e.end} onChange={v => u({ end: v })} placeholder="aujourd’hui" />
            <Area label="Réalisations" value={lines(e.bullets)} onChange={v => u({ bullets: fromLines(v) })} hint="Une réalisation par ligne (8 au plus)." />
          </>} />
      </Group>

      <Group title="Formation" count={cv.education.length}>
        <List items={cv.education} max={LIMITS.education} onChange={list('education')} addLabel="Ajouter une formation"
          blank={() => ({ id: '', degree: '', institution: '', location: '', start: '', end: '', details: '' })}
          render={(d, u) => <>
            <Input label="Diplôme" value={d.degree} onChange={v => u({ degree: v })} />
            <Input label="Établissement" value={d.institution} onChange={v => u({ institution: v })} />
            <Input label="Début" value={d.start} onChange={v => u({ start: v })} />
            <Input label="Fin" value={d.end} onChange={v => u({ end: v })} />
            <Input label="Détails" value={d.details} onChange={v => u({ details: v })} wide />
          </>} />
      </Group>

      <Group title="Compétences" count={cv.skills.length}>
        <List items={cv.skills} max={LIMITS.skills} onChange={list('skills')} addLabel="Ajouter un groupe"
          blank={() => ({ id: '', category: '', items: [] })}
          render={(s, u) => <>
            <Input label="Catégorie" value={s.category} onChange={v => u({ category: v })} />
            <Input label="Compétences (séparées par des virgules)" value={commas(s.items)} onChange={v => u({ items: fromCommas(v, 25) })} />
          </>} />
      </Group>

      <Group title="Projets" count={cv.projects.length}>
        <List items={cv.projects} max={LIMITS.projects} onChange={list('projects')} addLabel="Ajouter un projet"
          blank={() => ({ id: '', name: '', description: '', link: '', technologies: [] })}
          render={(p, u) => <>
            <Input label="Nom" value={p.name} onChange={v => u({ name: v })} />
            <Input label="Lien" type="url" value={p.link} onChange={v => u({ link: v })} placeholder="https://" />
            <Input label="Technologies (virgules)" value={commas(p.technologies)} onChange={v => u({ technologies: fromCommas(v, 15) })} wide />
            <Area label="Description" value={p.description} onChange={v => u({ description: v })} rows={2} />
          </>} />
      </Group>

      <Group title="Langues" count={cv.languages.length}>
        <List items={cv.languages} max={LIMITS.languages} onChange={list('languages')} addLabel="Ajouter une langue"
          blank={() => ({ name: '', level: '' })}
          render={(l, u) => <><Input label="Langue" value={l.name} onChange={v => u({ name: v })} /><Input label="Niveau" value={l.level} onChange={v => u({ level: v })} /></>} />
      </Group>

      <Group title="Certifications" count={cv.certifications.length}>
        <List items={cv.certifications} max={LIMITS.certifications} onChange={list('certifications')} addLabel="Ajouter une certification"
          blank={() => ({ id: '', name: '', issuer: '', date: '' })}
          render={(c, u) => <><Input label="Intitulé" value={c.name} onChange={v => u({ name: v })} wide /><Input label="Organisme" value={c.issuer} onChange={v => u({ issuer: v })} /><Input label="Date" value={c.date} onChange={v => u({ date: v })} /></>} />
      </Group>

      <Group title="Publications" count={cv.publications.length}>
        <List items={cv.publications} max={LIMITS.publications} onChange={list('publications')} addLabel="Ajouter une publication"
          blank={() => ({ id: '', title: '', venue: '', year: '', authors: '' })}
          render={(p, u) => <><Input label="Titre" value={p.title} onChange={v => u({ title: v })} wide /><Input label="Auteurs" value={p.authors} onChange={v => u({ authors: v })} wide /><Input label="Revue ou conférence" value={p.venue} onChange={v => u({ venue: v })} /><Input label="Année" value={p.year} onChange={v => u({ year: v })} /></>} />
      </Group>

      <Group title="Centres d’intérêt">
        <Input label="Centres d’intérêt (séparés par des virgules)" value={commas(cv.interests)} onChange={v => set('interests', fromCommas(v, 12))} wide />
      </Group>
    </div>
  )
}
