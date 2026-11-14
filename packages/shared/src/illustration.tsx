export function AppIllustration({ app }: { app: string }) {
  const drawing: Record<string, React.ReactNode> = {
    "growth-engine": (
      <>
        <ellipse
          cx="85"
          cy="60"
          rx="68"
          ry="26"
          transform="rotate(-20 85 60)"
        />
        <ellipse cx="85" cy="60" rx="68" ry="26" transform="rotate(55 85 60)" />
        <path
          d="m85 26 8 24 26 10-26 9-8 25-9-25-25-9 25-10Z"
          fill="currentColor"
        />
        <circle cx="143" cy="30" r="5" fill="currentColor" />
      </>
    ),
    "ambassador-platform": (
      <>
        <path d="m35 76 50-44 55 44M35 76h105M85 32v72" />
        <circle cx="35" cy="76" r="15" fill="var(--accent)" />
        <circle cx="85" cy="32" r="18" fill="currentColor" />
        <circle cx="140" cy="76" r="15" fill="var(--accent)" />
        <circle cx="85" cy="104" r="10" fill="var(--accent)" />
        <path d="m78 32 5 5 10-11" stroke="var(--accent)" strokeWidth="3" />
      </>
    ),
    "challenge-platform": (
      <>
        <path d="M20 105V70h40v35M60 105V45h45v60M105 105V80h40v25" />
        <path
          d="m82 10 5 10 12 2-9 8 2 12-10-6-11 6 2-12-9-8 12-2Z"
          fill="currentColor"
        />
        <path d="M12 105h142" />
      </>
    ),
    "school-portal": (
      <>
        <path d="M35 15h78l20 20v75H35Z" fill="var(--accent)" />
        <path d="M113 15v20h20M50 46h57M50 61h57M50 76h35M50 91h46M23 27v88h95" />
        <path d="m114 74 14 14 28-29" strokeWidth="4" />
      </>
    ),
    "school-league": (
      <>
        <path d="M56 18h60v36c0 40-60 40-60 0ZM56 28H33v14c0 20 23 20 23 20M116 28h23v14c0 20-23 20-23 20M86 83v22M62 106h48" />
        <path
          d="m86 32 4 9 10 1-8 7 2 10-8-5-9 5 2-10-8-7 11-1Z"
          fill="currentColor"
        />
      </>
    ),
  };
  return (
    <svg
      className="app-illustration"
      aria-hidden="true"
      viewBox="0 0 170 125"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      {drawing[app]}
    </svg>
  );
}
