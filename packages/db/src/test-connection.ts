import { db, products } from './index';

async function main() {
  const result = await db.select().from(products);
  console.log('Connection OK. Products found:', result.length);
  process.exit(0);
}

main().catch((err) => {
  console.error('Connection failed:', err);
  process.exit(1);
});