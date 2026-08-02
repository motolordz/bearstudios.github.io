import Link from "next/link";
import Logo from "@/components/Logo";

const FEATURES = [
  {
    title: "AI transaction questions",
    body: "Every unclear bank line becomes one plain-English question: who was it paid to, what was it for, why was it business. No jargon, no spreadsheets.",
  },
  {
    title: "SMS & email reminders",
    body: "Gentle, escalating nudges go out automatically — first reminder, second, final — so you never write another chase-up message.",
  },
  {
    title: "Receipt upload",
    body: "Clients snap a photo of the receipt with their phone camera and attach it to the answer. It lands against the right transaction, every time.",
  },
  {
    title: "Memory-based supplier learning",
    body: "Answer once, categorised forever. HelpMyBooks remembers that Bunnings is materials and the Caltex card is the work ute.",
  },
  {
    title: "Bookkeeper dashboard",
    body: "A single reconciliation queue with AI-suggested categories, GST flags and confidence scores. Review, approve, reconcile.",
  },
  {
    title: "Client-friendly answering",
    body: "Answering feels like replying to a text message. One secure link, three taps, done — no logins or apps for your clients.",
  },
];

export default function LandingPage() {
  return (
    <main>
      {/* Nav */}
      <header className="border-b border-ink/10 bg-paper/90 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" aria-label="HelpMyBooks home">
            <Logo className="h-8" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
            <a href="#features" className="hover:text-teal">Features</a>
            <a href="#pricing" className="hover:text-teal">Pricing</a>
            <Link href="/login" className="hover:text-teal">Bookkeeper login</Link>
            <Link href="/client/demo-dave" className="btn-primary !py-2 !px-4 text-sm">Client login</Link>
          </nav>
          <Link href="/login" className="btn-primary !py-2 !px-4 text-sm sm:hidden">Log in</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gum">
            For Australian bookkeepers &amp; BAS agents
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">
            Stop chasing clients.
            <br />
            Start reconciling.
          </h1>
          <p className="mt-5 max-w-md text-lg text-ink/70">
            HelpMyBooks turns every mystery transaction into one simple Who, What, Why
            question your client answers from their phone — receipt attached, GST flagged,
            AI-categorised, back in your queue.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn-primary">Bookkeeper login</Link>
            <Link href="/client/demo-dave" className="btn-secondary">Client login</Link>
            <a href="#demo" className="btn-secondary">Request demo</a>
          </div>
        </div>

        {/* Signature element: SMS-style Who/What/Why exchange */}
        <div className="mx-auto w-full max-w-sm rounded-3xl border border-ink/10 bg-white p-4 shadow-card" aria-label="Example client conversation">
          <div className="mb-3 flex items-center gap-2 border-b border-ink/10 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">H</div>
            <div>
              <p className="text-sm font-semibold">HelpMyBooks</p>
              <p className="text-xs text-ink/50">on behalf of Mitchell Bookkeeping</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-ledger px-4 py-3">
              Hi Dave 👋 Quick one: <strong>$187.45 at Bunnings on 28 June</strong> — who was it for,
              what did you buy, and was it business or personal?
            </div>
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-teal px-4 py-3 text-white">
              Fittings for the Harris bathroom job. Business. Receipt attached 📎
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-ledger px-4 py-3">
              Perfect, all done ✅ Filed as <strong>Materials</strong> · GST claimable · 92% confidence
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-3xl font-semibold">The back-and-forth is killing your margins</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="card">
              <p className="font-display text-3xl text-gum">6+ hrs</p>
              <p className="mt-2 text-ink/70">a month per client lost to “what was this transaction?” emails, texts and voicemails.</p>
            </div>
            <div className="card">
              <p className="font-display text-3xl text-gum">Weeks</p>
              <p className="mt-2 text-ink/70">of BAS delays waiting on answers that take the client 30 seconds to give — when asked the right way.</p>
            </div>
            <div className="card">
              <p className="font-display text-3xl text-gum">Zero</p>
              <p className="mt-2 text-ink/70">of that chasing is billable. HelpMyBooks does it for you, politely and persistently.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution / how it works */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-3xl font-semibold">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="card">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal">Step 1</p>
              <h3 className="mt-1 font-semibold">Flag a transaction</h3>
              <p className="mt-2 text-ink/70">Pick any unclear line in your queue (or pull them straight from Xero) and hit “Ask client”.</p>
            </div>
            <div className="card">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal">Step 2</p>
              <h3 className="mt-1 font-semibold">Client answers in seconds</h3>
              <p className="mt-2 text-ink/70">They get an SMS or email with a secure link — Who, What, Why, business or personal, snap the receipt, submit.</p>
            </div>
            <div className="card">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal">Step 3</p>
              <h3 className="mt-1 font-semibold">Review a clean answer</h3>
              <p className="mt-2 text-ink/70">AI suggests the category and GST treatment with a confidence score. You approve and reconcile.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-3xl font-semibold">Everything the chase used to need</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-ink/70">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing placeholder */}
      <section id="pricing" className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-3xl font-semibold">Simple pricing</h2>
          <p className="mt-2 text-ink/70">Final pricing is being set with our pilot practices. Indicative:</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="card">
              <h3 className="font-semibold">Solo</h3>
              <p className="mt-1 font-display text-3xl">$29<span className="text-base text-ink/50">/mo</span></p>
              <p className="mt-2 text-sm text-ink/70">1 bookkeeper · up to 10 clients · unlimited questions.</p>
            </div>
            <div className="card border-teal ring-1 ring-teal">
              <h3 className="font-semibold">Practice</h3>
              <p className="mt-1 font-display text-3xl">$79<span className="text-base text-ink/50">/mo</span></p>
              <p className="mt-2 text-sm text-ink/70">5 bookkeepers · up to 50 clients · SMS reminders included.</p>
            </div>
            <div className="card">
              <h3 className="font-semibold">Firm</h3>
              <p className="mt-1 font-display text-3xl">Let&rsquo;s talk</p>
              <p className="mt-2 text-sm text-ink/70">Unlimited seats · Xero integration · priority support.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo CTA */}
      <section id="demo" className="bg-ink py-16 text-paper">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="font-display text-3xl font-semibold">See it with your own transactions</h2>
          <p className="mx-auto mt-3 max-w-xl text-paper/70">
            Try the live demo dashboard, or open the client view to feel how easy answering is.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="btn-primary">Open demo dashboard</Link>
            <Link href="/client/demo-dave" className="inline-flex items-center justify-center rounded-lg border border-paper/30 px-5 py-3 font-semibold text-paper transition hover:border-paper">
              Try the client view
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink/10 bg-paper py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
          <Logo className="h-7" />
          <p className="text-sm text-ink/50">© {new Date().getFullYear()} HelpMyBooks · Made for Australian bookkeepers</p>
          <nav className="flex gap-4 text-sm text-ink/60">
            <Link href="/login" className="hover:text-teal">Log in</Link>
            <Link href="/signup" className="hover:text-teal">Sign up</Link>
            <a href="#features" className="hover:text-teal">Features</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
