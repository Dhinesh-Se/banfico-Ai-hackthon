// ═══════════════════════════════════════════════════════════════
// THE CONTRACT
//
// This file is the agreement between the three of us. Dev 1 makes the
// backend return these shapes; Dev 2 renders them; Dev 3's tools consume
// them. Change it only by talking to the other two.
//
//  GET  /api/accounts
//       -> [{ accountId, nickname, type, bank, currency, maskedNumber, iban }]
//
//  GET  /api/balances
//       -> [{ accountId, currency, available, current, asOf }]
//
//  GET  /api/performance/dashboard
//       -> { accounts, balances, transactions, overview }
//
//  GET  /api/transactions?accountId=&from=&to=
//       -> [{ transactionId, accountId, bookingDate, amount, currency,
//             direction: 'credit'|'debit', merchant, description,
//             category, isSubscription, isAnomaly, anomalyReason? }]
//       NOTE: amount is always POSITIVE. `direction` carries the sign.
//
//  GET  /api/insights
//       -> { period, summary: { income, expense, net, savingsRate },
//            byCategory: [{ category, amount, previous, pctChange }],
//            byMonth:    [{ month, label, income, expense }],
//            subscriptions: [{ merchant, amount, cadence, annualised }],
//            anomalies:  [ transaction ] }
//
//  GET  /api/performance/dashboard
//       -> { accounts, balances, transactions, insights }
//
//  GET  /api/observations
//       -> [{ id, severity: 'good'|'info'|'alert'|'danger',
//             title, body, action: { type, label, payload } | null }]
//
//  POST /api/assistant/chat   { messages: [{ role, content }] }
//       -> { reply, proposedAction: { type, label, payload } | null }
//
//  POST /api/actions/execute  { type, payload }
//       -> { ok, message }
// ═══════════════════════════════════════════════════════════════

import * as mock from '../data/mock.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function getToken() {
  return localStorage.getItem('bf.sessionToken') || null
}

