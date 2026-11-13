const PASTEL_PALETTES = [
  { bg: '#FFE5EC', accent: '#FF8FA3', badge: '#FFFDF9', ink: '#4A3F35', sub: '#FFD1DC' },
  { bg: '#E3F8F3', accent: '#7AD9C5', badge: '#FFFDF9', ink: '#3B4F4A', sub: '#BCEEE2' },
  { bg: '#FFF5D6', accent: '#F6C453', badge: '#FFFDF9', ink: '#4A3F35', sub: '#FFE8A3' },
  { bg: '#EDE7FF', accent: '#A68CF2', badge: '#FFFDF9', ink: '#423959', sub: '#D8CCFF' },
  { bg: '#FFEAD5', accent: '#FFA97A', badge: '#FFFDF9', ink: '#4A3F35', sub: '#FFD6B0' },
  { bg: '#E5F2FF', accent: '#7DB8F5', badge: '#FFFDF9', ink: '#354558', sub: '#C7E2FF' },
];

function hashTitle(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generatePastelCover(
  seriesTitle: string,
  volumeNumber: number,
  author?: string,
  paletteHint?: string
): string {
  const hash = hashTitle(seriesTitle);
  const palette = PASTEL_PALETTES[hash % PASTEL_PALETTES.length];
  const accent = paletteHint || palette.accent;
  const displayTitle =
    seriesTitle.length > 10 ? `${seriesTitle.slice(0, 9)}…` : seriesTitle;
  const displayAuthor = author
    ? author.length > 11
      ? `${author.slice(0, 10)}…`
      : author
    : 'MofuComics';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="200" height="280">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg}"/>
      <stop offset="100%" stop-color="${palette.sub}"/>
    </linearGradient>
  </defs>
  <rect width="200" height="280" rx="16" fill="url(#g)"/>
  <circle cx="164" cy="46" r="34" fill="${accent}" opacity="0.24"/>
  <circle cx="38" cy="236" r="42" fill="#FFFDF9" opacity="0.55"/>
  <rect x="14" y="14" width="172" height="252" rx="12" fill="none" stroke="#FFFDF9" stroke-width="3" opacity="0.85"/>
  <rect x="24" y="26" width="66" height="26" rx="13" fill="${accent}"/>
  <text x="57" y="44" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="13" fill="#FFFDF9">VOL.${volumeNumber}</text>
  <g transform="translate(100,132)">
    <circle cx="0" cy="0" r="44" fill="#FFFDF9" opacity="0.9"/>
    <path d="M-20 -18 L-10 -34 L-2 -20 Z" fill="${accent}" opacity="0.85"/>
    <path d="M20 -18 L10 -34 L2 -20 Z" fill="${accent}" opacity="0.85"/>
    <circle cx="-12" cy="-2" r="3.8" fill="${palette.ink}"/>
    <circle cx="12" cy="-2" r="3.8" fill="${palette.ink}"/>
    <circle cx="-18" cy="6" r="5" fill="#FF8FA3" opacity="0.45"/>
    <circle cx="18" cy="6" r="5" fill="#FF8FA3" opacity="0.45"/>
    <path d="M-5 6 Q0 11 5 6" fill="none" stroke="${palette.ink}" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  <rect x="18" y="192" width="164" height="58" rx="12" fill="#FFFDF9" opacity="0.92"/>
  <text x="100" y="217" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="14" fill="${palette.ink}">${escapeXml(displayTitle)}</text>
  <text x="100" y="237" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="11" fill="#8C7A6B">${escapeXml(displayAuthor)}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
