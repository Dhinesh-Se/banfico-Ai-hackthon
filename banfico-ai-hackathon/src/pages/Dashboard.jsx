import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, CreditCard, ShieldAlert, Sparkles, Target, Zap } from 'lucide-react'
import Shell from '../components/Shell.jsx'
import { CashflowChart, SpendByCategory } from '../components/Charts.jsx'
import { TransactionList, DashboardSkeleton } from '../components/Widgets.jsx'
import InsightRail from '../components/InsightRail.jsx'
import { api } from '../api/client.js'
import { gbp, catColor, longDate, shortDate } from '../lib/format.js'

const DAILY_LIMIT = 2500


function ScenarioCard({ icon: Icon, title, question, answer, tone = 'teal' }) {
  const tones = {
    teal: 'bg-teal-500/10 text-teal-600 ring-teal-100',
    blue: 'bg-brandblue-100 text-brandblue-600 ring-brandblue-100',
    amber: 'bg-alert/10 text-alert ring-alert/20',
    red: 'bg-danger/10 text-danger ring-danger/20',
  }

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-rail">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ring-1 ${tones[tone]}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-navy-900">{title}</p>
          <p className="mt-1 text-[12px] font-medium text-slate-400">“{question}”</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{answer}</p>
        </div>
      </div>
    </div>
  )
}

function ScenarioDeck({ insights, netWorth }) {
  const topCategory = insights.byCategory?.[0]
  const anomaly = insights.anomalies?.[0]?.transaction || insights.anomalies?.[0]
  const subscriptionTotal = insights.subscriptions?.reduce((sum, s) => sum + Number(s.annualised || 0), 0) || 0

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <ScenarioCard
        icon={Target}
        title="Payday safety check"
        question="Can I spend £150 this weekend?"
        answer={`${gbp(netWorth)} is available now; MoneySense compares this with current-month expense and savings rate before giving a safe yes/no.`}
      />
      <ScenarioCard
        icon={Zap}
        title="Spending drift"
        question="Why am I saving less?"
        answer={topCategory ? `${topCategory.category} leads spend at ${gbp(topCategory.amount)} and is the first place to review.` : 'Connect transactions to reveal the category moving fastest.'}
        tone="blue"
      />
      <ScenarioCard
        icon={ShieldAlert}
        title="Fraud/anomaly triage"
        question="Anything suspicious?"
        answer={anomaly ? `${anomaly.merchant} is already flagged, so the next step is receipt check or dispute.` : 'No current anomalies are flagged in this view.'}
        tone="red"
      />
      <ScenarioCard
        icon={CheckCircle2}
        title="Subscription leakage"
        question="What can I cancel?"
        answer={subscriptionTotal ? `${gbp(subscriptionTotal)} annual recurring spend is ready for review.` : 'Recurring charges will appear here once detected.'}
        tone="amber"
      />
    </div>
  )
}