async function live(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${options?.method || 'GET'} ${path} failed (${res.status})${text ? `: ${text}` : ''}`)
  }

  return res.json()
}

function mapAccount(account) {
  return {
    ...account,
    type: account.accountType || account.type || 'Account',
    accountCategory: account.accountCategory || 'Personal',
    maskedNumber: account.accountNumber?.slice(-4) ? `•••• ${account.accountNumber.slice(-4)}` : '•••• 0000',
  }
}

function mapBalance(balance) {
  return {
    ...balance,
    available: Number(balance.amount ?? balance.available ?? 0),
    current: Number(balance.amount ?? balance.current ?? 0),
    asOf: balance.asOf || new Date().toISOString(),
  }
}

function mapTransaction(tx) {
  const amount = Number(tx.amount ?? 0)
  return {
    ...tx,
    transactionId: tx.transactionId || `${tx.accountId}-${tx.merchant}-${tx.bookedOn}`,
    bookingDate: tx.bookedOn || tx.bookingDate || '',
    amount,
    direction: tx.credit ? 'credit' : 'debit',
    merchant: tx.merchant || tx.description || 'Transaction',
    category: tx.category || 'Other',
    isSubscription: Boolean(tx.isSubscription),
    isAnomaly: Boolean(tx.isAnomaly),
  }
}

function mapInsights(raw) {
  return {
    summary: {
      income: Number(raw?.monthly?.reduce((sum, m) => sum + Number(m.income || 0), 0) || 0),
      expense: Number(raw?.monthly?.reduce((sum, m) => sum + Number(m.expense || 0), 0) || 0),
      net: Number(raw?.monthly?.reduce((sum, m) => sum + Number(m.net || 0), 0) || 0),
      savingsRate: Number(raw?.monthly?.[raw.monthly.length - 1]?.savingsRate ?? 0),
    },
    byMonth: (raw?.monthly || []).map((m) => ({
      month: m.month,
      income: Number(m.income || 0),
      expense: Number(m.expense || 0),
      net: Number(m.net || 0),
      savingsRate: Number(m.savingsRate || 0),
    })),
    byCategory: (raw?.categories || []).map((c) => ({
      category: c.category,
      amount: Number(c.total || 0),
      previous: 0,
      pctChange: Number(c.changeVsPreviousMonth || 0),
    })),
    topMerchants: (raw?.topMerchants || []).map((m) => ({
      merchant: m.merchant,
      total: Number(m.total || 0),
      transactionCount: Number(m.transactionCount || 0),
    })),
    subscriptions: (raw?.subscriptions || []).map((s) => ({
      merchant: s.merchant,
      amount: Number(s.typicalAmount || 0),
      cadence: 'monthly',
      annualised: Number(s.estimatedAnnualCost || 0),
    })),
    anomalies: (raw?.anomalies || []).map((a) => ({
      ...a,
      transaction: mapTransaction(a.transaction),
    })),
    health: raw?.health || null,
  }
}


function mapHealthObservation(o, index = 0) {
  const severity = o.severity === 'warning' ? 'alert' : o.severity || 'info'
  return {
    id: `health-${index}`,
    severity,
    title: o.title || 'Financial health observation',
    body: o.detail || '',
    action: null,
  }
}

function buildObservationsFromOverview(raw = {}) {
  const observations = (raw.health?.observations || []).map(mapHealthObservation)

  ;(raw.anomalies || []).slice(0, 2).forEach((a, index) => {
    const tx = mapTransaction(a.transaction || {})
    observations.push({
      id: `anomaly-${tx.transactionId || index}`,
      severity: 'danger',
      title: `Check ${tx.merchant}`,
      body: `${gbpLike(tx.amount)} was flagged: ${a.reason || tx.anomalyReason || 'unusual compared with your normal pattern.'}`,
      action: {
        type: 'DRAFT_DISPUTE',
        label: 'Prepare dispute note',
        payload: { transactionId: tx.transactionId, amount: tx.amount },
      },
    })
  })

  ;(raw.subscriptions || []).slice(0, 1).forEach((sub) => {
    observations.push({
      id: `subscription-${sub.merchant}`,
      severity: 'info',
      title: `Review ${sub.merchant}`,
      body: `Recurring cost is about ${gbpLike(Number(sub.estimatedAnnualCost || 0))} per year. Confirm it is still worth keeping.`,
      action: null,
    })
  })

  return observations.slice(0, 5)
}

function gbpLike(value) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0))
}

export const api = {
  async login(username, password) {
    if (USE_MOCK) {
      await sleep(320)
      return { success: true, sessionToken: 'mock-token', message: 'mock login' }
    }

    const res = await fetch(`${BASE.replace('/api', '')}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || 'Login failed')
    if (data.sessionToken) localStorage.setItem('bf.sessionToken', data.sessionToken)
    return data
  },

  async getDashboard() {
    if (USE_MOCK) {
      await sleep(500)
      return {
        accounts: mock.accounts,
        balances: mock.balances,
        transactions: mock.transactions,
        insights: mock.insights,
      }
    }

    const raw = await live('/performance/dashboard')
    return {
      accounts: (raw.accounts || []).map(mapAccount),
      balances: (raw.balances || []).map(mapBalance),
      transactions: (raw.transactions || []).map(mapTransaction),
      insights: mapInsights(raw.overview || {}),
    }
  },

  async getAccounts() {
    if (USE_MOCK) return sleep(320).then(() => mock.accounts)
    const rows = await live('/accounts')
    return rows.map(mapAccount)
  },

  async getBalances() {
    if (USE_MOCK) return sleep(380).then(() => mock.balances)
    const rows = await live('/balances')
    return rows.map(mapBalance)
  },

  async getTransactions({ accountId } = {}) {
    if (USE_MOCK) {
      await sleep(440)
      return accountId ? mock.transactions.filter((t) => t.accountId === accountId) : mock.transactions
    }
    const path = accountId ? `/accounts/${encodeURIComponent(accountId)}/transactions` : '/transactions'
    const rows = await live(path)
    return rows.map(mapTransaction)
  },

  async getTransactionsPage({ page = 0, pageSize = 50 } = {}) {
    if (USE_MOCK) {
      await sleep(440)
      const start = page * pageSize
      const transactions = mock.transactions.slice(start, start + pageSize)
      return {
        transactions,
        page,
        pageSize,
        totalCount: mock.transactions.length,
        totalPages: Math.ceil(mock.transactions.length / pageSize),
      }
    }

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })
    const payload = await live(`/performance/transactions?${params.toString()}`)

    return {
      ...payload,
      transactions: (payload.transactions || []).map(mapTransaction),
    }
  },

  async getInsights() {
    if (USE_MOCK) return sleep(500).then(() => mock.insights)
    const raw = await live('/insights/overview')
    return mapInsights(raw)
  },

  async getDashboard() {
    if (USE_MOCK) {
      await sleep(500)
      return {
        accounts: mock.accounts,
        balances: mock.balances,
        transactions: mock.transactions,
        insights: mock.insights,
      }
    }

    const raw = await live('/performance/dashboard')
    return {
      accounts: (raw.accounts || []).map(mapAccount),
      balances: (raw.balances || []).map(mapBalance),
      transactions: (raw.transactions || []).map(mapTransaction),
      insights: mapInsights(raw.insights || raw.overview || {}),
    }
  },

  async getObservations() {
    if (USE_MOCK) return sleep(620).then(() => mock.observations)
    const raw = await live('/insights/overview')
    return buildObservationsFromOverview(raw)
  },

  async getCoach() {
    if (USE_MOCK) return sleep(300).then(() => ({ mode: 'local-rag:mock-demo', sources: ['health', 'category'] }))
    return live('/insights/coach')
  },

  async chat(messages) {
    if (USE_MOCK) {
      await sleep(900)
      return mockReply(messages.at(-1)?.content || '')
    }
    const res = await live('/chat', { method: 'POST', body: JSON.stringify({ message: messages.at(-1)?.content || '', history: messages }) })
    return {
      reply: res.reply || res.answer || '',
      proposedAction: res.proposedAction || null,
      mode: res.mode || 'hosted-llm',
      sources: res.sources || [],
    }
  },

  async executeAction(action) {
    if (USE_MOCK) {
      await sleep(700)
      return { ok: true, message: `${action.label} — done.` }
    }
    return live('/chat', { method: 'POST', body: JSON.stringify(action) })
  },
}

