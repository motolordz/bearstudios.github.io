/**
 * HelpMyBooks logo.
 * If you place your brand file at /public/helpmybooks-logo.png (1280x653),
 * set USE_PNG = true to render it instead of the built-in SVG wordmark.
 */
const USE_PNG = false;

export default function Logo({ className = "h-8" }: { className?: string }) {
  if (USE_PNG) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/helpmybooks-logo.png" alt="HelpMyBooks" className={className} />;
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-full w-auto" aria-hidden="true">
        <rect x="2" y="4" width="28" height="24" rx="4" fill="#0E7B71" />
        <path d="M9 11h14M9 16h14M9 21h9" stroke="#FAF8F4" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="24" cy="21" r="3.4" fill="#C6532B" />
        <path d="M22.6 21l1 1 1.8-2" stroke="#FAF8F4" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-ink">
        HelpMyBooks
      </span>
    </span>
  );
}
