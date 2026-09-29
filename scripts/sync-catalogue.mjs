/* DASTIN catalogue sync: Supabase (cloud, where the admin edits) -> GitHub snapshot.
   Runs in GitHub Actions every 15 minutes. Downloads cloud images into
   assets/uploads/ and rewrites catalogue.json so the public website can serve
   everything straight from GitHub Pages — reachable from Iran, no cloud needed. */
import { readdir, writeFile, mkdir, rm } from 'node:fs/promises';

const BASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!BASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY secrets.');
  process.exit(1);
}

const defaultImages = {
  'default-burger': 'product-burger.jpg',
  'default-sausage': 'product-sausage.jpg',
  'default-cake': 'product-cake.jpg',
  'default-finger-food': 'product-finger-food.jpg'
};

async function rest(path) {
  const response = await fetch(BASE_URL + path, {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
  });
  if (!response.ok) throw new Error('REST ' + path + ' -> HTTP ' + response.status);
  return response.json();
}

function clean(value, max) { return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max); }

const rows = await rest('/rest/v1/dastin_products?select=*&order=sort_order.asc,created_at.asc');
const products = (rows || []).map(row => ({
  id: clean(row.id, 100),
  title: clean(row.title, 80),
  category: clean(row.category, 40) || 'fingerfood',
  price: clean(row.price, 70),
  weight: clean(row.weight, 70),
  copyright: clean(row.copyright, 140),
  description: clean(row.description, 800),
  imageId: clean(row.image_id, 110),
  imagePath: clean(row.image_path, 300),
  order: Number(row.sort_order) || 10,
  createdAt: Number(row.created_at) || Date.now()
})).filter(product => product.title && product.imageId);

const settingsRows = await rest('/rest/v1/dastin_settings?select=value&id=eq.1');
const settings = (settingsRows && settingsRows[0] && settingsRows[0].value) || {};

const showcaseRows = await rest('/rest/v1/dastin_showcase?select=value&id=eq.1');
const showcase = (showcaseRows && showcaseRows[0] && showcaseRows[0].value) || {
  headingFirst: '', headingAccent: '', description: '',
  cards: [
    { id: 'cake', imagePath: 'assets/product-cake.jpg' },
    { id: 'burger', imagePath: 'assets/product-burger.jpg' },
    { id: 'coldcuts', imagePath: 'assets/product-cold-cuts.jpg' }
  ],
  notes: []
};

await mkdir('assets/uploads', { recursive: true });
const referenced = new Set();

async function materialiseImage(entry, label) {
  if (!entry.imageId) return;
  if (defaultImages[entry.imageId]) {
    entry.imagePath = 'assets/' + defaultImages[entry.imageId];
    return;
  }
  const file = entry.imageId + '.webp';
  const response = await fetch(BASE_URL + '/storage/v1/object/public/media/' + file);
  if (!response.ok) {
    if (entry.imagePath && !/^https?:/i.test(entry.imagePath)) return; /* keep previous repo image */
    throw new Error('تصویر «' + label + '» در ابر پیدا نشد (HTTP ' + response.status + ')');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile('assets/uploads/' + file, buffer);
  referenced.add(file);
  entry.imagePath = 'assets/uploads/' + file;
}

for (const product of products) await materialiseImage(product, product.title);
for (const card of showcase.cards || []) {
  card.id = clean(card.id, 60);
  card.label = clean(card.label, 80);
  card.title = clean(card.title, 100);
  card.imageId = clean(card.imageId, 120);
  await materialiseImage(card, card.title || card.id);
  if (!card.imagePath) card.imagePath = 'assets/product-' + card.id + '.jpg';
}

/* Remove upload files that no product/card references anymore. */
try {
  for (const file of await readdir('assets/uploads')) {
    if (file.endsWith('.webp') && !referenced.has(file)) await rm('assets/uploads/' + file);
  }
} catch (_) { /* nothing to prune */ }

const manifest = {
  format: 'dastin-public-catalogue',
  version: 1,
  exportedAt: new Date().toISOString(),
  settings,
  showcase,
  products
};
await writeFile('catalogue.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('catalogue.json written:', products.length, 'products,', referenced.size, 'cloud images downloaded.');
