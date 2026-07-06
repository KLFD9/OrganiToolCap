/** Mélange deux couleurs hex (sans #) — bordures et textes atténués sans transparence. */
export function blendHex(fg: string, bg: string, fgRatio: number): string {
  const parse = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  const [fr, fgG, fb] = parse(fg);
  const [br, bgG, bb] = parse(bg);
  const mix = (a: number, b: number) => Math.round(a * fgRatio + b * (1 - fgRatio));
  return [mix(fr, br), mix(fgG, bgG), mix(fb, bb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
