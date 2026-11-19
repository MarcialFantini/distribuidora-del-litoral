/**
 * Shipping label generated in the browser as an SVG string (10 x 15 cm proportions).
 * The barcode and the matrix code are drawn from a hash of the tracking number: they look
 * real enough for a demo but encode nothing.
 */
export type LabelInput = {
  number: string;
  tracking: string;
  channel: string;
  customer: string;
  city: string;
  items: number;
  date: string;
};

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function bits(seed: number, count: number): number[] {
  const out: number[] = [];
  let state = seed || 1;
  for (let i = 0; i < count; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    out.push((state >>> 0) % 4);
  }
  return out;
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function labelSvg(input: LabelInput): string {
  const seed = hash(input.tracking);
  let x = 24;
  const bars: string[] = [];
  bits(seed, 64).forEach((width, index) => {
    const w = width + 1;
    if (index % 2 === 0) bars.push(`<rect x="${x}" y="300" width="${w * 1.6}" height="70" />`);
    x += w * 1.6 + 1.2;
  });
  const cells: string[] = [];
  const matrix = bits(seed ^ 0x9e3779b9, 121);
  matrix.forEach((value, index) => {
    if (value < 2) return;
    const cx = 286 + (index % 11) * 7;
    const cy = 92 + Math.floor(index / 11) * 7;
    cells.push(`<rect x="${cx}" y="${cy}" width="7" height="7" />`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="400" height="600" font-family="Archivo, Arial, sans-serif">
  <rect width="400" height="600" fill="#fff" stroke="#0b1430" stroke-width="4"/>
  <rect x="0" y="0" width="400" height="64" fill="#1739c9"/>
  <rect x="20" y="18" width="28" height="28" rx="6" fill="#ffd43b"/>
  <text x="60" y="38" fill="#fff" font-size="20" font-weight="700">Distribuidora del Litoral</text>
  <text x="60" y="54" fill="#dfe6ff" font-size="11">Etiqueta simulada · demo sin validez</text>
  <text x="24" y="96" font-size="11" fill="#5f6885">REMITENTE</text>
  <text x="24" y="114" font-size="14" font-weight="700">Distribuidora del Litoral</text>
  <text x="24" y="132" font-size="12">Depósito Santa Fe · Av. Ficticia 1234</text>
  <text x="24" y="168" font-size="11" fill="#5f6885">DESTINATARIO</text>
  <text x="24" y="192" font-size="22" font-weight="700">${escape(input.customer)}</text>
  <text x="24" y="214" font-size="15">${escape(input.city)}, Argentina</text>
  <text x="24" y="250" font-size="11" fill="#5f6885">PEDIDO · CANAL</text>
  <text x="24" y="270" font-size="15" font-weight="700">${escape(input.number)} · ${escape(input.channel)}</text>
  <g fill="#0b1430">${cells.join('')}</g>
  <rect x="282" y="88" width="85" height="85" fill="none" stroke="#0b1430" stroke-width="2"/>
  <g fill="#0b1430">${bars.join('')}</g>
  <text x="200" y="392" font-size="16" font-weight="700" text-anchor="middle" letter-spacing="3">${escape(input.tracking)}</text>
  <line x1="0" y1="414" x2="400" y2="414" stroke="#0b1430" stroke-width="2" stroke-dasharray="6 6"/>
  <text x="24" y="446" font-size="11" fill="#5f6885">BULTOS</text>
  <text x="24" y="476" font-size="30" font-weight="700">1/1</text>
  <text x="140" y="446" font-size="11" fill="#5f6885">UNIDADES</text>
  <text x="140" y="476" font-size="30" font-weight="700">${input.items}</text>
  <text x="256" y="446" font-size="11" fill="#5f6885">FECHA</text>
  <text x="256" y="476" font-size="18" font-weight="700">${escape(input.date)}</text>
  <rect x="24" y="508" width="352" height="64" rx="8" fill="#ffd43b"/>
  <text x="200" y="548" font-size="17" font-weight="700" text-anchor="middle">ENTREGA ESTÁNDAR · ZONA LITORAL</text>
</svg>`;
}
