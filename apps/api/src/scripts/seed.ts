/**
 * Development-only seed. Idempotent and non-destructive: it never deletes data and skips
 * records that already exist. Refuses to run when NODE_ENV=production.
 *
 * Password: uses SEED_PASSWORD if set (min 10 chars); otherwise generates a random one and
 * writes it to apps/api/.data/seed-credentials.local.md (git-ignored). There is no default
 * password baked into the code.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { Category, GrowingPractice, LanguageCode, Role, Unit } from '@rythubazaar/shared';
import { DeliveryAgent, FarmerProfile, Listing, User, ensureIndexes } from '../models';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV=production. Seed data is for development only.');
  process.exit(1);
}
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Copy apps/api/.env.example to apps/api/.env first.');
  process.exit(1);
}

const providedPassword = process.env.SEED_PASSWORD;
if (providedPassword && providedPassword.length < 10) {
  console.error('SEED_PASSWORD must be at least 10 characters.');
  process.exit(1);
}
const password = providedPassword || `rb-${randomBytes(9).toString('base64url')}`;

interface SeedUser {
  name: string;
  email: string;
  role: Role;
  lang: LanguageCode;
  phone?: string;
  farm?: { farmName: string; village: string; district: string; state: string; pincode: string; bio: string };
}

const users: SeedUser[] = [
  { name: 'Asha Admin', email: 'admin@rythubazaar.test', role: 'ADMIN', lang: 'en-IN' },
  { name: 'Omkar Operations', email: 'ops@rythubazaar.test', role: 'OPERATIONS', lang: 'en-IN' },
  { name: 'Sana Support', email: 'support@rythubazaar.test', role: 'SUPPORT', lang: 'en-IN' },
  {
    name: 'Ravi Kumar',
    email: 'ravi.farmer@rythubazaar.test',
    role: 'FARMER',
    lang: 'te-IN',
    phone: '9876500001',
    farm: {
      farmName: 'Ravi Kumar Farms',
      village: 'Kollur',
      district: 'Guntur',
      state: 'Andhra Pradesh',
      pincode: '522324',
      bio: 'Vegetables grown on 4 acres near the Krishna river.',
    },
  },
  {
    name: 'Meena Selvam',
    email: 'meena.farmer@rythubazaar.test',
    role: 'FARMER',
    lang: 'ta-IN',
    phone: '9876500002',
    farm: {
      farmName: 'Selvam Thottam',
      village: 'Pollachi',
      district: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '642001',
      bio: 'Banana and coconut family farm.',
    },
  },
  {
    name: 'Basavaraj Patil',
    email: 'basu.farmer@rythubazaar.test',
    role: 'FARMER',
    lang: 'kn-IN',
    phone: '9876500003',
    farm: {
      farmName: 'Patil Krushi',
      village: 'Hosakote',
      district: 'Bengaluru Rural',
      state: 'Karnataka',
      pincode: '562114',
      bio: 'Leafy greens and onions.',
    },
  },
  {
    name: 'Lakshmi Customer',
    email: 'lakshmi@rythubazaar.test',
    role: 'CUSTOMER',
    lang: 'te-IN',
    phone: '9876500011',
  },
  {
    name: 'Arjun Customer',
    email: 'arjun@rythubazaar.test',
    role: 'CUSTOMER',
    lang: 'hi-IN',
    phone: '9876500012',
  },
];

const listings: {
  farmer: string;
  cropName: string;
  category: Category;
  unit: Unit;
  price: number;
  qty: number;
  status: 'ACTIVE' | 'DRAFT';
  practice?: GrowingPractice;
  cert?: { body: string; number: string; status: 'PENDING_VERIFICATION' | 'VERIFIED' };
  description: string;
}[] = [
  {
    farmer: 'ravi.farmer@rythubazaar.test',
    cropName: 'Tomato',
    category: 'VEGETABLES',
    unit: 'KG',
    price: 3200,
    qty: 180,
    status: 'ACTIVE',
    description: 'Firm, red country tomatoes picked this morning.',
  },
  {
    farmer: 'ravi.farmer@rythubazaar.test',
    cropName: 'Green chilli',
    category: 'VEGETABLES',
    unit: 'KG',
    price: 6000,
    qty: 40,
    status: 'ACTIVE',
    practice: 'NATURAL_FARMER_REPORTED',
    description: 'Guntur green chillies, medium heat.',
  },
  {
    farmer: 'ravi.farmer@rythubazaar.test',
    cropName: 'Brinjal',
    category: 'VEGETABLES',
    unit: 'KG',
    price: 2800,
    qty: 90,
    status: 'ACTIVE',
    description: 'Purple round brinjal.',
  },
  {
    farmer: 'ravi.farmer@rythubazaar.test',
    cropName: 'Okra',
    category: 'VEGETABLES',
    unit: 'KG',
    price: 4000,
    qty: 60,
    status: 'DRAFT',
    description: 'Tender okra — draft, not yet published.',
  },
  {
    farmer: 'meena.farmer@rythubazaar.test',
    cropName: 'Banana (Poovan)',
    category: 'FRUITS',
    unit: 'DOZEN',
    price: 6500,
    qty: 120,
    status: 'ACTIVE',
    practice: 'ORGANIC_CERTIFIED_CLAIMED',
    cert: { body: 'TNOCD', number: 'TN-ORG-2291', status: 'VERIFIED' },
    description: 'Naturally ripened Poovan bananas.',
  },
  {
    farmer: 'meena.farmer@rythubazaar.test',
    cropName: 'Coconut',
    category: 'OTHER',
    unit: 'PIECE',
    price: 3500,
    qty: 300,
    status: 'ACTIVE',
    description: 'Mature coconuts, husked.',
  },
  {
    farmer: 'meena.farmer@rythubazaar.test',
    cropName: 'Mango (Alphonso)',
    category: 'FRUITS',
    unit: 'KG',
    price: 18000,
    qty: 50,
    status: 'ACTIVE',
    practice: 'ORGANIC_CERTIFIED_CLAIMED',
    cert: { body: 'Demo Cert Body', number: 'DEMO-4471', status: 'PENDING_VERIFICATION' },
    description: 'Certificate supplied; awaiting staff verification.',
  },
  {
    farmer: 'basu.farmer@rythubazaar.test',
    cropName: 'Spinach',
    category: 'LEAFY_GREENS',
    unit: 'BUNCH',
    price: 2000,
    qty: 200,
    status: 'ACTIVE',
    practice: 'ORGANIC_FARMER_REPORTED',
    description: 'Fresh palak bunches.',
  },
  {
    farmer: 'basu.farmer@rythubazaar.test',
    cropName: 'Onion',
    category: 'VEGETABLES',
    unit: 'KG',
    price: 3000,
    qty: 500,
    status: 'ACTIVE',
    description: 'Medium red onions, cured.',
  },
  {
    farmer: 'basu.farmer@rythubazaar.test',
    cropName: 'Toor dal',
    category: 'GRAINS_PULSES',
    unit: 'KG',
    price: 14000,
    qty: 80,
    status: 'ACTIVE',
    description: 'Unpolished toor dal.',
  },
];

async function main() {
  await mongoose.connect(uri!, { serverSelectionTimeoutMS: 5000 });
  await ensureIndexes();
  const hash = await bcrypt.hash(password, 12);
  const ids = new Map<string, mongoose.Types.ObjectId>();
  const created: string[] = [];

  for (const u of users) {
    let doc = await User.findOne({ email: u.email });
    if (!doc) {
      doc = await User.create({
        name: u.name,
        email: u.email,
        phone: u.phone,
        passwordHash: hash,
        role: u.role,
        preferredLanguage: u.lang,
      });
      created.push(u.email);
    }
    ids.set(u.email, doc._id);
    if (u.farm && !(await FarmerProfile.exists({ userId: doc._id }))) {
      await FarmerProfile.create({ userId: doc._id, ...u.farm });
    }
  }

  const today = new Date();
  for (const l of listings) {
    const farmerId = ids.get(l.farmer)!;
    if (await Listing.exists({ farmerId, cropName: l.cropName })) continue;
    const profile = await FarmerProfile.findOne({ userId: farmerId }).lean();
    const adminId = ids.get('admin@rythubazaar.test')!;
    await Listing.create({
      farmerId,
      cropName: l.cropName,
      category: l.category,
      description: l.description,
      unit: l.unit,
      pricePerUnitPaise: l.price,
      quantityTotal: l.qty,
      harvestDate: new Date(today.getTime() - 2 * 86400000),
      availableFrom: today,
      availableUntil: new Date(today.getTime() + 14 * 86400000),
      location: { village: profile!.village, district: profile!.district, state: profile!.state },
      growingPractice: l.practice ?? 'CONVENTIONAL',
      certification: l.cert
        ? {
            status: l.cert.status,
            body: l.cert.body,
            certificateNumber: l.cert.number,
            validUntil: new Date(today.getTime() + 300 * 86400000),
            reviewedBy: l.cert.status === 'VERIFIED' ? adminId : null,
            reviewedAt: l.cert.status === 'VERIFIED' ? today : null,
            reviewNote: l.cert.status === 'VERIFIED' ? 'Seed data: demo verification record' : undefined,
          }
        : { status: 'NONE' },
      status: l.status,
      statusHistory: [
        { from: null, to: 'DRAFT', at: today, actorId: farmerId, actorRole: 'FARMER' },
        ...(l.status === 'ACTIVE'
          ? [{ from: 'DRAFT', to: 'ACTIVE', at: today, actorId: farmerId, actorRole: 'FARMER' }]
          : []),
      ],
    });
  }

  if ((await DeliveryAgent.countDocuments()) === 0) {
    await DeliveryAgent.create([
      { name: 'Kiran (Guntur hub)', phone: '9000000101', zone: 'Guntur' },
      { name: 'Suresh (Coimbatore hub)', phone: '9000000102', zone: 'Coimbatore' },
      { name: 'Manju (Bengaluru hub)', phone: '9000000103', zone: 'Bengaluru' },
    ]);
  }

  const dir = path.resolve(process.cwd(), '.data');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'seed-credentials.local.md');
  if (created.length) {
    writeFileSync(
      file,
      [
        '# Development seed accounts (local only — never commit or use in production)',
        '',
        `Password for accounts created in this run: \`${password}\``,
        '',
        ...created.map((e) => `- ${e} (${users.find((u) => u.email === e)!.role})`),
        '',
        'Accounts that already existed were left unchanged and keep their previous password.',
        '',
      ].join('\n'),
      { encoding: 'utf8' },
    );
    console.log(`Created ${created.length} accounts. Credentials written to ${file}`);
  } else {
    console.log('All seed accounts already exist; nothing changed. Existing passwords were not modified.');
  }
  console.log(
    `Listings: ${await Listing.countDocuments()} · Delivery agents: ${await DeliveryAgent.countDocuments()}`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', (err as Error).message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
