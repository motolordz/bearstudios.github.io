"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { Transaction } from "@/lib/types";

interface PortalData {
  mode: "mock" | "real";
  client: { name: string };
  transactions: Transaction[];
}

export default function ClientPortalPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/client/${params.token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "This link is not valid.");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [params.token]);

  const open = data?.transactions.filter((t) => !doneIds.includes(t.id)) ?? [];

  return (
    <main className="min-h-screen bg-paper pb-16">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <Link href="/"><Logo className="h-7" /></Link>
          <span className="text-sm text-ink/60">{data?.client.name}</span>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pt-6">
        {error && <p className="card text-gum">{error}</p>}
        {!error && !data && <p className="text-ink/60">Loading your questions…</p>}
        {data && (
          <>
            <h1 className="font-display text-2xl font-semibold">
              {open.length === 0
                ? "All done — nothing waiting on you 🎉"
                : `${open.length} quick question${open.length === 1 ? "" : "s"} from your bookkeeper`}
            </h1>
            <p className="mt-1 text-sm text-ink/60">
              Each one takes under a minute. Your answers go straight into your books.
            </p>
            <div className="mt-5 space-y-5">
              {open.map((t) => (
                <QuestionCard
                  key={t.id}
                  token={params.token}
                  txn={t}
                  onDone={() => setDoneIds((prev) => [...prev, t.id])}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

interface Draft {
  who: string;
  what: string;
  why: string;
  bp: "business" | "personal" | "mixed";
}

function draftKey(token: string, transactionId: string) {
  return `hmb-draft:${token}:${transactionId}`;
}

function QuestionCard({ token, txn, onDone }: { token: string; txn: Transaction; onDone: () => void }) {
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");
  const [bp, setBp] = useState<"business" | "personal" | "mixed">("business");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Voice note recording
  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voicePath, setVoicePath] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Restore a saved draft on mount, and persist changes as the client types.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey(token, txn.id));
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        setWho(d.who ?? "");
        setWhat(d.what ?? "");
        setWhy(d.why ?? "");
        setBp(d.bp ?? "business");
      }
    } catch {
      // ignore corrupt/inaccessible localStorage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, txn.id]);

  useEffect(() => {
    if (submitted) return;
    if (!who && !what && !why) return;
    try {
      window.localStorage.setItem(draftKey(token, txn.id), JSON.stringify({ who, what, why, bp }));
    } catch {
      // ignore
    }
  }, [who, what, why, bp, submitted, token, txn.id]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey(token, txn.id));
    } catch {
      // ignore
    }
  }

  const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(txn.amount));

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setVoiceBlob(blob);
        setVoiceUrl(URL.createObjectURL(blob));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setMsg("Couldn't access your microphone — check your browser's permission settings.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function discardVoice() {
    setVoiceBlob(null);
    setVoiceUrl(null);
    setVoicePath(null);
    setVoiceTranscript(null);
  }

  async function uploadVoice(): Promise<{ path: string | null; transcript: string | null }> {
    if (!voiceBlob) return { path: null, transcript: null };
    setVoiceBusy(true);
    const form = new FormData();
    form.append("token", token);
    form.append("transaction_id", txn.id);
    form.append("file", voiceBlob, `voice-note.${(voiceBlob.type.split("/")[1] || "webm").split(";")[0]}`);
    const res = await fetch("/api/voice/upload", { method: "POST", body: form });
    const d = await res.json().catch(() => ({}));
    setVoiceBusy(false);
    setVoicePath(d.voice_note_path ?? null);
    setVoiceTranscript(d.transcript ?? null);
    return { path: d.voice_note_path ?? null, transcript: d.transcript ?? null };
  }

  async function submit() {
    if (!who.trim() && !what.trim() && !voiceBlob) {
      setMsg("Type a quick answer or record a voice note — whichever's easier.");
      return;
    }
    if (!voiceBlob && (!who.trim() || !what.trim())) {
      setMsg("Who and What are the two we really need — a few words is fine.");
      return;
    }
    setBusy(true);
    setMsg(null);

    let receiptPath: string | null = null;
    if (receipt) {
      const form = new FormData();
      form.append("token", token);
      form.append("transaction_id", txn.id);
      form.append("file", receipt);
      const up = await fetch("/api/receipts/upload", { method: "POST", body: form });
      const upData = await up.json().catch(() => ({}));
      receiptPath = upData.receipt_path ?? null;
    }

    let voice = { path: voicePath, transcript: voiceTranscript };
    if (voiceBlob && !voicePath) voice = await uploadVoice();

    const res = await fetch("/api/answers/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        transaction_id: txn.id,
        who,
        what,
        why,
        business_or_personal: bp,
        receipt_path: receiptPath,
        voice_note_path: voice.path,
        voice_transcript: voice.transcript,
        merchant: txn.merchant,
        description: txn.description,
        amount: txn.amount,
        date: txn.date,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);

    if (res.ok || res.status === 202) {
      setSubmitted(true);
      clearDraft();
      const cat = d?.ai?.suggested_category;
      setMsg(cat ? `Thanks! Filed as “${cat}”. ✅` : "Thanks! Your bookkeeper has your answer. ✅");
      setTimeout(onDone, 1800);
    } else {
      setMsg(d.error ?? "That didn't go through — please try again.");
    }
  }

  async function skip() {
    setSkipped(true);
    fetch("/api/questions/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, transaction_id: txn.id }),
    }).catch(() => {});
    setTimeout(onDone, 400);
  }

  if (skipped) {
    return (
      <div className="card text-sm text-ink/60">Skipped for now — it&rsquo;ll be here next time you check in.</div>
    );
  }

  return (
    <div className="card">
      {/* The question, phrased like a text message */}
      <div className="rounded-2xl rounded-tl-sm bg-ledger px-4 py-3 text-sm">
        On <strong>{txn.date}</strong>, <strong>{money}</strong>{" "}
        {txn.amount < 0 ? "was paid to" : "came in from"} <strong>{txn.merchant}</strong>.
        Who was it, what was it for, and was it business or personal?
      </div>

      {submitted ? (
        <p className="mt-3 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">{msg}</p>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Who?
            <input
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              placeholder="e.g. Bunnings — for the Harris job"
            />
          </label>
          <label className="block text-sm font-medium">
            What was it for?
            <input
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              placeholder="e.g. Pipe fittings and sealant"
            />
          </label>
          <label className="block text-sm font-medium">
            Why business (or personal)?
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              placeholder="e.g. Materials for a client job"
            />
          </label>

          <div className="grid grid-cols-3 gap-2 text-sm font-medium">
            {(["business", "personal", "mixed"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBp(v)}
                className={`rounded-lg border px-2 py-2 capitalize ${bp === v ? "border-teal bg-teal-light text-teal-dark" : "border-ink/15"}`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Receipt: camera capture + file upload. camera=(self) is allowed in next.config.mjs */}
          <div className="flex flex-wrap gap-2">
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
            <button type="button" onClick={() => cameraRef.current?.click()} className="btn-secondary !px-4 !py-2 text-sm">
              📷 Snap receipt
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary !px-4 !py-2 text-sm">
              📎 Attach file
            </button>
            {!voiceUrl && (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={`btn-secondary !px-4 !py-2 text-sm ${recording ? "!bg-gum !text-white" : ""}`}
              >
                {recording ? "⏹ Stop recording" : "🎙️ Voice note"}
              </button>
            )}
          </div>
          {receipt && <p className="text-xs text-ink/60">Attached: {receipt.name}</p>}
          {voiceUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-ink/15 px-3 py-2">
              <audio controls src={voiceUrl} className="h-8 grow" />
              <button type="button" onClick={discardVoice} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </div>
          )}
          {voiceBusy && <p className="text-xs text-ink/50">Uploading voice note…</p>}

          {msg && <p className="text-sm text-gum">{msg}</p>}

          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="btn-primary flex-1">
              {busy ? "Sending…" : "Send answer"}
            </button>
            <button type="button" onClick={skip} disabled={busy} className="btn-secondary">
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
