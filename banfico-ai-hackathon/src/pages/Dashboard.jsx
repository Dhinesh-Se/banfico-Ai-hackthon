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

// ── Account category colours ─────────────────────────────────────────────────
const CAT_COLORS = {
  Personal:  { bg: 'from-violet-600 via-purple-500 to-fuchsia-500', pill: 'bg-violet-100 text-violet-700' },
  Business:  { bg: 'from-sky-600 via-blue-500 to-indigo-500',       pill: 'bg-sky-100 text-sky-700'      },
  Corporate: { bg: 'from-orange-500 via-amber-500 to-yellow-400',    pill: 'bg-amber-100 text-amber-700'  },
}
function catStyle(cat) {
  return CAT_COLORS[cat] || { bg: 'from-teal-500 via-sky-500 to-cyan-500', pill: 'bg-teal-100 text-teal-700' }
}

// ── Account type icon ─────────────────────────────────────────────────────────
function AccountIcon({ type }) {
  if (type === 'CACC') return <CreditCard size={16} />
  if (type === 'SVGS') return <Wallet size={16} />
  return <TrendingUp size={16} />
}

// ── Category filter tabs ──────────────────────────────────────────────────────
function CategoryTabs({ categories, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {['All', ...categories].map((cat) => (
        <button
          key={cat}
          type="button"
          id={`cat-tab-${cat.toLowerCase()}`}
          onClick={() => onChange(cat === 'All' ? null : cat)}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
            (active === null && cat === 'All') || active === cat
              ? 'bg-navy-900 text-white shadow-sm'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}

// ── Single account card in the selector list ──────────────────────────────────
function AccountCard({ account, balance, isSelected, onClick }) {
  const style = catStyle(account.accountCategory)
  return (
    <button
      id={`account-card-${account.accountId}`}
      type="button"
      onClick={onClick}
      className={`group w-full rounded-2xl border p-4 text-left transition-all ${
        isSelected
          ? 'border-navy-900 bg-navy-900 text-white shadow-lg'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${style.bg} text-white shadow-sm`}
        >
          <AccountIcon type={account.type} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${isSelected ? 'text-white' : 'text-navy-900'}`}>
            {account.nickname}
          </p>
          <p className={`text-[11px] ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
            {account.maskedNumber}
          </p>
        </div>
        <div className="text-right">
          <p className={`tnum text-sm font-bold ${isSelected ? 'text-white' : 'text-navy-900'}`}>
            {gbp(balance?.available ?? 0)}
          </p>
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isSelected ? 'bg-white/20 text-white' : style.pill
          }`}>
            {account.accountCategory}
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Selected account hero card ────────────────────────────────────────────────
function SelectedAccountHero({ account, balance, userName }) {
  const style = catStyle(account.accountCategory)
  return (
    <div className="card overflow-hidden">
      <div className={`bg-gradient-to-br ${style.bg} px-6 py-7 text-white`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.22em] text-white/70">
              {account.accountCategory} Account
            </p>
            <p className="mt-2 text-lg font-semibold">{account.nickname}</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-3 py-2 text-[11px] uppercase tracking-[.2em] text-white/90">
            {account.status || 'Active'}
          </div>
        </div>

        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[.3em] text-white/70">Available Balance</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{gbp(balance?.available ?? 0)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[.3em] text-white/70">Currency</p>
            <p className="mt-2 text-base font-semibold">{account.currency || 'GBP'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-3xl bg-slate-50 p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[.22em] text-slate-400">Account holder</p>
              <p className="mt-2 font-medium text-navy-900">{userName}</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {account.maskedNumber}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {['Top up', 'Transfer', 'Request', 'History'].map((label) => (
            <button
              key={label}
              type="button"
              id={`account-action-${label.toLowerCase().replace(' ', '-')}`}
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
          <p className="mt-1 text-[12px] font-medium text-slate-400">"{question}"</p>
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
  const [data, setData]           = useState(null)
  const [obs, setObs]             = useState([])
  const [obsLoading, setObsLoading] = useState(true)
  const [aiMode, setAiMode]       = useState('local-rag:no-api-key')
  const [error, setError]         = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState(null)  // null = all accounts
  const [activeCategory, setActiveCategory]       = useState(null)  // null = all categories

  useEffect(() => {
    let alive = true

    api
      .getDashboard()
      .then((dashboard) => {
        if (!alive) return
        setData(dashboard)
        // Pre-select the first account so the hero card is never empty
        if (dashboard.accounts?.length) setSelectedAccountId(dashboard.accounts[0].accountId)
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

    return () => { alive = false }
  }, [])

  // ── derived state ─────────────────────────────────────────────────────────
  const { categories, filteredAccounts, selectedAccount, selectedBalance, selectedTransactions } =
    useMemo(() => {
      if (!data) return { categories: [], filteredAccounts: [], selectedAccount: null, selectedBalance: null, selectedTransactions: [] }

      const { accounts, balances, transactions } = data

      // All distinct categories in the data
      const categories = [...new Set(accounts.map((a) => a.accountCategory).filter(Boolean))]

      // Accounts visible in the selector after category filter
      const filteredAccounts = activeCategory
        ? accounts.filter((a) => a.accountCategory === activeCategory)
        : accounts

      const selectedAccount = accounts.find((a) => a.accountId === selectedAccountId) || accounts[0]
      const selectedBalance  = balances.find((b) => b.accountId === selectedAccount?.accountId) || { available: 0 }

      // Transactions for the selected account (or all if no selection)
      const selectedTransactions = selectedAccountId
        ? transactions.filter((t) => t.accountId === selectedAccountId)
        : transactions

      return { categories, filteredAccounts, selectedAccount, selectedBalance, selectedTransactions }
    }, [data, activeCategory, selectedAccountId])

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
  const netWorth   = balances.reduce((t, b) => t + b.available, 0)
  const spent      = insights.summary.expense
  const limitPct   = Math.min(Math.round((spent / DAILY_LIMIT) * 100), 100)

  return (
    <Shell
      title={`Hello, ${data.user?.name || 'Aarav'}`}
      subtitle={`Updated ${longDate(balances[0]?.asOf || new Date().toISOString())}`}
    >
      <div className="space-y-5">

        {/* ── Overview hero ─────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="bg-[#0b2135] px-6 py-7 text-white sm:px-8 sm:py-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="uppercase tracking-[.22em] text-slate-300">Dashboard overview</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {gbp(netWorth)} available across your accounts
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Your balances, spending and savings across {accounts.length} account{accounts.length !== 1 ? 's' : ''} — with real-time AI insights from Banfico.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoTile label="Income"  value={gbp(insights.summary.income)}  detail="This month" />
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

        <ScenarioDeck insights={insights} netWorth={netWorth} />

        {/* ── Account selector + per-account detail ─────────────────────── */}
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">

          {/* Left: account picker */}
          <div className="card p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow">Your accounts</p>
                <h2 className="mt-1 text-base font-semibold text-navy-900">
                  Select an account to view details
                </h2>
              </div>
              <CategoryTabs
                categories={categories}
                active={activeCategory}
                onChange={setActiveCategory}
              />
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {filteredAccounts.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  No accounts in this category.
                </p>
              )}
              {filteredAccounts.map((account) => (
                <AccountCard
                  key={account.accountId}
                  account={account}
                  balance={balances.find((b) => b.accountId === account.accountId)}
                  isSelected={account.accountId === selectedAccountId}
                  onClick={() => setSelectedAccountId(account.accountId)}
                />
              ))}
            </div>

            {/* Total for filtered set */}
            {filteredAccounts.length > 0 && (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    Total across {filteredAccounts.length} {activeCategory || ''} account{filteredAccounts.length !== 1 ? 's' : ''}
                  </span>
                  <span className="tnum font-semibold text-navy-900">
                    {gbp(filteredAccounts.reduce((sum, a) => {
                      const bal = balances.find((b) => b.accountId === a.accountId)
                      return sum + (bal?.available ?? 0)
                    }, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right: selected account hero */}
          {selectedAccount && (
            <SelectedAccountHero
              account={selectedAccount}
              balance={selectedBalance}
              userName={data.user?.name || 'Aarav Jain'}
            />
          )}
        </div>

        {/* ── Charts ────────────────────────────────────────────────────── */}
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <CashflowChart data={insights.byMonth} />
          <SpendByCategory data={insights.byCategory} />
        </div>

        {/* ── Transaction list (filtered by selected account) ────────────── */}
        <div className="grid gap-5 xl:grid-cols-[1.5fr_360px]">
          <div className="card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow">Transaction history</p>
                <h2 className="mt-1 text-base font-semibold text-navy-900">
                  {selectedAccount
                    ? `Transactions — ${selectedAccount.nickname}`
                    : 'All account movements'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {selectedAccountId && (
                  <button
                    type="button"
                    id="clear-account-filter"
                    onClick={() => setSelectedAccountId(null)}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-200"
                  >
                    Show all accounts
                  </button>
                )}
                <Link
                  to="/transactions"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-teal-600 transition hover:text-teal-500"
                >
                  View all <ArrowRight size={14} />
                </Link>
              </div>
            </div>
            <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
              <TransactionList items={selectedTransactions.slice(0, 8)} />
            </div>
          </div>

          {/* Right column: limits + AI status */}
          <div className="space-y-5">
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
                  You've spent {gbp(spent)} of your £{DAILY_LIMIT.toLocaleString()} monthly budget so far.
                </p>
              </div>
            </div>

            <RecentActivity items={selectedTransactions.slice(0, 4)} />

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
