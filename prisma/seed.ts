import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { generateSlug } from '../src/shared/utils/slug.js';

type SeedAttributeValue = {
  value: string;
  colorCode?: string;
};

type SeedAttribute = {
  name: string;
  values: SeedAttributeValue[];
};

const ATTRIBUTES: SeedAttribute[] = [
  {
    name: 'Size',
    values: [{ value: 'S' }, { value: 'M' }, { value: 'L' }, { value: 'XL' }, { value: 'XXL' }],
  },
  {
    name: 'Color',
    values: [
      { value: 'Black', colorCode: '#000000' },
      { value: 'White', colorCode: '#FFFFFF' },
      { value: 'Green', colorCode: '#008000' },
      { value: 'Red', colorCode: '#FF0000' },
      { value: 'Blue', colorCode: '#0000FF' },
      { value: 'Brown', colorCode: '#A52A2A' },
      { value: 'Yellow', colorCode: '#FFFF00' },
      { value: 'Orange', colorCode: '#FFA500' },
      { value: 'Pink', colorCode: '#FFC0CB' },
      { value: 'Purple', colorCode: '#800080' },
      { value: 'Grey', colorCode: '#808080' },
    ],
  },
];

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const pool = new pg.Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function seedAttributes(): Promise<void> {
  for (const attributeDef of ATTRIBUTES) {
    const slug = generateSlug(attributeDef.name);

    const attribute = await prisma.attribute.upsert({
      where: { slug },
      update: { name: attributeDef.name },
      create: {
        name: attributeDef.name,
        slug,
      },
    });

    for (const valueDef of attributeDef.values) {
      const valueSlug = generateSlug(valueDef.value);
      const colorCode = valueDef.colorCode ?? null;

      await prisma.attributeValue.upsert({
        where: {
          attributeId_slug: {
            attributeId: attribute.id,
            slug: valueSlug,
          },
        },
        update: {
          value: valueDef.value,
          colorCode,
        },
        create: {
          attributeId: attribute.id,
          value: valueDef.value,
          slug: valueSlug,
          colorCode,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  await seedAttributes();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
