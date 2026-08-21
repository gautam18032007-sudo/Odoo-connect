import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const sql = neon(process.env.DATABASE_URL);

import {
  getExecutiveInventoryMetrics,
  getStoreInventoryBreakdown,
  getFastSlowMovingProducts,
  getReorderRecommendations,
  getStockAgingDistribution,
} from './lib/repositories/inventory.repository.js';

async function testCombination(name, filters) {
  console.log(`\n========================================`);
  console.log(`TEST COMBINATION: ${name}`);
  console.log(`Filters:`, filters);

  const overview = await getExecutiveInventoryMetrics(filters);
  const stores = await getStoreInventoryBreakdown(filters);
  const fastSlow = await getFastSlowMovingProducts(filters);
  const reorder = await getReorderRecommendations(filters);
  const aging = await getStockAgingDistribution(filters);

  console.log(`-> Total SOH: ${overview.totalSohQty} units (${overview.totalItemsCount} items)`);
  console.log(`-> MRP Valuation: ₹${overview.totalInventoryValueMrp}`);
  console.log(`-> Cost Valuation: ₹${overview.totalInventoryValueCost}`);
  console.log(`-> Store Breakdown Locations: ${stores.length} mapped`);
  console.log(`-> Fast Moving Items: ${fastSlow.fastMoving.length}`);
  console.log(`-> Slow Moving Items: ${fastSlow.slowMoving.length}`);
  console.log(`-> Reorder Recommendations: ${reorder.length}`);
  console.log(`-> Stock Aging Brackets: ${aging.map(a => `${a.ageRange}:${a.totalQuantity}`).join(', ')}`);
}

async function run() {
  await testCombination("1. All Stores + All Categories + All Brands", {});
  await testCombination("2. Smart Works Noida (Store Only)", { store: "Smart Works Noida" });
  await testCombination("3. KLJ (Store Only)", { store: "KLJ" });
  await testCombination("4. Head office (Store Only)", { store: "Head office" });
  await testCombination("5. Category = Cosmetics", { category: "Cosmetics" });
  await testCombination("6. Category = Skincare", { category: "Skincare" });
  await testCombination("7. Brand = Go desi", { brand: "Go desi" });
  await testCombination("8. Brand = GIRNAR", { brand: "GIRNAR" });
  await testCombination("9. Store (SWN) + Category (Cosmetics)", { store: "Smart Works Noida", category: "Cosmetics" });
  await testCombination("10. Store (KLJ) + Brand (GIRNAR)", { store: "KLJ", brand: "GIRNAR" });
  await testCombination("11. Store (SWN) + Category (Cosmetics) + Brand (Go desi)", { store: "Smart Works Noida", category: "Cosmetics", brand: "Go desi" });
}

run().catch(console.error);
