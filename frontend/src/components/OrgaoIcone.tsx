// Simple illustrations of organs/body parts for the alert cards
import type { ZonaCorpo } from "./motivosAlerta";

export function OrgaoIcone({ zona, cor, className = "h-11 w-11" }: { zona: ZonaCorpo; cor: string; className?: string }) {
  const id = `grad-${zona}-${cor.replace("#", "")}`;
  const traco = { stroke: cor, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" style={{ filter: `drop-shadow(0 0 6px ${cor}aa)` }}>
      <defs>
        <radialGradient id={id} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={cor} stopOpacity="0.95" />
          <stop offset="100%" stopColor={cor} stopOpacity="0.45" />
        </radialGradient>
      </defs>

      {zona === "peito" && (
        // Heart with aorta and pulmonary artery
        <g>
          <path d="M20 9 C20 5 24 4 25 8 L25 14" fill="none" {...traco} />
          <path d="M28 14 C28 8 33 6 35 9 C36 11 34 13 32 13" fill="none" {...traco} />
          <path
            d="M24 42 C14 36 8 29 9 21 C10 15 15 12 20 14 C22 15 23 16 24 18 C25 15 28 13 32 13 C38 14 41 19 39 26 C37 33 30 38 24 42 Z"
            fill={`url(#${id})`}
            {...traco}
          />
          <path d="M24 18 C23 24 22 30 24 40" fill="none" stroke="#020617" strokeOpacity=".45" strokeWidth="1.4" />
          <path d="M14 24 C17 26 19 29 19 33" fill="none" stroke="#020617" strokeOpacity=".3" strokeWidth="1.2" />
        </g>
      )}

      {zona === "pulmao" && (
        // Trachea, bronchi and two lungs
        <g>
          <path d="M24 5 L24 17 M24 17 L19 22 M24 17 L29 22" fill="none" {...traco} />
          <path d="M19 15 C13 15 8 22 7 31 C6 38 9 42 14 41 C18 40 20 37 20 32 L20 20 C20 17 20 15 19 15 Z" fill={`url(#${id})`} {...traco} />
          <path d="M29 15 C35 15 40 22 41 31 C42 38 39 42 34 41 C30 40 28 37 28 32 L28 20 C28 17 28 15 29 15 Z" fill={`url(#${id})`} {...traco} />
          <path d="M12 28 C14 29 16 31 16 34 M36 28 C34 29 32 31 32 34" fill="none" stroke="#020617" strokeOpacity=".35" strokeWidth="1.2" />
        </g>
      )}

      {zona === "cabeca" && (
        // Brain (side view) with sulci
        <g>
          <path
            d="M10 26 C7 22 9 15 14 13 C15 8 21 6 25 8 C29 5 36 7 37 12 C42 13 44 19 41 23 C43 27 40 32 35 32 C33 36 27 37 24 34 C21 37 15 36 14 32 C10 32 8 29 10 26 Z"
            fill={`url(#${id})`}
            {...traco}
          />
          <path d="M18 14 C20 17 19 20 16 21 M25 9 C24 13 26 16 30 16 M33 20 C30 21 29 25 31 27 M20 26 C22 24 25 25 26 28" fill="none" stroke="#020617" strokeOpacity=".4" strokeWidth="1.3" />
          <path d="M28 34 C29 38 28 41 26 43" fill="none" {...traco} />
        </g>
      )}

      {zona === "coluna" && (
        // Stacked vertebrae
        <g>
          {[6, 13, 20, 27, 34].map((y, i) => (
            <g key={y}>
              <rect x={17 - i * 0.6} y={y} width={14 + i * 1.2} height="5.5" rx="2.5" fill={`url(#${id})`} {...traco} />
              <path d={`M${15 - i * 0.6} ${y + 2.7} L${11 - i * 0.6} ${y + 1.5} M${33 + i * 0.6} ${y + 2.7} L${37 + i * 0.6} ${y + 1.5}`} {...traco} />
            </g>
          ))}
          <path d="M24 41 L24 45" {...traco} />
        </g>
      )}

      {zona === "pernas" && (
        // Femur (thigh bone)
        <g>
          <path
            d="M17 7 C13 5 10 9 13 12 C15 13 17 13 19 14 L26 36 C25 38 23 40 24 43 C26 46 30 44 30 41 C32 43 36 42 35 38 C34 35 31 35 29 35 L22 12 C23 10 23 8 21 6 C20 5 18 6 17 7 Z"
            fill={`url(#${id})`}
            {...traco}
          />
          <path d="M21 16 L27 33" fill="none" stroke="#020617" strokeOpacity=".3" strokeWidth="1.2" />
        </g>
      )}

      {zona === "pele" && (
        // Skin layers with radiation particles
        <g>
          <path d="M5 22 C11 18 17 26 24 22 C31 18 37 26 43 22 L43 30 C37 34 31 26 24 30 C17 34 11 26 5 30 Z" fill={`url(#${id})`} {...traco} />
          <path d="M5 34 C11 30 17 38 24 34 C31 30 37 38 43 34 L43 41 L5 41 Z" fill={cor} fillOpacity=".3" {...traco} />
          <path d="M12 6 L15 14 M24 4 L24 13 M36 6 L33 14" {...traco} strokeDasharray="2 2.5" />
          <circle cx="15" cy="15" r="1.6" fill={cor} />
          <circle cx="24" cy="14" r="1.6" fill={cor} />
          <circle cx="33" cy="15" r="1.6" fill={cor} />
        </g>
      )}
    </svg>
  );
}
