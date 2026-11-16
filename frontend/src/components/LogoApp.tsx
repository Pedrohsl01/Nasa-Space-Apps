// App logo: outlined heart with an ECG trace, cyan -> green gradient (transparent background).
export function LogoApp({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="logo-degrade" x1="4" y1="20" x2="60" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#06B6D4" />
          <stop offset="1" stopColor="#22C55E" />
        </linearGradient>
      </defs>
      <g stroke="url(#logo-degrade)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Heart */}
        <path d="M32 19.5C28.5 15.6 25.2 13.5 21 13.5 14.6 13.5 10 18.6 10 25c0 3.2 1 6.2 2.6 9M51.4 34c1.6-2.8 2.6-5.8 2.6-9 0-6.4-4.6-11.5-11-11.5-4.2 0-7.5 2.1-11 6M15.6 39C20.5 46 26.6 50.6 32 54.5 37.4 50.6 43.5 46 48.4 39" />
        {/* Heartbeat */}
        <path d="M6 36.5h13.5l2.8-4 2.8 5.2 4.6-14.2 4.8 22.4 5.4-12.6 2.7 3.2H58" />
      </g>
    </svg>
  );
}
