// Quotas et budgets : budget global, concurrence, quotas et sous-budgets par fonctionnalité.
// Montants estimés à partir des tarifs : ce ne sont pas des plafonds de facturation.
import { useState } from 'react'
import { Save } from 'lucide-react'
import { aiAdmin, type FeatureState, type Overview } from '../api'
import { MICRO_PER_USD, featureLabel, formatUsd, ratio } from '../format'
import { Button, Card, Field, Meter, NoticeBanner } from '../ui'
import { inputClass } from '../styles'
import { useServerAction } from '../useServerAction'

const toUsd = (micro: number | null) => (micro === null ? '' : String(micro / MICRO_PER_USD))
const optionalUsd = (value: string) => (value.trim() === '' ? null : Number(value))

function QuotaRow({ feature, reload }: { feature: FeatureState; reload: () => Promise<unknown> }) {
  const q = feature.quotas
  const [form, setForm] = useState({
    perSubjectPerDay: String(q.perSubjectPerDay), globalPerDay: String(q.globalPerDay),
    perMinute: String(q.perMinute), concurrency: String(q.concurrency),
    dailyBudgetUsd: toUsd(q.dailyBudgetMicroUsd), monthlyBudgetUsd: toUsd(q.monthlyBudgetMicroUsd),
  })
  const { busy, notice, setNotice, run } = useServerAction(reload)
  const id = `quota-${feature.id.replace(/\W/g, '-')}`
  const field = (name: keyof typeof form, label: string, hint?: string) => (
    <Field label={label} htmlFor={`${id}-${name}`} hint={hint}>
      <input id={`${id}-${name}`} type="number" min={0} step={name.includes('Budget') ? 'any' : 1} value={form[name]}
        onChange={e => setForm({ ...form, [name]: e.target.value })} className={inputClass} />
    </Field>
  )

  const save = () => run('save', () => aiAdmin.saveQuotas(feature.id, {
    perSubjectPerDay: Number(form.perSubjectPerDay), globalPerDay: Number(form.globalPerDay),
    perMinute: Number(form.perMinute), concurrency: Number(form.concurrency),
    dailyBudgetUsd: optionalUsd(form.dailyBudgetUsd), monthlyBudgetUsd: optionalUsd(form.monthlyBudgetUsd), version: q.version,
  }), `${featureLabel(feature.id)} : quotas enregistrés.`)

  return (
    <Card title={featureLabel(feature.id)}>
      <p className="text-sm text-gray-400">
        Aujourd’hui : {feature.usage.dayRequests} requête(s), {formatUsd(feature.usage.dayCostMicroUsd)} · ce mois : {formatUsd(feature.usage.monthCostMicroUsd)}
      </p>
      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e => { e.preventDefault(); void save() }}>
        {field('perSubjectPerDay', 'Par visiteur et par jour')}
        {field('globalPerDay', 'Total par jour')}
        {field('perMinute', 'Par visiteur et par minute')}
        {field('concurrency', 'Requêtes simultanées')}
        {field('dailyBudgetUsd', 'Sous-budget journalier (USD)', 'Vide : pas de sous-limite')}
        {field('monthlyBudgetUsd', 'Sous-budget mensuel (USD)', 'Vide : pas de sous-limite')}
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" variant="primary" busy={busy === 'save'}><Save size={16} /> Enregistrer</Button>
        </div>
      </form>
    </Card>
  )
}

export default function BudgetsSection({ overview, reload }: { overview: Overview; reload: () => Promise<unknown> }) {
  const { budget } = overview
  const [daily, setDaily] = useState(toUsd(budget.dailyLimitMicroUsd))
  const [monthly, setMonthly] = useState(toUsd(budget.monthlyLimitMicroUsd))
  const [concurrency, setConcurrency] = useState(String(budget.globalConcurrency ?? 8))
  const { busy, notice, setNotice, run } = useServerAction(reload)

  return (
    <div className="space-y-4">
      <Card title="Budget global">
        <div className="grid gap-4 md:grid-cols-2">
          <Meter label="Aujourd’hui" used={ratio(budget.dayCostMicroUsd, budget.dailyLimitMicroUsd)} limit={100}
            text={`${formatUsd(budget.dayCostMicroUsd)} / ${formatUsd(budget.dailyLimitMicroUsd)}`} />
          <Meter label="Ce mois-ci" used={ratio(budget.monthCostMicroUsd, budget.monthlyLimitMicroUsd)} limit={100}
            text={`${formatUsd(budget.monthCostMicroUsd)} / ${formatUsd(budget.monthlyLimitMicroUsd)}`} />
        </div>
        <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={e => {
          e.preventDefault()
          void run('budget', () => aiAdmin.saveBudget(Number(daily), Number(monthly), Number(concurrency)), 'Budget global enregistré.')
        }}>
          <Field label="Budget journalier (USD)" htmlFor="ai-budget-daily">
            <input id="ai-budget-daily" type="number" min={0} step="any" required value={daily} onChange={e => setDaily(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Budget mensuel (USD)" htmlFor="ai-budget-monthly">
            <input id="ai-budget-monthly" type="number" min={0} step="any" required value={monthly} onChange={e => setMonthly(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Requêtes simultanées (toutes fonctions)" htmlFor="ai-budget-concurrency">
            <input id="ai-budget-concurrency" type="number" min={1} max={100} required value={concurrency} onChange={e => setConcurrency(e.target.value)} className={inputClass} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="primary" busy={busy === 'budget'}><Save size={16} /> Enregistrer le budget</Button>
          </div>
        </form>
        <p className="text-xs text-gray-500">
          Au-delà d’une limite, les nouvelles requêtes sont refusées avant tout appel au fournisseur. Ces montants sont
          estimés : définissez aussi un plafond de facturation dans la console de chaque fournisseur.
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {overview.features.map(f => <QuotaRow key={f.id} feature={f} reload={reload} />)}
      </div>
    </div>
  )
}
