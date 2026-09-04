import 'dotenv/config';
import { db, products } from './index';

/**
 * Seed script — generates 100+ synthetic products across 6 categories,
 * each with every field from the schema populated realistically.
 *
 * Run with: pnpm exec tsx src/seed.ts
 */

type NewProduct = typeof products.$inferInsert;

const RUPEE = (n: number) => n * 100; // store amounts in paise

// ---------- Category definitions ----------
// Each category has: name templates, brands, price range, sizes/genders (if applicable)

const footwear = {
  category: 'Footwear',
  brands: ['Nova Stride', 'Urban Trail', 'Peak Runner', 'Sole Craft', 'Cliffwalk'],
  names: [
    'Running Shoe', 'Casual Sneaker', 'Formal Oxford', 'Trail Hiking Boot',
    'Slip-On Loafer', 'High-Top Sneaker', 'Sports Sandal', 'Canvas Shoe',
  ],
  genders: ['Men', 'Women', 'Unisex'],
  sizes: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10'],
  priceRange: [1299, 4999],
};

const electronics = {
  category: 'Electronics',
  brands: ['Zentek', 'Wavecore', 'Pulseon', 'Nimbus Audio', 'Circuitry'],
  names: [
    'Wireless Earbuds', 'Bluetooth Speaker', 'Smartwatch', 'Power Bank 10000mAh',
    'Noise Cancelling Headphones', 'USB-C Fast Charger', 'Fitness Tracker Band', 'Portable SSD 512GB',
  ],
  genders: [null],
  sizes: [null],
  priceRange: [999, 8999],
};

const apparel = {
  category: 'Apparel',
  brands: ['Threadloom', 'Casaline', 'Fitwell', 'Drapery Co.', 'Urban Weave'],
  names: [
    'Cotton T-Shirt', 'Slim Fit Jeans', 'Hooded Sweatshirt', 'Formal Shirt',
    'Track Pants', 'Denim Jacket', 'Polo T-Shirt', 'Chino Trousers',
  ],
  genders: ['Men', 'Women', 'Unisex'],
  sizes: ['S', 'M', 'L', 'XL', 'XXL'],
  priceRange: [499, 2999],
};

const homeKitchen = {
  category: 'Home & Kitchen',
  brands: ['Hearthly', 'Kitchna', 'Domus', 'Brewline', 'Panbase'],
  names: [
    'Non-Stick Frying Pan', 'Electric Kettle 1.5L', 'Ceramic Dinner Set (6pc)',
    'Stainless Steel Water Bottle', 'Air-Tight Storage Jar Set', 'Hand Blender',
    'Cotton Bedsheet Set', 'Table Lamp',
  ],
  genders: [null],
  sizes: [null],
  priceRange: [349, 3499],
};

const beauty = {
  category: 'Beauty & Personal Care',
  brands: ['Purelume', 'Glow Theory', 'Herbal Root', 'Skinvest', 'Aromance'],
  names: [
    'Vitamin C Face Serum', 'Herbal Shampoo 300ml', 'Matte Lipstick',
    'Sunscreen SPF 50', 'Beard Growth Oil', 'Body Lotion 400ml',
    'Charcoal Face Wash', 'Perfume 100ml',
  ],
  genders: ['Men', 'Women', 'Unisex'],
  sizes: [null],
  priceRange: [199, 1799],
};

const sportsFitness = {
  category: 'Sports & Fitness',
  brands: ['Ironclad', 'Flexcore', 'Trailhead', 'Gripzone', 'Vertex Fit'],
  names: [
    'Yoga Mat 6mm', 'Adjustable Dumbbell Set', 'Resistance Band Set',
    'Cricket Bat', 'Badminton Racquet', 'Skipping Rope', 'Gym Duffel Bag', 'Protein Shaker Bottle',
  ],
  genders: [null],
  sizes: [null],
  priceRange: [249, 4499],
};

const categories = [footwear, electronics, apparel, homeKitchen, beauty, sportsFitness];

// ---------- Helpers ----------

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)]!;
}

function slugify(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function makeVoiceDescription(name: string, brand: string, category: string): string {
  const templates = [
    `The ${name} from ${brand} — a solid pick in ${category}, well-reviewed for everyday use.`,
    `${brand}'s ${name} is a popular choice, known for good quality and comfort.`,
    `This ${name} by ${brand} is a customer favorite in our ${category} range.`,
    `A reliable ${name} from ${brand}, great value for the price.`,
  ];
  return pick(templates);
}

function makeDiscountRules(price: number) {
  const roll = Math.random();
  if (roll < 0.3) {
    return [{ condition: 'qty>3', discountPercent: pick([5, 10, 15]) }];
  }
  if (roll < 0.5) {
    return [{ condition: 'qty>5', discountPercent: pick([10, 12, 20]) }];
  }
  return [];
}

// ---------- Generation ----------

function generateProducts(): NewProduct[] {
  const items: NewProduct[] = [];
  let counter = 1;

  for (const cat of categories) {
    // ~17 products per category to comfortably exceed 100 total across 6 categories
    const perCategory = Math.ceil(102 / categories.length);

    for (let i = 0; i < perCategory; i++) {
      const name = pick(cat.names);
      const brand = pick(cat.brands);
      const gender = cat.genders.length ? pick(cat.genders) : null;
      const size = cat.sizes.length ? pick(cat.sizes) : null;
      const price = randInt(cat.priceRange[0]!, cat.priceRange[1]!);
      const priceInPaise = RUPEE(price);
      const sku = `${slugify(cat.category)}-${slugify(name)}-${counter.toString().padStart(3, '0')}`;
      const availability = Math.random() < 0.9 ? 'InStock' : 'OutOfStock';

      const requiresConfirmationAbove = RUPEE(2000);
      const maxAutoApproveAmount = Math.min(priceInPaise, RUPEE(1500));

      items.push({
        sku,
        name: `${name}${gender ? ` (${gender})` : ''}${size ? ` - ${size}` : ''}`,
        price: priceInPaise,
        currency: 'INR',
        availability,
        category: cat.category,
        gender,
        size,
        brand,
        voiceDescription: makeVoiceDescription(name, brand, cat.category),
        maxAutoApproveAmount,
        requiresConfirmationAbove,
        extensions: {
          discountRules: makeDiscountRules(priceInPaise),
          liveAvailabilityEndpoint: `/catalog/products/${sku}/availability`,
        },
      });

      counter++;
    }
  }

  return items;
}

// ---------- Run ----------

async function seed() {
  const existingProduct = await db.select({ sku: products.sku }).from(products).limit(1);
  if (existingProduct.length > 0) {
    console.log('Products already exist. Skipping seed to avoid duplicate SKUs.');
    process.exit(0);
  }

  const data = generateProducts();
  console.log(`Generated ${data.length} products across ${categories.length} categories.`);

  const inserted = await db.insert(products).values(data).returning({ sku: products.sku });

  console.log(`Inserted ${inserted.length} products.`);
  console.log('Sample SKUs:', inserted.slice(0, 5).map((p) => p.sku));

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});