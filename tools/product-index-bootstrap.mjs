import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = process.argv[2] || path.resolve(repo, '..', '02_Extracted_CSV');
const outputPath = process.argv[3] || path.join(repo, 'dist', 'hoshilu-products-bootstrap.sql');
const tenantPattern = /customer_support-([^@]+)@/i;

function latestFiles() {
  const selected = new Map();
  for (const name of fs.readdirSync(sourceDirectory)) {
    if (!name.toLowerCase().endsWith('.csv')) continue;
    const match = name.match(tenantPattern);
    if (!match) continue;
    const fullPath = path.join(sourceDirectory, name);
    const stat = fs.statSync(fullPath);
    const tenant = match[1].toLowerCase();
    if (!selected.has(tenant) || selected.get(tenant).mtimeMs < stat.mtimeMs) {
      selected.set(tenant, { tenant, fullPath, mtimeMs: stat.mtimeMs, importedAt: stat.mtime.toISOString() });
    }
  }
  return [...selected.values()].sort((a, b) => a.tenant.localeCompare(b.tenant));
}

function sql(value) {
  return `'${String(value ?? '').replaceAll('\u0000', '').replaceAll("'", "''")}'`;
}

function integer(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

async function parseCsv(filePath, onRow) {
  const decoder = new TextDecoder('shift_jis');
  let row = [], field = '', quoted = false, pendingQuote = false;
  async function consume(text) {
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (pendingQuote) {
        pendingQuote = false;
        if (char === '"') { field += '"'; continue; }
        quoted = false;
      }
      if (quoted) {
        if (char === '"') {
          if (i + 1 < text.length) {
            if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
          } else pendingQuote = true;
        } else field += char;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') {
        row.push(field.replace(/\r$/, '')); field = '';
        await onRow(row); row = [];
      } else field += char;
    }
  }
  for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })) {
    await consume(decoder.decode(chunk, { stream: true }));
  }
  await consume(decoder.decode());
  if (field || row.length) { row.push(field.replace(/\r$/, '')); await onRow(row); }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const output = fs.openSync(outputPath, 'w');
fs.writeSync(output, 'PRAGMA foreign_keys=ON;\n');
let total = 0, skipped = 0;
const counts = {};

for (const source of latestFiles()) {
  let header;
  let indexes;
  counts[source.tenant] = 0;
  await parseCsv(source.fullPath, async (row) => {
    if (!header) {
      header = row.map((value) => value.replace(/^\uFEFF/, '').trim());
      const index = (name) => header.indexOf(name);
      indexes = {
        asin: index('ASIN'), image: index('画像'), name: index('商品名'), stock: index('在庫数'),
        sku: index('SKU'), manufacturer: index('メーカー'), jp: index('日本Amazon'), us: index('米国Amazon')
      };
      if (indexes.asin < 0 || indexes.name < 0) throw new Error(`Required headers missing: ${source.fullPath}`);
      return;
    }
    const asin = String(row[indexes.asin] || '').trim().toUpperCase();
    const sku = String(row[indexes.sku] || '').trim().toUpperCase();
    const productName = String(row[indexes.name] || '').trim();
    if (!/^[A-Z0-9]{10}$/.test(asin) || !productName || (!sku && !asin)) { skipped += 1; return; }
    const recordKey = `${source.tenant}|${sku || asin}`;
    const values = {
      tenant: source.tenant, recordKey, asin, sku, productName,
      manufacturer: String(row[indexes.manufacturer] || '').trim(),
      image: String(row[indexes.image] || '').trim(), stock: integer(row[indexes.stock]),
      jp: String(row[indexes.jp] || '').trim(), us: String(row[indexes.us] || '').trim()
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
    const statement = `INSERT INTO products(tenant,record_key,asin,sku,product_name,manufacturer,image_url,stock,amazon_jp_url,amazon_us_url,search_aliases,localized_content,row_hash,imported_at) VALUES(${sql(values.tenant)},${sql(values.recordKey)},${sql(values.asin)},${sql(values.sku)},${sql(values.productName)},${sql(values.manufacturer)},${sql(values.image)},${values.stock},${sql(values.jp)},${sql(values.us)},${sql(values.manufacturer)},'{}',${sql(hash)},${sql(source.importedAt)}) ON CONFLICT(tenant,record_key) DO UPDATE SET asin=excluded.asin,sku=excluded.sku,product_name=excluded.product_name,manufacturer=excluded.manufacturer,image_url=excluded.image_url,stock=excluded.stock,amazon_jp_url=excluded.amazon_jp_url,amazon_us_url=excluded.amazon_us_url,search_aliases=excluded.search_aliases,row_hash=excluded.row_hash,imported_at=excluded.imported_at WHERE products.row_hash<>excluded.row_hash;\n`;
    fs.writeSync(output, statement);
    total += 1; counts[source.tenant] += 1;
  });
}
fs.closeSync(output);
console.log(JSON.stringify({ outputPath, total, skipped, counts }, null, 2));