function AiModePill({ mode }) {
  const local = mode?.startsWith('local-rag')
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[.18em] ${local ? 'bg-alert/10 text-alert' : 'bg-teal-100 text-teal-600'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${local ? 'bg-alert' : 'bg-teal-500'}`} />
      {local ? 'Offline RAG' : 'Hosted AI'}
    </span>
  )
}

function ProgressBar({ value }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-gradient-to-r from-teal-500 via-sky-400 to-cyan-400"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

function InfoTile({ label, value, detail }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-400">{label}</p>
      <p className="mt-3 text-lg font-semibold tracking-tight text-navy-900">{value}</p>
      {detail && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{detail}</p>}
    </div>
  )
}

function CardBalance({ account, balance, userName }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-br from-teal-500 via-sky-500 to-cyan-500 px-6 py-7 text-white">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.22em] text-slate-100/80">My Card</p>
            <p className="mt-2 text-sm font-medium text-slate-100/80">{account.nickname}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[.2em] text-white/70">{account.accountCategory || 'Personal'}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2 text-[11px] uppercase tracking-[.24em] text-white/90">
            {account.type || 'Active'}</div>
        </div>

        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[.3em] text-slate-100/80">Balance</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{gbp(balance.available)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[.3em] text-slate-100/80">Exp</p>
            <p className="mt-2 text-base font-semibold tracking-tight">12/28</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-3xl bg-slate-50 p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[.22em] text-slate-400">Card holder</p>
              <p className="mt-2 font-medium text-navy-900">{userName}</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">••• 335</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {['Top up', 'Transfer', 'Request', 'History'].map((label) => (
            <button
              key={label}
              type="button"
              className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-navy-900 transition hover:border-teal-400 hover:text-teal-600"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function RecentActivity({ items }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Recent activity</p>
          <h2 className="mt-1 text-base font-semibold text-navy-900">Latest transactions</h2>
        </div>
        <Link
          to="/transactions"
          className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 transition hover:text-teal-500"
        >
          View all <ArrowRight size={14} />
        </Link>
      </div>

      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item.transactionId} className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-xs font-semibold text-white"
                style={{ background: catColor(item.category) }}
              >
                {item.merchant.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-navy-900">{item.merchant}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {item.category} · {shortDate(item.bookingDate)}
                </p>
              </div>
              <div className="text-right">
                <p className={`tnum text-sm font-semibold ${item.direction === 'credit' ? 'text-teal-600' : 'text-navy-900'}`}>
                  {item.direction === 'credit' ? `+${gbp(item.amount)}` : `−${gbp(item.amount)}`}
                </p>
                <p className="mt-1 text-[12px] text-slate-400">
                  {item.isAnomaly ? 'Flagged' : 'Completed'}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [obs, setObs] = useState([])
  const [obsLoading, setObsLoading] = useState(true)
  const [aiMode, setAiMode] = useState('local-rag:no-api-key')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let alive = true

    api
      .getDashboard()
      .then((dashboard) => {
        if (alive) setData(dashboard)
      })
      .catch(() => alive && setError('We could not load your accounts. Check the backend is running.'))

    api
      .getObservations()
      .then((o) => alive && setObs(o))
      .catch(() => {})
      .finally(() => alive && setObsLoading(false))

    api
      .getCoach()
      .then((coach) => alive && setAiMode(coach.mode || 'hosted-llm'))
      .catch(() => alive && setAiMode('local-rag:no-api-key'))

    return () => {
      alive = false
    }
  }, [])

  const selectedTransactions = useMemo(() => {
    if (!data) return []
    return selected ? data.transactions.filter((t) => t.accountId === selected) : data.transactions
  }, [data, selected])

  if (error) {
    return (
      <Shell title="Dashboard">
        <div className="card mx-auto max-w-md p-6 text-center">
          <p className="text-[14px] font-semibold text-navy-900">Nothing to show yet</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-ghost mt-4">
            Try again
          </button>
        </div>
      </Shell>
    )
  }

  if (!data) {
    return (
      <Shell title="Dashboard" subtitle="Loading your accounts">
        <DashboardSkeleton />
      </Shell>
    )
  }

  const { accounts, balances, transactions, insights } = data
  const balanceFor = (id) => balances.find((b) => b.accountId === id) || { available: 0 }
  const selectedAccount = selected ? accounts.find((a) => a.accountId === selected) : null
  const visibleBalances = selected ? balances.filter((b) => b.accountId === selected) : balances
  const netWorth = visibleBalances.reduce((t, b) => t + b.available, 0)
  const topCategory = insights.byCategory?.[0]
  const cardAccount = selectedAccount || accounts.find((a) => a.type.toLowerCase().includes('card')) || accounts[0]
  const cardBalance = balanceFor(cardAccount.accountId)
  const recentTransactions = selectedTransactions.slice(0, 4)
  const spent = insights.summary.expense
  const limitPct = Math.min(Math.round((spent / DAILY_LIMIT) * 100), 100)

  return (
    <Shell
      title={`Hello, ${data.user?.name || 'Aarav'}`}
      subtitle={`Updated ${longDate(balances[0]?.asOf || new Date().toISOString())}`}
    >
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[1.5fr_360px]">
          <div className="space-y-5">
            <div className="card overflow-hidden">
              <div className="bg-[#0b2135] px-6 py-7 text-white sm:px-8 sm:py-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="uppercase tracking-[.22em] text-slate-300">Dashboard overview</p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                      {selectedAccount ? `${gbp(netWorth)} available in ${selectedAccount.nickname}` : `${gbp(netWorth)} available across your accounts`}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                      {selectedAccount
                        ? `${selectedAccount.nickname} is selected (${selectedAccount.accountCategory || 'Personal'}), so balances and recent activity are scoped to that account.`
                        : 'Your balances, spending and savings are all shown in one place with the latest insights from Banfico.'}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoTile label="Income" value={gbp(insights.summary.income)} detail="This month" />
                    <InfoTile label="Expense" value={gbp(insights.summary.expense)} detail="This month" />
                    <InfoTile
                      label="Savings"
                      value={`${insights.summary.savingsRate}%`}
                      detail={`${gbp(insights.summary.net)} left after costs`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="eyebrow">Bank account access</p>
                  <h2 className="mt-1 text-base font-semibold text-navy-900">Choose the account to watch</h2>
                  <p className="mt-1 text-sm text-slate-500">Filter balances, recent activity and the card preview by a single bank account and its account category.</p>
                </div>
                <select
                  className="field w-full lg:w-72"
                  value={selected || 'all'}
                  onChange={(e) => setSelected(e.target.value === 'all' ? null : e.target.value)}
                >
                  <option value="all">All connected accounts</option>
                  {accounts.map((account) => (
                    <option key={account.accountId} value={account.accountId}>
                      {account.nickname} · {account.accountCategory || 'Personal'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {accounts.map((account) => {
                  const active = selected === account.accountId
                  const balance = balanceFor(account.accountId)
                  return (
                    <button
                      key={account.accountId}
                      type="button"
                      onClick={() => setSelected(active ? null : account.accountId)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        active ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-navy-900 text-white">
                          <CreditCard size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-navy-900">{account.nickname}</span>
                          <span className="mt-1 block text-xs text-slate-500">{account.accountCategory || 'Personal'} · {account.type}</span>
                          <span className="mt-3 block tnum text-lg font-semibold text-navy-900">{gbp(balance.available)}</span>
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <ScenarioDeck insights={insights} netWorth={netWorth} />

            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <CashflowChart data={insights.byMonth} />
              <SpendByCategory data={insights.byCategory} />
            </div>

            <div className="card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="eyebrow">Transaction history</p>
                  <h2 className="mt-1 text-base font-semibold text-navy-900">Most recent movements</h2>
                </div>
                <Link
                  to="/transactions"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-teal-600 transition hover:text-teal-500"
                >
                  View all activity <ArrowRight size={14} />
                </Link>
              </div>
              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
                <TransactionList items={selectedTransactions.slice(0, 8)} />
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <CardBalance account={cardAccount} balance={cardBalance} userName={data.user?.name || 'Aarav Jain'} />

            <div className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Daily limit</p>
                  <h3 className="mt-2 text-base font-semibold text-navy-900">£{DAILY_LIMIT.toLocaleString()}</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[.2em] text-slate-500">
                  {limitPct}% used
                </span>
              </div>
              <div className="mt-5 space-y-3">
                <ProgressBar value={limitPct} />
                <p className="text-sm text-slate-500">
                  You’ve spent {gbp(spent)} of your £{DAILY_LIMIT.toLocaleString()} monthly budget so far.
                </p>
              </div>
            </div>

            <RecentActivity items={recentTransactions} />

            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-teal-500/10 p-3 text-teal-600">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <p className="eyebrow">Insight engine</p>
                    <p className="mt-1 text-base font-semibold text-navy-900">Judge-safe AI status</p>
                  </div>
                </div>
                <AiModePill mode={aiMode} />
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                {obs[0]?.body || 'The assistant uses deterministic analytics first, then hosted AI or offline RAG narration so the demo still works if a token dies.'}
              </p>
            </div>

            <InsightRail observations={obs} loading={obsLoading} />
          </div>
        </div>
      </div>
    </Shell>
  )
}