function mockReply(q) {
  const t = q.toLowerCase()
  if (t.includes('food') || t.includes('eating') || t.includes('takeaway')) {
    return {
      reply:
        'Eating out came to £428 this month across 22 purchases — 31% above your six-month average of £327. Deliveroo is the biggest single driver at £141 over four orders. Capping this category at £300 would put you back in line without touching your grocery spend.',
      proposedAction: {
        type: 'CREATE_BUDGET',
        label: 'Cap eating out at £300',
        payload: { category: 'Eating out', limit: 300 },
      },
    }
  }
  if (t.includes('save') || t.includes('saving')) {
    return {
      reply:
        'You have finished five of the last six months in surplus, averaging £340 spare after everything cleared. Your standing order is currently £200. Raising it to £340 still leaves your current account above its lowest point this year.',
      proposedAction: {
        type: 'CREATE_TRANSFER',
        label: 'Increase savings order to £340',
        payload: { from: 'ACC-1001', to: 'ACC-1002', amount: 340, cadence: 'monthly' },
      },
    }
  }
  if (t.includes('subscription') || t.includes('recurring')) {
    return {
      reply:
        'Six recurring charges total £84.93 a month, or £1,019 a year. Adobe Creative Cloud billed twice in June — that duplicate £19.97 is usually refundable. Guardian Digital shows no matching activity in your card history.',
      proposedAction: {
        type: 'DRAFT_DISPUTE',
        label: 'Draft a refund request to Adobe',
        payload: { amount: 19.97 },
      },
    }
  }
  if (t.includes('unusual') || t.includes('fraud') || t.includes('strange')) {
    return {
      reply:
        'Three things stand out. TechnoWorld Online took £899 on 11 July — about 17 times your typical Shopping transaction, from a merchant with no prior history. A Lisbon ATM withdrawal on 19 July carried a 2.75% non-sterling fee. And Adobe double-billed in June.',
      proposedAction: null,
    }
  }
  return {
    reply:
      'This is the mock assistant — Dev 3 replaces it with the real agent. Try asking about your food spending, subscriptions, savings capacity, or anything unusual.',
    proposedAction: null,
  }
}
