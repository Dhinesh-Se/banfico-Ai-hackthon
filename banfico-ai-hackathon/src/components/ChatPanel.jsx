import { useEffect, useRef, useState } from 'react'
import { Send, Mic, Check, Loader2, Sparkles } from 'lucide-react'
import { api } from '../api/client.js'

const OPENERS = [
  'Why is my food spending up?',
  'Which subscriptions can I drop?',
  'How much can I safely save?',
  'Anything unusual this month?',
]

export default function ChatPanel({ compact = false }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'I can see all three of your accounts and six months of history. Ask me anything about your money — or ask me to change something.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  async function send(text) {
    const content = (text ?? draft).trim()
    if (!content || busy) return
    setDraft('')
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setBusy(true)
    try {
      const res = await api.chat(next.filter((m) => m.role !== 'action'))
      setMessages([
        ...next,
        { role: 'assistant', content: res.reply, proposedAction: res.proposedAction || null, mode: res.mode, sources: res.sources || [] },
      ])
    } catch {
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: 'I could not reach the analysis service. Check that the backend is running and try again.',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  // Browser speech recognition — ~15 lines, and it lands hard in a demo.
  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang = 'en-GB'
    r.interimResults = false
    r.onresult = (e) => {
      const said = e.results[0][0].transcript
      setListening(false)
      send(said)
    }
    r.onerror = () => setListening(false)
    r.onend = () => setListening(false)
    setListening(true)
    r.start()
  }

  return (
    <div className={`card flex flex-col overflow-hidden ${compact ? 'h-[520px]' : 'h-[calc(100vh-172px)]'}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Sparkles size={15} className="text-teal-500" />
        <p className="text-[13.5px] font-semibold text-navy-900">Ask MoneySense</p>
        <span className="ml-auto font-mono text-[11px] text-slate-400">3 accounts in context</span>
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-[13px] text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            Reading your transactions
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {OPENERS.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-[12.5px] text-slate-600 transition hover:border-teal-500 hover:text-teal-600"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 p-3">
        <input
          className="field"
          placeholder="Ask about your spending, or tell me what to change"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={busy}
        />
        <button
          onClick={startVoice}
          aria-label="Speak your question"
          className={`rounded-lg border p-2.5 transition ${
            listening
              ? 'border-teal-500 bg-teal-100 text-teal-600'
              : 'border-slate-200 text-slate-500 hover:text-navy-800'
          }`}
        >
          <Mic size={17} />
        </button>
        <button onClick={() => send()} disabled={busy || !draft.trim()} className="btn-primary px-3.5 py-2.5" aria-label="Send">
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

function Bubble({ message }) {
  const [state, setState] = useState('idle')
  const [result, setResult] = useState('')
  const mine = message.role === 'user'

  async function approve() {
    setState('running')
    try {
      const res = await api.executeAction(message.proposedAction)
      setResult(res.message)
      setState('done')
    } catch {
      setResult('That did not go through.')
      setState('failed')
    }
  }

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[86%] ${mine ? '' : 'w-full'}`}>
        <div
          className={`animate-rise rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
            mine
              ? 'rounded-br-md bg-navy-900 text-white'
              : 'rounded-bl-md border border-slate-100 bg-slate-50 text-navy-800'
          }`}
        >
          {message.content}
        </div>

        {!mine && message.mode && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono">{message.mode}</span>
            {message.sources?.slice(0, 3).map((source) => (
              <span key={source} className="rounded-full bg-teal-100/60 px-2 py-0.5 text-teal-600">{source}</span>
            ))}
          </div>
        )}

        {/* The agentic moment: the assistant proposes, the human approves. */}
        {message.proposedAction && state !== 'done' && (
          <div className="mt-2 rounded-xl border border-teal-500/35 bg-teal-100/50 p-3">
            <p className="eyebrow text-teal-600">Suggested next step</p>
            <p className="mt-1 text-[13px] font-medium text-navy-900">{message.proposedAction.label}</p>
            <button onClick={approve} disabled={state === 'running'} className="btn-primary mt-2.5 w-full py-2 text-[13px]">
              {state === 'running' ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Setting it up
                </>
              ) : (
                'Approve'
              )}
            </button>
          </div>
        )}

        {state === 'done' && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-teal-100 px-3 py-2 text-[12.5px] font-medium text-teal-600">
            <Check size={14} /> {result}
          </p>
        )}
        {state === 'failed' && (
          <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{result}</p>
        )}
      </div>
    </div>
  )
}
