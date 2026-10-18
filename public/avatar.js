// Original avatar renderer: a round blob character built from color, eyes and mouth parts.
(function () {
  const COLORS = ['#ff5a5f', '#ff9f1c', '#ffd23f', '#9bdb4d', '#3ec97b', '#2ec4b6', '#3fa7f5', '#4361ee', '#7b5cff',
    '#c65cff', '#ff5cc8', '#ff8fa3', '#a0522d', '#e0b084', '#8d99ae', '#f1f1f1', '#3d3d3d', '#00b3a4'];

  const EYES = [
    '<circle cx="38" cy="44" r="6"/><circle cx="62" cy="44" r="6"/>',
    '<circle cx="38" cy="44" r="9" fill="#fff"/><circle cx="62" cy="44" r="9" fill="#fff"/><circle cx="40" cy="45" r="4"/><circle cx="60" cy="45" r="4"/>',
    '<path d="M30 44 q8 -8 16 0 M54 44 q8 -8 16 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>',
    '<path d="M30 42 l14 4 M70 42 l-14 4" stroke="#222" stroke-width="4" stroke-linecap="round"/><circle cx="39" cy="50" r="4"/><circle cx="61" cy="50" r="4"/>',
    '<path d="M31 39 l12 10 M43 39 l-12 10 M57 39 l12 10 M69 39 l-12 10" stroke="#222" stroke-width="4" stroke-linecap="round"/>',
    '<rect x="27" y="38" width="20" height="12" rx="3"/><rect x="53" y="38" width="20" height="12" rx="3"/><path d="M47 43 h6" stroke="#222" stroke-width="3"/>',
    '<circle cx="38" cy="44" r="6"/><path d="M54 44 h14" stroke="#222" stroke-width="4" stroke-linecap="round"/>',
    '<circle cx="38" cy="44" r="10" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="62" cy="44" r="5" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="38" cy="44" r="3"/><circle cx="62" cy="44" r="2"/>',
    '<path d="M30 46 h16 M54 46 h16" stroke="#222" stroke-width="4" stroke-linecap="round"/>',
    '<path d="M38 36 l2.5 5 5.5 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.5 -.8z M62 36 l2.5 5 5.5 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.5 -.8z" fill="#fff6a8" stroke="#222" stroke-width="1.5"/>',
    '<path d="M31 47 q7 -10 14 0 z M55 47 q7 -10 14 0 z"/>',
    '<circle cx="50" cy="42" r="11" fill="#fff" stroke="#222" stroke-width="2"/><circle cx="52" cy="43" r="5"/>',
  ];

  const MOUTHS = [
    '<path d="M38 64 q12 12 24 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>',
    '<path d="M36 62 q14 18 28 0 z" fill="#7a1f2b" stroke="#222" stroke-width="3"/>',
    '<path d="M40 68 h20" stroke="#222" stroke-width="4" stroke-linecap="round"/>',
    '<path d="M38 72 q12 -12 24 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>',
    '<ellipse cx="50" cy="68" rx="6" ry="8" fill="#7a1f2b" stroke="#222" stroke-width="3"/>',
    '<path d="M38 66 q12 10 24 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M52 70 q4 10 8 0" fill="#ff7a90" stroke="#222" stroke-width="2"/>',
    '<path d="M36 66 l7 -4 7 4 7 -4 7 4" stroke="#222" stroke-width="3.5" fill="none" stroke-linejoin="round"/>',
    '<rect x="38" y="62" width="24" height="10" rx="3" fill="#fff" stroke="#222" stroke-width="3"/><path d="M46 62 v10 M54 62 v10" stroke="#222" stroke-width="2"/>',
    '<path d="M44 66 q6 6 12 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>',
    '<path d="M40 64 q10 8 20 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M42 64 l3 5 3 -4 M58 64 l-3 5 -3 -4" fill="#fff" stroke="#222" stroke-width="1.5"/>',
    '<circle cx="50" cy="67" r="4" fill="none" stroke="#222" stroke-width="3"/>',
    '<path d="M38 66 q6 -6 12 0 q6 6 12 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>',
  ];

  function svg(a, opts = {}) {
    const color = COLORS[a.color % COLORS.length];
    const crown = opts.crown ? '<path d="M34 10 l6 10 10 -12 10 12 6 -10 v14 h-32z" fill="#ffd23f" stroke="#222" stroke-width="2.5" stroke-linejoin="round"/>' : '';
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M50 14 C78 14 90 34 88 56 C86 80 70 92 50 92 C30 92 14 80 12 56 C10 34 22 14 50 14 Z" fill="${color}" stroke="#222" stroke-width="3"/>
      <ellipse cx="34" cy="30" rx="8" ry="4" fill="#fff" opacity=".35" transform="rotate(-25 34 30)"/>
      <g fill="#222">${EYES[a.eyes % EYES.length]}</g>
      ${MOUTHS[a.mouth % MOUTHS.length]}
      ${crown}
    </svg>`;
  }

  window.Avatar = {
    svg,
    counts: { color: COLORS.length, eyes: EYES.length, mouth: MOUTHS.length },
    random: () => ({ color: Math.floor(Math.random() * COLORS.length), eyes: Math.floor(Math.random() * EYES.length), mouth: Math.floor(Math.random() * MOUTHS.length), extra: 0 }),
  };
})();
