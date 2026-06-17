import { useId } from "react";

/**
 * HomeVault brand mark, inlined as SVG so it renders regardless of the
 * deploy base path (the app is served under a prefix behind Home Assistant
 * ingress, where root-absolute asset URLs like "/favicon.svg" 404).
 */
export function HomeVaultLogo({
  size = 38,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Unique gradient ids so multiple instances on a page don't collide.
  const uid = useId().replace(/:/g, "");
  const tile = `hv-tile-${uid}`;
  const gold = `hv-gold-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="HomeVault"
      className={className}
    >
      <defs>
        <linearGradient
          id={tile}
          x1="0"
          y1="0"
          x2="512"
          y2="512"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2f7a5a" />
          <stop offset="1" stopColor="#214e3d" />
        </linearGradient>
        <linearGradient
          id={gold}
          x1="160"
          y1="168"
          x2="352"
          y2="360"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#e7be77" />
          <stop offset="1" stopColor="#d6a85d" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="112" fill={`url(#${tile})`} />

      {/* Safe-door frame */}
      <rect
        x="88"
        y="88"
        width="336"
        height="336"
        rx="72"
        fill="#1c4536"
        fillOpacity="0.55"
        stroke="#fbf7ee"
        strokeWidth="13"
      />
      {/* Corner bolts */}
      <circle cx="138" cy="138" r="13" fill={`url(#${gold})`} />
      <circle cx="374" cy="138" r="13" fill={`url(#${gold})`} />
      <circle cx="138" cy="374" r="13" fill={`url(#${gold})`} />
      <circle cx="374" cy="374" r="13" fill={`url(#${gold})`} />

      {/* Home with a keyhole door (vault) */}
      <path
        fill={`url(#${gold})`}
        fillRule="evenodd"
        d="M256 168 L350 258 a14 14 0 0 1 -9 24 L334 282 L334 348 a16 16 0 0 1 -16 16 L194 364 a16 16 0 0 1 -16 -16 L178 282 L171 282 a14 14 0 0 1 -9 -24 Z M256 286 a26 26 0 0 0 -11 49.5 L237 360 L275 360 L267 335.5 A26 26 0 0 0 256 286 Z"
      />
    </svg>
  );
}
