import { createRng, type Rng } from './rng';

/** 300 cleaning products for Distribuidora del Litoral, generated from a fixed seed. */
export type Category = {
  id: string;
  label: string;
  code: string;
  types: readonly string[];
  sizes: readonly string[];
  price: readonly [number, number];
};

export type Product = {
  index: number;
  sku: string;
  name: string;
  brand: string;
  category: string;
  size: string;
  /** Base price in ARS, before channel rules. */
  price: number;
  cost: number;
  /** Central stock at the start of the live day. */
  stock: number;
  min: number;
  ean: string;
};

export const CATEGORIES: readonly Category[] = [
  { id: 'lavandina', label: 'Lavandinas', code: 'LAV', types: ['Lavandina', 'Lavandina en gel', 'Lavandina concentrada'], sizes: ['1 L', '2 L', '5 L'], price: [1400, 6800] },
  { id: 'detergente', label: 'Detergentes', code: 'DET', types: ['Detergente', 'Detergente concentrado', 'Lavavajillas'], sizes: ['500 ml', '750 ml', '1,5 L', '5 L'], price: [1600, 9200] },
  { id: 'desinfectante', label: 'Desinfectantes', code: 'DES', types: ['Desinfectante', 'Aerosol desinfectante', 'Sanitizante'], sizes: ['360 ml', '900 ml', '5 L'], price: [2200, 11800] },
  { id: 'multiuso', label: 'Limpiadores', code: 'LIM', types: ['Limpiador multiuso', 'Limpiavidrios', 'Desengrasante', 'Antisarro'], sizes: ['500 ml', '900 ml', '1,8 L'], price: [1800, 7600] },
  { id: 'ropa', label: 'Cuidado de la ropa', code: 'ROP', types: ['Jabón líquido', 'Jabón en polvo', 'Suavizante', 'Quitamanchas'], sizes: ['800 g', '3 L', '5 L'], price: [3200, 18500] },
  { id: 'papel', label: 'Papel', code: 'PAP', types: ['Papel higiénico', 'Rollo de cocina', 'Servilletas'], sizes: ['x4', 'x12', 'x24'], price: [1900, 14200] },
  { id: 'residuos', label: 'Residuos', code: 'RES', types: ['Bolsas de residuos', 'Bolsas consorcio', 'Bolsas con cierre'], sizes: ['45x60 x30', '60x90 x10', '80x110 x10'], price: [1200, 6400] },
  { id: 'utensilios', label: 'Utensilios', code: 'UTE', types: ['Esponja', 'Paño microfibra', 'Escoba', 'Secador de piso', 'Guantes de látex'], sizes: ['x1', 'x3', 'x6'], price: [900, 9800] },
  { id: 'pisos', label: 'Pisos y muebles', code: 'PIS', types: ['Cera para pisos', 'Limpiador de pisos', 'Lustramuebles'], sizes: ['500 ml', '900 ml', '4 L'], price: [2100, 10400] },
  { id: 'aromas', label: 'Aromatizantes', code: 'ARO', types: ['Aromatizante', 'Difusor', 'Pastilla de inodoro'], sizes: ['x1', '250 ml', '360 ml'], price: [1300, 7900] },
];

const BRANDS = ['Brillex', 'Pampa Clean', 'Ríozul', 'Nevada', 'Albor', 'Don Lustro', 'Glaciar', 'Hogar Pleno', 'Costanera', 'Lumo'];
const VARIANTS = ['Original', 'Lavanda', 'Limón', 'Pino', 'Marina', 'Floral', 'Sin perfume', 'Eucalipto', 'Pro', 'Max'];

export const PRODUCT_COUNT = 300;

function ean(rng: Rng): string {
  let code = '779';
  for (let i = 0; i < 9; i++) code += String(rng.int(0, 9));
  const sum = [...code].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return code + String((10 - (sum % 10)) % 10);
}

function roundPrice(value: number): number {
  return Math.round(value / 50) * 50;
}

function build(): Product[] {
  const rng = createRng(20261102);
  const seen = new Set<string>();
  const list: Product[] = [];
  const counters = new Map<string, number>();
  while (list.length < PRODUCT_COUNT) {
    const category = CATEGORIES[list.length % CATEGORIES.length] as Category;
    const type = rng.pick(category.types);
    const brand = rng.pick(BRANDS);
    const variant = rng.pick(VARIANTS);
    const size = rng.pick(category.sizes);
    const name = `${type} ${brand} ${variant} ${size}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const count = (counters.get(category.code) ?? 0) + 1;
    counters.set(category.code, count);
    const index = list.length;
    const sizeFactor = category.sizes.indexOf(size) / Math.max(1, category.sizes.length - 1);
    const spread = category.price[1] - category.price[0];
    const price = roundPrice(category.price[0] + spread * (0.25 + sizeFactor * 0.6 + rng.range(-0.12, 0.12)));
    const min = rng.int(4, 18);
    // A handful of products start close to zero, so stock-outs and oversell risks show up quickly.
    const stock = index % 23 === 7 ? rng.int(3, 8) : rng.int(min + 6, 420);
    list.push({
      index,
      sku: `DL-${category.code}-${String(count).padStart(3, '0')}`,
      name,
      brand,
      category: category.id,
      size,
      price,
      cost: roundPrice(price * rng.range(0.52, 0.68)),
      stock,
      min,
      ean: ean(rng),
    });
  }
  return list;
}

export const PRODUCTS: readonly Product[] = build();

export const CATEGORY_BY_ID: Readonly<Record<string, Category>> = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
);

export function productAt(index: number): Product {
  return PRODUCTS[index] as Product;
}

export function productBySku(sku: string): Product | undefined {
  const upper = sku.toUpperCase();
  return PRODUCTS.find((product) => product.sku === upper);
}

export function skuSlug(product: Product): string {
  return product.sku.toLowerCase();
}

/** The product featured in the hero and the product scene: a fast seller with healthy stock. */
export const FEATURED_INDEX = 3;
