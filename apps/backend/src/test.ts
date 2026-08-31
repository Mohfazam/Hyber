import 'dotenv/config';
import { db, products } from '@repo/db';

async function main() {
  const result = await db.select().from(products).limit(3);
  console.log(result);
}

main();