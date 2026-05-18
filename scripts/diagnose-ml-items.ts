/**
 * Diagnose the two failed ML items.
 * Fetches item data + category data from ML API.
 * Run: DATABASE_URL=... npx tsx scripts/diagnose-ml-items.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const ITEM_IDS = ['MLA3326614802', 'MLA3326627860'];

async function mlGet<T>(path: string, token: string): Promise<T> {
  const base = 'https://api.mercadolibre.com';
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`ML API ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  diagnose-ml-items — category audit for finalized items');
  console.log('════════════════════════════════════════════════════════════════\n');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
  const prisma = new PrismaClient({ adapter });
  let token: string;
  try {
    const account = await prisma.mercadoLibreAccount.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!account) { console.error('No ML account in DB. Connect at /settings/mercadolibre.'); process.exit(1); }
    token = account.accessToken;
    console.log(`Using ML account userId=${account.userId}\n`);
  } finally {
    await prisma.$disconnect();
  }

  for (const itemId of ITEM_IDS) {
    console.log(`\n──────────────────────────────────────────────────────────────`);
    console.log(`  Item: ${itemId}`);
    console.log(`──────────────────────────────────────────────────────────────`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let item: any;
    try {
      item = await mlGet<any>(`/items/${itemId}`, token);
    } catch (err) {
      console.error(`  ❌ Could not fetch item: ${err}`);
      continue;
    }

    console.log(`  item_id:      ${item.id}`);
    console.log(`  title:        ${item.title}`);
    console.log(`  category_id:  ${item.category_id}`);
    console.log(`  status:       ${item.status}`);
    console.log(`  sub_status:   ${JSON.stringify(item.sub_status)}`);
    console.log(`  listing_type: ${item.listing_type_id}`);
    console.log(`  condition:    ${item.condition}`);
    console.log(`  price:        ${item.price} ${item.currency_id}`);
    console.log(`  pictures:     ${item.pictures?.length ?? 0} image(s)`);

    if (item.pictures?.length) {
      for (const pic of item.pictures) {
        console.log(`    - ${pic.secure_url ?? pic.url ?? pic.id}`);
      }
    }

    // Fetch category details
    const catId: string = item.category_id;
    console.log(`\n  ── Category detail: ${catId} ─────────────────────────`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cat: any;
    try {
      cat = await mlGet<any>(`/categories/${catId}`, token);
    } catch (err) {
      console.error(`  ❌ Could not fetch category: ${err}`);
      continue;
    }

    const isLeaf = (cat.children_categories ?? []).length === 0;
    const path = (cat.path_from_root ?? []).map((p: { name: string }) => p.name).join(' > ');

    console.log(`  category_id:   ${cat.id}`);
    console.log(`  name:          ${cat.name}`);
    console.log(`  path_from_root: ${path || '(empty)'}`);
    console.log(`  is_leaf:       ${isLeaf}`);
    console.log(`  children:      ${(cat.children_categories ?? []).length}`);
    if ((cat.children_categories ?? []).length > 0) {
      for (const child of cat.children_categories.slice(0, 5)) {
        console.log(`    child: ${child.id} — ${child.name}`);
      }
      if (cat.children_categories.length > 5) {
        console.log(`    ... and ${cat.children_categories.length - 5} more`);
      }
    }

    const listingTypes = cat.settings?.listing_types;
    console.log(`  listing_types: ${JSON.stringify(listingTypes ?? 'all')}`);

    console.log(`\n  ── Diagnosis ────────────────────────────────────────────────`);
    if (!isLeaf) {
      console.log(`  ❌ NOT A LEAF CATEGORY — ML requires leaf categories.`);
      console.log(`     Root cause: publishing in "${cat.name}" which has ${cat.children_categories.length} child categories.`);
      console.log(`     ML immediately finalizes listings published in non-leaf categories.`);
    } else {
      console.log(`  ✅ Is a leaf category.`);
    }

    if (listingTypes && listingTypes.length > 0) {
      const marketplace = ['gold_special', 'gold_pro', 'gold', 'silver', 'bronze'];
      const supportsMarket = listingTypes.some((lt: string) => marketplace.includes(lt));
      if (!supportsMarket) {
        console.log(`  ❌ DOES NOT SUPPORT MARKETPLACE LISTINGS — classified-only category.`);
      }
    }
  }

  console.log('\n\n════════════════════════════════════════════════════════════════');
  console.log('  Testing domain_discovery for these product types');
  console.log('════════════════════════════════════════════════════════════════\n');

  const testQueries = [
    { title: 'Heladera Samsung No Frost 290L Blanca', type: 'refrigerator' },
    { title: 'Microondas Samsung 23L 1150W Blanco', type: 'microwave' },
  ];

  for (const q of testQueries) {
    console.log(`\n  ── domain_discovery: "${q.title}" ─────────────────`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await mlGet<any[]>(
        `/sites/MLA/domain_discovery/search?q=${encodeURIComponent(q.title)}&limit=3`,
        token
      );
      if (!results || results.length === 0) {
        console.log('  (no results)');
        continue;
      }
      for (const r of results) {
        console.log(`  → ${r.id}: ${r.name} (domain: ${r.domain_id ?? 'n/a'})`);
        // Check if it's a leaf
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cat = await mlGet<any>(`/categories/${r.id}`, token);
        const leaf = (cat.children_categories ?? []).length === 0;
        const path = (cat.path_from_root ?? []).map((p: { name: string }) => p.name).join(' > ');
        console.log(`     path:    ${path}`);
        console.log(`     is_leaf: ${leaf}`);
        if (!leaf) console.log(`     ⚠️  Non-leaf — ML would finalize listing immediately`);
      }
    } catch (err) {
      console.error(`  ❌ domain_discovery failed: ${err}`);
    }
  }

  console.log('\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
