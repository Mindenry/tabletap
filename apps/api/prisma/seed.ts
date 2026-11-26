/**
 * TableTap demo seed.
 *
 * Creates two restaurants, staff across every role, a full menu with modifiers,
 * floor plans with QR labels, inventory with recipes, promotions, and ~30 days
 * of internally consistent trading history (orders → bills → payments →
 * refunds → stock movements).
 *
 * The seed is intentionally deterministic where it matters (names, prices,
 * document counts) and uses a seeded PRNG for the sales history so every run
 * produces the same demo, and so tests can reason about it.
 *
 * Demo-only shortcuts, never acceptable in production:
 *  - QR tokens are deterministic so the printed demo links keep working.
 *  - All demo accounts share the password from DEMO_PASSWORD.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { encryptSecret } from '../src/common/secret-box';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  PLANS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  buildPromptPayPayload,
  type RoleKey,
} from '@tabletap/shared';
import { priceOrder } from '../src/modules/orders/pricing';
import { DocumentNumberService } from '../src/common/common.module';

const prisma = new PrismaClient();
const numbers = new DocumentNumberService(prisma as never);

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'TableTap!2026';
const ARGON2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

// Mulberry32 — deterministic sales history.
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = makeRandom(20261125);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

function bangkokDate(daysAgo: number, hour: number, minute: number): Date {
  const now = new Date();
  const base = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return new Date(
    `${y}-${m}-${d}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`,
  );
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date).replace(/-/g, '');
}

interface SeedMenuItem {
  name: string;
  nameEn: string;
  category: string;
  price: number;
  cost: number;
  prep: number;
  descriptionTh: string;
  descriptionEn: string;
  modifierGroups?: string[];
  station: string;
  featured?: boolean;
  popular?: boolean;
}

const MENU: SeedMenuItem[] = [
  {
    name: 'ปอเปี๊ยะทอด',
    nameEn: 'Crispy Spring Rolls',
    category: 'starters',
    price: 129,
    cost: 32,
    prep: 8,
    descriptionTh: 'ปอเปี๊ยะไส้ผักทอดกรอบ เสิร์ฟพร้อมน้ำจิ้มบ๊วย',
    descriptionEn: 'Crispy vegetable spring rolls with plum sauce',
    station: 'HOT_KITCHEN',
    popular: true,
  },
  {
    name: 'ไก่สะเต๊ะ',
    nameEn: 'Chicken Satay',
    category: 'starters',
    price: 149,
    cost: 45,
    prep: 10,
    descriptionTh: 'ไก่หมักเครื่องเทศย่าง เสิร์ฟพร้อมน้ำจิ้มถั่ว',
    descriptionEn: 'Char-grilled marinated chicken skewers with peanut sauce',
    station: 'GRILL',
  },
  {
    name: 'ส้มตำไทย',
    nameEn: 'Som Tam Thai',
    category: 'starters',
    price: 119,
    cost: 28,
    prep: 6,
    descriptionTh: 'ส้มตำรสจัดจ้าน ถั่วลิสง มะเขือเทศ',
    descriptionEn: 'Green papaya salad with peanuts and tomato',
    modifierGroups: ['spice'],
    station: 'COLD_KITCHEN',
    popular: true,
  },
  {
    name: 'ทอดมันปลา',
    nameEn: 'Thai Fish Cakes',
    category: 'starters',
    price: 139,
    cost: 38,
    prep: 9,
    descriptionTh: 'ทอดมันปลาเนื้อแน่น เสิร์ฟพร้อมแตงกวา',
    descriptionEn: 'Springy fish cakes with cucumber relish',
    station: 'HOT_KITCHEN',
  },
  {
    name: 'ต้มยำกุ้ง',
    nameEn: 'Tom Yum Goong',
    category: 'soups',
    price: 189,
    cost: 62,
    prep: 12,
    descriptionTh: 'ต้มยำกุ้งแม่น้ำรสเปรี้ยวเผ็ด',
    descriptionEn: 'Hot and sour prawn soup with lemongrass',
    modifierGroups: ['spice', 'protein'],
    station: 'HOT_KITCHEN',
    featured: true,
  },
  {
    name: 'ต้มข่าไก่',
    nameEn: 'Tom Kha Gai',
    category: 'soups',
    price: 169,
    cost: 48,
    prep: 11,
    descriptionTh: 'ต้มข่าไก่กะทิหอมมัน',
    descriptionEn: 'Coconut chicken soup with galangal',
    station: 'HOT_KITCHEN',
  },
  {
    name: 'ก๋วยเตี๋ยวน้ำใส',
    nameEn: 'Clear Noodle Soup',
    category: 'soups',
    price: 129,
    cost: 30,
    prep: 8,
    descriptionTh: 'ก๋วยเตี๋ยวน้ำใสลูกชิ้น',
    descriptionEn: 'Clear broth noodles with pork balls',
    station: 'HOT_KITCHEN',
  },
  {
    name: 'แกงเขียวหวาน',
    nameEn: 'Green Curry',
    category: 'curries',
    price: 179,
    cost: 52,
    prep: 12,
    descriptionTh: 'แกงเขียวหวานกะทิสด',
    descriptionEn: 'Green curry with coconut milk and Thai basil',
    modifierGroups: ['spice', 'protein'],
    station: 'HOT_KITCHEN',
    popular: true,
  },
  {
    name: 'แกงแดง',
    nameEn: 'Red Curry',
    category: 'curries',
    price: 179,
    cost: 50,
    prep: 12,
    descriptionTh: 'แกงแดงเผ็ดร้อน',
    descriptionEn: 'Spicy red curry with bamboo shoots',
    modifierGroups: ['spice', 'protein'],
    station: 'HOT_KITCHEN',
  },
  {
    name: 'มัสมั่นไก่',
    nameEn: 'Massaman Curry',
    category: 'curries',
    price: 199,
    cost: 60,
    prep: 14,
    descriptionTh: 'มัสมั่นไก่หวานมัน',
    descriptionEn: 'Slow-cooked Massaman curry with potato',
    modifierGroups: ['protein'],
    station: 'HOT_KITCHEN',
    featured: true,
  },
  {
    name: 'พะแนงหมู',
    nameEn: 'Panang Pork',
    category: 'curries',
    price: 189,
    cost: 55,
    prep: 12,
    descriptionTh: 'พะแนงหมูเข้มข้น',
    descriptionEn: 'Rich Panang curry with pork',
    modifierGroups: ['spice', 'protein'],
    station: 'HOT_KITCHEN',
  },
  {
    name: 'ผัดไทยกุ้งสด',
    nameEn: 'Pad Thai with Prawns',
    category: 'wok',
    price: 179,
    cost: 55,
    prep: 10,
    descriptionTh: 'ผัดไทยเส้นจันท์กุ้งสด',
    descriptionEn: 'Classic Pad Thai with fresh prawns',
    modifierGroups: ['spice', 'toppings'],
    station: 'HOT_KITCHEN',
    featured: true,
    popular: true,
  },
  {
    name: 'ผัดซีอิ๊ว',
    nameEn: 'Pad See Ew',
    category: 'wok',
    price: 149,
    cost: 38,
    prep: 9,
    descriptionTh: 'ผัดซีอิ๊วเส้นใหญ่หมู',
    descriptionEn: 'Stir-fried wide noodles with pork and Chinese broccoli',
    modifierGroups: ['protein'],
    station: 'HOT_KITCHEN',
  },
  {
    name: 'ผัดกะเพราหมู',
    nameEn: 'Basil Pork',
    category: 'wok',
    price: 159,
    cost: 42,
    prep: 8,
    descriptionTh: 'ผัดกะเพราหมูสับไข่ดาว',
    descriptionEn: 'Stir-fried pork with holy basil and fried egg',
    modifierGroups: ['spice', 'toppings'],
    station: 'HOT_KITCHEN',
    popular: true,
  },
  {
    name: 'ไก่ผัดเม็ดมะม่วง',
    nameEn: 'Cashew Chicken',
    category: 'wok',
    price: 169,
    cost: 48,
    prep: 9,
    descriptionTh: 'ไก่ผัดเม็ดมะม่วงหิมพานต์',
    descriptionEn: 'Stir-fried chicken with cashew nuts',
    station: 'HOT_KITCHEN',
  },
  {
    name: 'ข้าวผัดกุ้ง',
    nameEn: 'Prawn Fried Rice',
    category: 'rice',
    price: 149,
    cost: 40,
    prep: 8,
    descriptionTh: 'ข้าวผัดกุ้งหอมกระทะ',
    descriptionEn: 'Wok-fried rice with prawns',
    modifierGroups: ['toppings'],
    station: 'HOT_KITCHEN',
  },
  {
    name: 'ข้าวสับปะรด',
    nameEn: 'Pineapple Rice',
    category: 'rice',
    price: 169,
    cost: 45,
    prep: 10,
    descriptionTh: 'ข้าวผัดสับปะรดในลูกสับปะรด',
    descriptionEn: 'Fried rice served in a pineapple',
    station: 'HOT_KITCHEN',
  },
  {
    name: 'ข้าวสวย',
    nameEn: 'Steamed Rice',
    category: 'rice',
    price: 25,
    cost: 5,
    prep: 2,
    descriptionTh: 'ข้าวหอมมะลิ',
    descriptionEn: 'Jasmine rice',
    station: 'HOT_KITCHEN',
  },
  {
    name: 'ไก่ย่าง',
    nameEn: 'Grilled Chicken',
    category: 'grill',
    price: 189,
    cost: 55,
    prep: 15,
    descriptionTh: 'ไก่ย่างสมุนไพร',
    descriptionEn: 'Herb-marinated grilled chicken',
    modifierGroups: ['spice'],
    station: 'GRILL',
    popular: true,
  },
  {
    name: 'คอหมูย่าง',
    nameEn: 'Grilled Pork Neck',
    category: 'grill',
    price: 199,
    cost: 62,
    prep: 15,
    descriptionTh: 'คอหมูย่างจิ้มแจ่ว',
    descriptionEn: 'Grilled pork neck with tamarind dip',
    station: 'GRILL',
    featured: true,
  },
  {
    name: 'กุ้งแม่น้ำย่าง',
    nameEn: 'Grilled River Prawns',
    category: 'grill',
    price: 449,
    cost: 180,
    prep: 18,
    descriptionTh: 'กุ้งแม่น้ำย่างซีอิ๊ว',
    descriptionEn: 'Grilled river prawns with seafood sauce',
    station: 'GRILL',
  },
  {
    name: 'ลาบไก่',
    nameEn: 'Chicken Larb',
    category: 'salads',
    price: 139,
    cost: 34,
    prep: 7,
    descriptionTh: 'ลาบไก่สไตล์อีสาน',
    descriptionEn: 'Isaan-style minced chicken salad',
    modifierGroups: ['spice'],
    station: 'COLD_KITCHEN',
  },
  {
    name: 'ยำวุ้นเส้น',
    nameEn: 'Glass Noodle Salad',
    category: 'salads',
    price: 149,
    cost: 36,
    prep: 8,
    descriptionTh: 'ยำวุ้นเส้นทะเล',
    descriptionEn: 'Spicy glass noodle salad with seafood',
    modifierGroups: ['spice'],
    station: 'COLD_KITCHEN',
  },
  {
    name: 'ข้าวเหนียวมะม่วง',
    nameEn: 'Mango Sticky Rice',
    category: 'desserts',
    price: 159,
    cost: 42,
    prep: 5,
    descriptionTh: 'ข้าวเหนียวมะม่วงน้ำดอกไม้',
    descriptionEn: 'Sticky rice with ripe mango and coconut cream',
    station: 'DESSERT',
    featured: true,
    popular: true,
  },
  {
    name: 'ไอศกรีมมะพร้าว',
    nameEn: 'Coconut Ice Cream',
    category: 'desserts',
    price: 99,
    cost: 25,
    prep: 3,
    descriptionTh: 'ไอศกรีมมะพร้าวถั่วลิสง',
    descriptionEn: 'Coconut ice cream with peanuts',
    station: 'DESSERT',
  },
  {
    name: 'กล้วยแขกทอด',
    nameEn: 'Fried Banana',
    category: 'desserts',
    price: 89,
    cost: 20,
    prep: 6,
    descriptionTh: 'กล้วยหอมทอดกรอบ',
    descriptionEn: 'Crispy fried banana',
    station: 'DESSERT',
  },
  {
    name: 'ชาไทย',
    nameEn: 'Thai Iced Tea',
    category: 'drinks',
    price: 65,
    cost: 12,
    prep: 3,
    descriptionTh: 'ชาไทยเย็น',
    descriptionEn: 'Thai iced tea with condensed milk',
    modifierGroups: ['sweetness'],
    station: 'BEVERAGE',
    popular: true,
  },
  {
    name: 'น้ำมะนาวโซดา',
    nameEn: 'Lemon Soda',
    category: 'drinks',
    price: 65,
    cost: 10,
    prep: 2,
    descriptionTh: 'มะนาวโซดาสดชื่น',
    descriptionEn: 'Fresh lemon soda',
    modifierGroups: ['sweetness'],
    station: 'BEVERAGE',
  },
  {
    name: 'น้ำมะพร้าว',
    nameEn: 'Coconut Water',
    category: 'drinks',
    price: 79,
    cost: 25,
    prep: 2,
    descriptionTh: 'น้ำมะพร้าวสด',
    descriptionEn: 'Fresh coconut water',
    station: 'BEVERAGE',
  },
  {
    name: 'เบียร์สิงห์',
    nameEn: 'Singha Beer',
    category: 'drinks',
    price: 120,
    cost: 55,
    prep: 1,
    descriptionTh: 'เบียร์สิงห์ขวด',
    descriptionEn: 'Singha beer, bottle',
    station: 'BEVERAGE',
  },
  {
    name: 'เบียร์ช้าง',
    nameEn: 'Chang Beer',
    category: 'drinks',
    price: 110,
    cost: 48,
    prep: 1,
    descriptionTh: 'เบียร์ช้างขวด',
    descriptionEn: 'Chang beer, bottle',
    station: 'BEVERAGE',
  },
  {
    name: 'เอสเปรสโซ',
    nameEn: 'Espresso',
    category: 'coffee',
    price: 75,
    cost: 18,
    prep: 3,
    descriptionTh: 'เอสเปรสโซร้อน',
    descriptionEn: 'Double espresso',
    modifierGroups: ['sweetness'],
    station: 'BEVERAGE',
  },
  {
    name: 'ลาเต้',
    nameEn: 'Latte',
    category: 'coffee',
    price: 95,
    cost: 24,
    prep: 4,
    descriptionTh: 'ลาเต้ร้อน/เย็น',
    descriptionEn: 'Latte, hot or iced',
    modifierGroups: ['sweetness'],
    station: 'BEVERAGE',
  },
  {
    name: 'อเมริกาโน่เย็น',
    nameEn: 'Iced Americano',
    category: 'coffee',
    price: 85,
    cost: 20,
    prep: 3,
    descriptionTh: 'อเมริกาโน่เย็น',
    descriptionEn: 'Iced americano',
    modifierGroups: ['sweetness'],
    station: 'BEVERAGE',
  },
];

const CATEGORIES = [
  { slug: 'starters', name: 'อาหารเรียกน้ำย่อย', nameEn: 'Starters' },
  { slug: 'soups', name: 'ซุป', nameEn: 'Soups' },
  { slug: 'curries', name: 'แกง', nameEn: 'Curries' },
  { slug: 'wok', name: 'ผัด', nameEn: 'Wok & Noodles' },
  { slug: 'rice', name: 'ข้าว', nameEn: 'Rice' },
  { slug: 'grill', name: 'ย่าง', nameEn: 'Grill' },
  { slug: 'salads', name: 'สลัด', nameEn: 'Salads' },
  { slug: 'desserts', name: 'ของหวาน', nameEn: 'Desserts' },
  { slug: 'drinks', name: 'เครื่องดื่ม', nameEn: 'Drinks' },
  { slug: 'coffee', name: 'กาแฟ', nameEn: 'Coffee' },
];

async function ensureCatalog(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: { code: permission.code, description: permission.description, category: permission.category },
      update: { description: permission.description, category: permission.category },
    });
  }
  for (const allergen of [
    { id: 'peanut', code: 'peanut', name: 'Peanuts', nameTh: 'ถั่วลิสง' },
    { id: 'shellfish', code: 'shellfish', name: 'Shellfish', nameTh: 'อาหารทะเล' },
    { id: 'egg', code: 'egg', name: 'Egg', nameTh: 'ไข่' },
    { id: 'dairy', code: 'dairy', name: 'Dairy', nameTh: 'นม' },
    { id: 'gluten', code: 'gluten', name: 'Gluten', nameTh: 'กลูเตน' },
    { id: 'fish', code: 'fish', name: 'Fish', nameTh: 'ปลา' },
  ]) {
    await prisma.allergen.upsert({ where: { id: allergen.id }, create: allergen, update: allergen });
  }
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { key: plan.key },
      create: {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        priceMonthly: new Prisma.Decimal(plan.priceMonthly),
        currency: plan.currency,
        features: plan.features,
        limits: plan.limits as unknown as Prisma.InputJsonValue,
      },
      update: {
        name: plan.name,
        description: plan.description,
        priceMonthly: new Prisma.Decimal(plan.priceMonthly),
        features: plan.features,
        limits: plan.limits as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

async function createTenant(input: {
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  branches: Array<{
    name: string;
    code: string;
    address: string;
    phone: string;
    vatInclusive: boolean;
    serviceChargeEnabled: boolean;
    serviceChargeValue: number;
    promptPayId: string | null;
  }>;
  planKey: string;
}) {
  const tenant = await prisma.tenant.create({
    data: {
      name: input.name,
      slug: input.slug,
      email: input.email,
      phone: input.phone,
      address: input.address,
      timezone: 'Asia/Bangkok',
      currency: 'THB',
      language: 'th',
      status: 'ACTIVE',
    },
  });

  const roleIds: Record<string, string> = {};
  for (const role of ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'VIEWER'] as RoleKey[]) {
    const created = await prisma.role.create({
      data: { tenantId: tenant.id, key: role, name: ROLE_LABELS[role].en, isSystem: true },
    });
    roleIds[role] = created.id;
    await prisma.rolePermission.createMany({
      data: ROLE_PERMISSIONS[role].map((permissionCode) => ({ roleId: created.id, permissionCode })),
      skipDuplicates: true,
    });
  }

  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { key: input.planKey } });
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const branches = [];
  for (const branchInput of input.branches) {
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: branchInput.name,
        code: branchInput.code,
        address: branchInput.address,
        phone: branchInput.phone,
        timezone: 'Asia/Bangkok',
        currency: 'THB',
        vatRate: new Prisma.Decimal(7),
        vatInclusive: branchInput.vatInclusive,
        serviceChargeEnabled: branchInput.serviceChargeEnabled,
        serviceChargeType: 'PERCENT',
        serviceChargeValue: new Prisma.Decimal(branchInput.serviceChargeValue),
        promptPayId: branchInput.promptPayId,
        receiptHeader: input.name,
        receiptFooter: 'Thank you / ขอบคุณที่ใช้บริการ',
        status: 'ACTIVE',
      },
    });
    for (const [index, station] of [
      { code: 'HOT_KITCHEN', name: 'Hot kitchen' },
      { code: 'COLD_KITCHEN', name: 'Cold kitchen' },
      { code: 'GRILL', name: 'Grill' },
      { code: 'BEVERAGE', name: 'Beverage bar' },
      { code: 'DESSERT', name: 'Dessert' },
    ].entries()) {
      await prisma.kitchenStation.create({
        data: { branchId: branch.id, code: station.code, name: station.name, displayOrder: index },
      });
    }
    branches.push(branch);
  }

  return { tenant, roleIds, branches };
}

async function createUser(input: {
  email: string;
  name: string;
  platformAdmin?: boolean;
  memberships?: Array<{ tenantId: string; roleId: string; branchIds: string[]; position?: string }>;
}) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, ARGON2);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      platformAdmin: input.platformAdmin ?? false,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(Date.now() - between(1, 48) * 60 * 60 * 1000),
    },
  });
  for (const membershipInput of input.memberships ?? []) {
    const membership = await prisma.membership.create({
      data: {
        tenantId: membershipInput.tenantId,
        userId: user.id,
        roleId: membershipInput.roleId,
        status: 'ACTIVE',
        defaultBranchId: membershipInput.branchIds[0] ?? null,
      },
    });
    if (membershipInput.branchIds.length > 0) {
      await prisma.membershipBranch.createMany({
        data: membershipInput.branchIds.map((branchId) => ({ membershipId: membership.id, branchId })),
      });
    }
    await prisma.staffProfile.create({
      data: {
        membershipId: membership.id,
        userId: user.id,
        position: membershipInput.position ?? null,
        phone: `08${between(10000000, 99999999)}`,
        hiredAt: new Date(Date.now() - between(30, 700) * 24 * 60 * 60 * 1000),
      },
    });
  }
  return user;
}

async function createMenu(tenantId: string) {
  const categories = new Map<string, string>();
  for (const [index, category] of CATEGORIES.entries()) {
    const created = await prisma.menuCategory.create({
      data: {
        tenantId,
        name: category.name,
        nameEn: category.nameEn,
        slug: category.slug,
        displayOrder: index,
        isActive: true,
      },
    });
    categories.set(category.slug, created.id);
  }

  const groups: Record<string, string> = {};
  const groupDefs = [
    {
      key: 'spice',
      name: 'ระดับความเผ็ด',
      nameEn: 'Spice level',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        ['ไม่เผ็ด', 'Mild', 0],
        ['เผ็ดน้อย', 'Medium', 0],
        ['เผ็ดมาก', 'Thai spicy', 0],
      ],
    },
    {
      key: 'protein',
      name: 'เลือกเนื้อสัตว์',
      nameEn: 'Protein',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        ['ไก่', 'Chicken', 0],
        ['หมู', 'Pork', 20],
        ['เนื้อ', 'Beef', 40],
        ['กุ้ง', 'Prawn', 60],
        ['เต้าหู้', 'Tofu', 0],
      ],
    },
    {
      key: 'toppings',
      name: 'เพิ่มพิเศษ',
      nameEn: 'Extra toppings',
      required: false,
      minSelect: 0,
      maxSelect: 3,
      options: [
        ['ไข่ดาว', 'Fried egg', 15],
        ['ข้าวเพิ่ม', 'Extra rice', 20],
        ['ชีส', 'Cheese', 25],
      ],
    },
    {
      key: 'sweetness',
      name: 'ความหวาน',
      nameEn: 'Sweetness',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        ['ไม่หวาน', 'No sugar', 0],
        ['หวานน้อย', '50%', 0],
        ['หวานปกติ', '100%', 0],
      ],
    },
  ];
  for (const [index, group] of groupDefs.entries()) {
    const created = await prisma.modifierGroup.create({
      data: {
        tenantId,
        name: group.name,
        nameEn: group.nameEn,
        required: group.required,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        displayOrder: index,
        options: {
          create: group.options.map(([name, nameEn, price], optionIndex) => ({
            name: String(name),
            nameEn: String(nameEn),
            priceDelta: new Prisma.Decimal(String(price)),
            displayOrder: optionIndex,
          })),
        },
      },
    });
    groups[group.key] = created.id;
  }

  const items = [];
  for (const [index, item] of MENU.entries()) {
    const created = await prisma.menuItem.create({
      data: {
        tenantId,
        categoryId: categories.get(item.category)!,
        name: item.name,
        nameEn: item.nameEn,
        slug: `${item.category}-${index + 1}-${item.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(
          0,
          70,
        ),
        description: item.descriptionTh,
        descriptionEn: item.descriptionEn,
        basePrice: new Prisma.Decimal(item.price),
        costEstimate: new Prisma.Decimal(item.cost),
        prepMinutes: item.prep,
        status: 'ACTIVE',
        isFeatured: item.featured ?? false,
        isPopular: item.popular ?? false,
        displayOrder: index,
      },
    });
    items.push({ ...item, id: created.id });

    for (const [groupIndex, groupKey] of (item.modifierGroups ?? []).entries()) {
      await prisma.menuItemModifierGroup.create({
        data: { menuItemId: created.id, modifierGroupId: groups[groupKey]!, displayOrder: groupIndex },
      });
    }
  }

  return { categories, groups, items };
}

async function attachStations(tenantId: string, items: Array<{ id: string; station: string }>) {
  const branches = await prisma.branch.findMany({ where: { tenantId }, include: { kitchenStations: true } });
  for (const branch of branches) {
    for (const item of items) {
      const station = branch.kitchenStations.find((candidate) => candidate.code === item.station);
      if (!station) continue;
      await prisma.menuItemStation.create({ data: { menuItemId: item.id, stationId: station.id } });
    }
  }
}

async function createTables(tenantId: string, branchId: string, code: string, count: number) {
  const zones = [
    { name: 'Indoor', count: Math.round(count * 0.5) },
    { name: 'Terrace', count: Math.round(count * 0.25) },
    { name: 'VIP', count: Math.round(count * 0.15) },
    {
      name: 'Private Room',
      count: count - Math.round(count * 0.5) - Math.round(count * 0.25) - Math.round(count * 0.15),
    },
  ];
  const tables = [];
  let tableNumber = 1;
  let rowOffset = 0;
  for (const [zoneIndex, zone] of zones.entries()) {
    if (zone.count <= 0) continue;
    const createdZone = await prisma.tableZone.create({
      data: { branchId, name: zone.name, displayOrder: zoneIndex },
    });
    const zoneRows = Math.ceil(zone.count / 5);
    for (let index = 0; index < zone.count; index += 1) {
      const number = String(tableNumber).padStart(2, '0');
      const table = await prisma.diningTable.create({
        data: {
          branchId,
          zoneId: createdZone.id,
          number,
          name: `${zone.name} ${number}`,
          capacity: zone.name === 'VIP' ? 8 : zone.name === 'Private Room' ? 12 : 4,
          posX: new Prisma.Decimal(80 + (index % 5) * 190),
          posY: new Prisma.Decimal(80 + (rowOffset + Math.floor(index / 5)) * 170),
          width: new Prisma.Decimal(130),
          height: new Prisma.Decimal(90),
          status: 'AVAILABLE',
        },
      });
      tables.push(table);
      tableNumber += 1;
    }
    rowOffset += zoneRows;
  }

  // Deterministic demo QR tokens so printed/kiosk links stay stable.
  for (const table of tables) {
    const raw = `demo-${code.toLowerCase()}-t${table.number}-4f8c2a91`;
    await prisma.tableQrToken.create({
      data: {
        tableId: table.id,
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        tokenCiphertext: encryptSecret(raw),
        tokenPrefix: `DEMO-${code}-${table.number}`,
      },
    });
  }
  return tables;
}

async function createInventory(tenantId: string, branchId: string) {
  const definitions = [
    { name: 'ข้าวหอมมะลิ', sku: 'RICE', unit: 'kg', cost: 48, min: 10, stock: 120 },
    { name: 'ไข่ไก่', sku: 'EGG', unit: 'pcs', cost: 5.5, min: 60, stock: 480 },
    { name: 'เนื้อไก่', sku: 'CHICKEN', unit: 'kg', cost: 95, min: 8, stock: 60 },
    { name: 'กุ้งสด', sku: 'PRAWN', unit: 'kg', cost: 320, min: 4, stock: 28 },
    { name: 'น้ำมันพืช', sku: 'OIL', unit: 'l', cost: 62, min: 4, stock: 30 },
    { name: 'น้ำปลา', sku: 'FISHSAUCE', unit: 'l', cost: 75, min: 2, stock: 12 },
    { name: 'น้ำตาล', sku: 'SUGAR', unit: 'kg', cost: 28, min: 5, stock: 40 },
    { name: 'กะทิ', sku: 'COCONUT', unit: 'l', cost: 85, min: 6, stock: 36 },
    { name: 'ผักรวม', sku: 'VEG', unit: 'kg', cost: 45, min: 6, stock: 40 },
    { name: 'เส้นจันท์', sku: 'NOODLE', unit: 'kg', cost: 55, min: 4, stock: 24 },
    { name: 'มะม่วงน้ำดอกไม้', sku: 'MANGO', unit: 'pcs', cost: 35, min: 20, stock: 120 },
    { name: 'ข้าวเหนียว', sku: 'STICKYRICE', unit: 'kg', cost: 42, min: 4, stock: 26 },
    { name: 'ใบชาไทย', sku: 'TEA', unit: 'kg', cost: 240, min: 1, stock: 7 },
    { name: 'นมข้นหวาน', sku: 'CONDENSED', unit: 'l', cost: 68, min: 3, stock: 18 },
  ];
  const ingredients = new Map<string, { id: string; unit: string }>();
  for (const definition of definitions) {
    const ingredient = await prisma.ingredient.create({
      data: {
        tenantId,
        branchId,
        name: definition.name,
        sku: definition.sku,
        category: definition.unit === 'pcs' ? 'Produce' : 'Dry goods',
        unit: definition.unit,
        costPerUnit: new Prisma.Decimal(definition.cost),
        minStock: new Prisma.Decimal(definition.min),
        currentStock: new Prisma.Decimal(definition.stock),
        storageLocation: 'Main store',
        isActive: true,
      },
    });
    ingredients.set(definition.sku, { id: ingredient.id, unit: ingredient.unit });
    await prisma.stockMovement.create({
      data: {
        tenantId,
        branchId,
        ingredientId: ingredient.id,
        type: 'RECEIVE',
        quantity: new Prisma.Decimal(definition.stock),
        unit: ingredient.unit,
        balanceAfter: new Prisma.Decimal(definition.stock),
        referenceType: 'SEED_OPENING',
        referenceId: ingredient.id,
        reason: 'Opening balance (demo seed)',
        idempotencyKey: `seed-opening:${ingredient.id}`,
      },
    });
  }
  return ingredients;
}

async function createRecipes(
  tenantId: string,
  items: Array<{ id: string; nameEn: string }>,
  ingredients: Map<string, { id: string; unit: string }>,
) {
  const recipes: Record<string, Array<[string, number, string]>> = {
    'Crispy Spring Rolls': [
      ['VEG', 0.08, 'kg'],
      ['OIL', 0.02, 'l'],
    ],
    'Pad Thai with Prawns': [
      ['NOODLE', 0.12, 'kg'],
      ['PRAWN', 0.08, 'kg'],
      ['EGG', 1, 'pcs'],
      ['OIL', 0.02, 'l'],
      ['FISHSAUCE', 0.015, 'l'],
      ['SUGAR', 0.01, 'kg'],
    ],
    'Basil Pork': [
      ['CHICKEN', 0.12, 'kg'],
      ['EGG', 1, 'pcs'],
      ['OIL', 0.02, 'l'],
      ['FISHSAUCE', 0.015, 'l'],
    ],
    'Green Curry': [
      ['CHICKEN', 0.12, 'kg'],
      ['COCONUT', 0.2, 'l'],
      ['VEG', 0.08, 'kg'],
      ['FISHSAUCE', 0.015, 'l'],
    ],
    'Prawn Fried Rice': [
      ['RICE', 0.18, 'kg'],
      ['PRAWN', 0.07, 'kg'],
      ['EGG', 1, 'pcs'],
      ['OIL', 0.02, 'l'],
    ],
    'Tom Yum Goong': [
      ['PRAWN', 0.1, 'kg'],
      ['VEG', 0.06, 'kg'],
      ['FISHSAUCE', 0.02, 'l'],
    ],
    'Mango Sticky Rice': [
      ['STICKYRICE', 0.09, 'kg'],
      ['MANGO', 0.5, 'pcs'],
      ['COCONUT', 0.08, 'l'],
      ['SUGAR', 0.02, 'kg'],
    ],
    'Thai Iced Tea': [
      ['TEA', 0.008, 'kg'],
      ['CONDENSED', 0.04, 'l'],
      ['SUGAR', 0.015, 'kg'],
    ],
    'Grilled Chicken': [
      ['CHICKEN', 0.25, 'kg'],
      ['FISHSAUCE', 0.01, 'l'],
    ],
  };

  for (const item of items) {
    const recipe = recipes[item.nameEn];
    if (!recipe) continue;
    const createdRecipe = await prisma.recipe.create({
      data: { menuItemId: item.id },
    });
    const version = await prisma.recipeVersion.create({
      data: { recipeId: createdRecipe.id, version: 1, notes: 'Demo recipe' },
    });
    let cost = 0;
    for (const [sku, quantity, unit] of recipe) {
      const ingredient = ingredients.get(sku);
      if (!ingredient) continue;
      await prisma.recipeItem.create({
        data: {
          versionId: version.id,
          ingredientId: ingredient.id,
          quantity: new Prisma.Decimal(quantity),
          unit,
        },
      });
      const perUnitCost =
        {
          RICE: 48,
          EGG: 5.5,
          CHICKEN: 95,
          PRAWN: 320,
          OIL: 62,
          FISHSAUCE: 75,
          SUGAR: 28,
          COCONUT: 85,
          VEG: 45,
          NOODLE: 55,
          MANGO: 35,
          STICKYRICE: 42,
          TEA: 240,
          CONDENSED: 68,
        }[sku] ?? 0;
      cost += quantity * perUnitCost * (unit === 'g' ? 0.001 : unit === 'ml' ? 0.001 : 1);
    }
    await prisma.recipe.update({
      where: { id: createdRecipe.id },
      data: { currentVersionId: version.id },
    });
    await prisma.menuItem.update({
      where: { id: item.id },
      data: { costEstimate: new Prisma.Decimal(cost.toFixed(2)) },
    });
  }
}

async function seedSales(input: {
  tenant: { id: string };
  branch: {
    id: string;
    code: string;
    vatRate: Prisma.Decimal;
    vatInclusive: boolean;
    serviceChargeEnabled: boolean;
    serviceChargeType: string;
    serviceChargeValue: Prisma.Decimal;
  };
  tables: Array<{ id: string; number: string }>;
  items: Array<{ id: string; name: string; nameEn: string; price: number; station: string; modifierGroups?: string[] }>;
  groups: Record<string, string>;
  ownerId: string;
  cashierId: string;
  days: number;
  ordersPerDay: number;
}) {
  const optionCache = new Map<
    string,
    Array<{ id: string; name: string; priceDelta: Prisma.Decimal; groupId: string; groupName: string }>
  >();
  for (const [key, groupId] of Object.entries(input.groups)) {
    const options = await prisma.modifierOption.findMany({ where: { modifierGroupId: groupId } });
    const group = await prisma.modifierGroup.findUniqueOrThrow({ where: { id: groupId } });
    optionCache.set(
      key,
      options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
        groupId,
        groupName: group.name,
      })),
    );
  }

  const stations = await prisma.kitchenStation.findMany({ where: { branchId: input.branch.id } });
  const stationByCode = new Map(stations.map((station) => [station.code, station]));

  let created = 0;

  for (let daysAgo = input.days - 1; daysAgo >= 0; daysAgo -= 1) {
    const isWeekend = [0, 6].includes(bangkokDate(daysAgo, 12, 0).getDay());
    const count = input.ordersPerDay + (isWeekend ? 3 : 0) + between(-2, 3);
    for (let index = 0; index < Math.max(3, count); index += 1) {
      const lunch = index % 2 === 0;
      const createdAt = lunch
        ? bangkokDate(daysAgo, between(11, 14), between(0, 59))
        : bangkokDate(daysAgo, between(17, 21), between(0, 59));
      const table = pick(input.tables);
      const number = await numbers.next(prisma, {
        tenantId: input.tenant.id,
        branchId: input.branch.id,
        branchCode: input.branch.code,
        type: 'ORDER',
        date: createdAt,
      });

      const cancelled = random() < 0.03;
      const lineCount = between(1, 4);
      const chosen: Array<{
        item: (typeof input.items)[number];
        quantity: number;
        modifiers: Array<{ id: string; name: string; priceDelta: Prisma.Decimal; groupName: string }>;
      }> = [];
      const used = new Set<string>();
      for (let line = 0; line < lineCount; line += 1) {
        let item = pick(input.items);
        let guard = 0;
        while (used.has(item.id) && guard < 10) {
          item = pick(input.items);
          guard += 1;
        }
        used.add(item.id);
        const modifierKeys = item.modifierGroups ?? [];
        const modifiers: Array<{ id: string; name: string; priceDelta: Prisma.Decimal; groupName: string }> =
          [];
        for (const groupKey of modifierKeys) {
          const options = optionCache.get(groupKey) ?? [];
          if (options.length === 0) continue;
          const required = groupKey === 'spice' || groupKey === 'sweetness';
          if (!required && random() < 0.5) continue;
          const option = pick(options);
          modifiers.push({
            id: option.id,
            name: option.name,
            priceDelta: option.priceDelta,
            groupName: option.groupName,
          });
        }
        chosen.push({ item, quantity: between(1, 2), modifiers });
      }

      const pricingLines = chosen.map((line) => ({
        unitPrice: new Prisma.Decimal(line.item.price),
        modifiersPerUnit: line.modifiers.reduce(
          (acc, modifier) => acc.plus(modifier.priceDelta),
          new Prisma.Decimal(0),
        ),
        quantity: line.quantity,
      }));
      const pricing = priceOrder(pricingLines, {
        vatRate: input.branch.vatRate,
        vatInclusive: input.branch.vatInclusive,
        serviceChargeType: input.branch.serviceChargeType as 'PERCENT' | 'FIXED',
        serviceChargeValue: input.branch.serviceChargeValue,
      });

      const acceptedAt = new Date(createdAt.getTime() + between(1, 4) * 60 * 1000);
      const readyAt = new Date(acceptedAt.getTime() + between(8, 25) * 60 * 1000);
      const servedAt = new Date(readyAt.getTime() + between(2, 8) * 60 * 1000);
      const paidAt = new Date(servedAt.getTime() + between(15, 40) * 60 * 1000);

      const session = await prisma.tableSession.create({
        data: {
          tenantId: input.tenant.id,
          branchId: input.branch.id,
          tableId: table.id,
          status: 'CLOSED',
          guestCount: between(1, 5),
          openedAt: new Date(createdAt.getTime() - 10 * 60 * 1000),
          closedAt: paidAt,
          openedById: input.ownerId,
          closedById: input.cashierId,
        },
      });

      const order = await prisma.order.create({
        data: {
          tenantId: input.tenant.id,
          branchId: input.branch.id,
          tableId: table.id,
          tableSessionId: session.id,
          number,
          status: cancelled ? 'CANCELLED' : 'SERVED',
          source: random() < 0.8 ? 'CUSTOMER_QR' : 'STAFF_POS',
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          serviceCharge: pricing.serviceCharge,
          taxTotal: pricing.taxTotal,
          total: pricing.total,
          currency: 'THB',
          createdAt,
          acceptedAt: cancelled ? null : acceptedAt,
          readyAt: cancelled ? null : readyAt,
          servedAt: cancelled ? null : servedAt,
          cancelledAt: cancelled ? acceptedAt : null,
          cancelReason: cancelled ? 'Customer changed their mind' : null,
          createdById: cancelled ? input.cashierId : null,
        },
      });

      let index2 = 0;
      const seededItems: Array<{ id: string; station: string }> = [];
      for (const line of chosen) {
        const price = pricing.lines[index2]!;
        const item = await prisma.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: line.item.id,
            nameSnapshot: line.item.name,
            skuSnapshot: null,
            quantity: line.quantity,
            unitPrice: new Prisma.Decimal(line.item.price),
            modifiersTotal: line.modifiers.reduce(
              (acc, modifier) => acc.plus(modifier.priceDelta),
              new Prisma.Decimal(0),
            ),
            lineSubtotal: price.lineSubtotal,
            lineDiscount: price.lineDiscount,
            lineTax: price.lineTax,
            lineTotal: price.lineTotal,
            status: cancelled ? 'CANCELLED' : 'SERVED',
            createdAt,
          },
        });
        for (const modifier of line.modifiers) {
          await prisma.orderItemModifier.create({
            data: {
              orderItemId: item.id,
              modifierOptionId: modifier.id,
              groupName: modifier.groupName,
              name: modifier.name,
              priceDelta: modifier.priceDelta,
            },
          });
        }
        seededItems.push({ id: item.id, station: line.item.station });
        index2 += 1;
      }

      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          actorType: cancelled ? 'STAFF' : 'SYSTEM',
          toStatus: cancelled ? 'CANCELLED' : 'SERVED',
          createdAt: cancelled ? acceptedAt : servedAt,
          reason: cancelled ? 'Customer changed their mind' : null,
        },
      });

      if (cancelled) continue;

      // Historical kitchen tickets so operations analytics are meaningful.
      const byStation = new Map<string, Array<{ id: string; station: string }>>();
      for (const seeded of seededItems) {
        const list = byStation.get(seeded.station) ?? [];
        list.push(seeded);
        byStation.set(seeded.station, list);
      }
      for (const [stationCode, stationItems] of byStation) {
        const station = stationByCode.get(stationCode) ?? stationByCode.get('HOT_KITCHEN');
        if (!station) continue;
        const ticket = await prisma.kitchenTicket.create({
          data: {
            tenantId: input.tenant.id,
            branchId: input.branch.id,
            stationId: station.id,
            orderId: order.id,
            number: `${number}-${station.code}`,
            status: 'SERVED',
            acceptedById: input.cashierId,
            acceptedAt,
            readyAt,
            servedAt,
            createdAt,
          },
        });
        for (const stationItem of stationItems) {
          await prisma.kitchenTicketItem.create({
            data: {
              ticketId: ticket.id,
              orderItemId: stationItem.id,
              status: 'SERVED',
              readyAt,
            },
          });
        }
        await prisma.kitchenEvent.create({
          data: { ticketId: ticket.id, actorUserId: input.cashierId, toStatus: 'SERVED', createdAt: servedAt },
        });
      }

      const billNumber = await numbers.next(prisma, {
        tenantId: input.tenant.id,
        branchId: input.branch.id,
        branchCode: input.branch.code,
        type: 'BILL',
        date: paidAt,
      });
      const bill = await prisma.bill.create({
        data: {
          tenantId: input.tenant.id,
          branchId: input.branch.id,
          tableSessionId: session.id,
          number: billNumber,
          status: 'PAID',
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          serviceCharge: pricing.serviceCharge,
          taxTotal: pricing.taxTotal,
          total: pricing.total,
          paidTotal: pricing.total,
          currency: 'THB',
          taxRate: input.branch.vatRate,
          taxInclusive: input.branch.vatInclusive,
          serviceChargeType: input.branch.serviceChargeType,
          serviceChargeValue: input.branch.serviceChargeValue,
          createdById: input.cashierId,
          createdAt: paidAt,
          openedAt: createdAt,
          paidAt,
        },
      });
      await prisma.billOrder.create({ data: { billId: bill.id, orderId: order.id } });
      const orderItems = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      for (const orderItem of orderItems) {
        await prisma.billItem.create({
          data: {
            billId: bill.id,
            orderItemId: orderItem.id,
            nameSnapshot: orderItem.nameSnapshot,
            variantName: orderItem.variantName,
            quantity: orderItem.quantity,
            unitPrice: orderItem.unitPrice,
            modifiersTotal: orderItem.modifiersTotal,
            lineSubtotal: orderItem.lineSubtotal,
            lineDiscount: orderItem.lineDiscount,
            lineTax: orderItem.lineTax,
            lineTotal: orderItem.lineTotal,
          },
        });
      }

      const method = random() < 0.55 ? 'PROMPTPAY' : random() < 0.85 ? 'CASH' : 'CARD';
      const payment = await prisma.payment.create({
        data: {
          tenantId: input.tenant.id,
          branchId: input.branch.id,
          billId: bill.id,
          method,
          status: 'PAID',
          amount: pricing.total,
          amountPaid: pricing.total,
          currency: 'THB',
          reference: `PAY-${number}`,
          provider: method === 'PROMPTPAY' ? 'PROMPTPAY' : null,
          promptPayPayload:
            method === 'PROMPTPAY'
              ? buildPromptPayPayload({
                  target: { id: '0812345678' },
                  amount: pricing.total.toFixed(2),
                  reference: billNumber,
                })
              : null,
          confirmedById: input.cashierId,
          confirmedAt: paidAt,
          createdAt: paidAt,
          expiresAt: new Date(paidAt.getTime() + 15 * 60 * 1000),
        },
      });
      await prisma.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          action: 'CONFIRM',
          actorId: input.cashierId,
          result: 'SUCCESS',
          createdAt: paidAt,
        },
      });
      const receiptNumber = await numbers.next(prisma, {
        tenantId: input.tenant.id,
        branchId: input.branch.id,
        branchCode: input.branch.code,
        type: 'RCP',
        date: paidAt,
      });
      await prisma.receipt.create({
        data: {
          billId: bill.id,
          number: receiptNumber,
          issuedAt: paidAt,
          createdById: input.cashierId,
          payload: {
            restaurant: {
              name: input.tenant.name,
              taxId: input.tenant.taxId,
              address: input.tenant.address,
            },
            branch: {
              name: input.branch.name,
              address: input.branch.address,
              phone: input.branch.phone,
              vatRate: input.branch.vatRate.toFixed(2),
              vatInclusive: input.branch.vatInclusive,
            },
            billNumber,
            receiptNumber,
            orderNumbers: [number],
            table: table.number,
            issuedAt: paidAt.toISOString(),
            currency: 'THB',
            items: orderItems.map((orderItem) => ({
              name: orderItem.nameSnapshot,
              variantName: orderItem.variantName,
              quantity: orderItem.quantity,
              unitPrice: orderItem.unitPrice.toFixed(2),
              lineTotal: orderItem.lineTotal.toFixed(2),
              lineTax: orderItem.lineTax.toFixed(2),
            })),
            subtotal: pricing.subtotal.toFixed(2),
            discountTotal: pricing.discountTotal.toFixed(2),
            serviceCharge: pricing.serviceCharge.toFixed(2),
            taxTotal: pricing.taxTotal.toFixed(2),
            total: pricing.total.toFixed(2),
            payments: [
              {
                method,
                status: 'PAID',
                amount: pricing.total.toFixed(2),
                amountPaid: pricing.total.toFixed(2),
                reference: `PAY-${number}`,
              },
            ],
            refunds: [],
            notice:
              'This is a TableTap sales receipt, not a Thai e-Tax invoice. Confirm fiscal requirements before legal use.',
          } as Prisma.InputJsonValue,
        },
      });

      // A handful of partial refunds for realistic analytics.
      if (random() < 0.02) {
        await prisma.refund.create({
          data: {
            paymentId: payment.id,
            amount: new Prisma.Decimal(50),
            reason: 'Item not as described',
            authorizedById: input.ownerId,
            reference: `RFD-${number}`,
            createdAt: new Date(paidAt.getTime() + 30 * 60 * 1000),
          },
        });
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PARTIALLY_REFUNDED' } });
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { acceptedById: input.cashierId },
      });
      created += 1;
    }
  }
  return created;
}

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: 'spice-garden' } });
  if (existing) {
    console.log('Demo data already present. Run `pnpm db:reset && pnpm db:seed` for a clean reseed.');
    return;
  }

  console.log('Seeding TableTap demo data...');
  await ensureCatalog();

  const spiceGarden = await createTenant({
    name: 'Spice Garden',
    slug: 'spice-garden',
    email: 'hello@spicegarden.local',
    phone: '021234567',
    address: '88 Sathorn Road, Bangkok',
    planKey: 'GROWTH',
    branches: [
      {
        name: 'Sathorn',
        code: 'SATHORN',
        address: '88 Sathorn Road, Bangkok',
        phone: '021234567',
        vatInclusive: true,
        serviceChargeEnabled: true,
        serviceChargeValue: 10,
        promptPayId: '0812345678',
      },
      {
        name: 'Ari',
        code: 'ARI',
        address: '12 Phahonyothin Soi 7, Bangkok',
        phone: '021234568',
        vatInclusive: true,
        serviceChargeEnabled: false,
        serviceChargeValue: 0,
        promptPayId: '0812345679',
      },
      {
        name: 'Thonglor',
        code: 'THONGLOR',
        address: '55 Sukhumvit Soi 55, Bangkok',
        phone: '021234569',
        vatInclusive: true,
        serviceChargeEnabled: true,
        serviceChargeValue: 10,
        promptPayId: '0812345680',
      },
    ],
  });

  const baanThai = await createTenant({
    name: 'Baan Thai Kitchen',
    slug: 'baan-thai',
    email: 'hello@baanthai.local',
    phone: '029876543',
    address: '99 Bangna-Trad Road, Bangkok',
    planKey: 'STARTER',
    branches: [
      {
        name: 'Bangna',
        code: 'BANGNA',
        address: '99 Bangna-Trad Road, Bangkok',
        phone: '029876543',
        vatInclusive: true,
        serviceChargeEnabled: false,
        serviceChargeValue: 0,
        promptPayId: '0898765432',
      },
    ],
  });

  const platformAdmin = await createUser({
    email: 'platform@tabletap.local',
    name: 'Platform Admin',
    platformAdmin: true,
  });

  const sathorn = spiceGarden.branches[0]!;
  const ari = spiceGarden.branches[1]!;
  const thonglor = spiceGarden.branches[2]!;
  const allSpiceBranches = [sathorn.id, ari.id, thonglor.id];

  const owner = await createUser({
    email: 'owner@spicegarden.local',
    name: 'Somchai Rattanakul',
    memberships: [
      {
        tenantId: spiceGarden.tenant.id,
        roleId: spiceGarden.roleIds.OWNER!,
        branchIds: allSpiceBranches,
        position: 'Owner',
      },
    ],
  });
  const manager = await createUser({
    email: 'manager@spicegarden.local',
    name: 'Niran Chaiyaporn',
    memberships: [
      {
        tenantId: spiceGarden.tenant.id,
        roleId: spiceGarden.roleIds.MANAGER!,
        branchIds: [sathorn.id, ari.id],
        position: 'Operations manager',
      },
    ],
  });
  const cashier = await createUser({
    email: 'cashier@spicegarden.local',
    name: 'Pim Srisuk',
    memberships: [
      {
        tenantId: spiceGarden.tenant.id,
        roleId: spiceGarden.roleIds.CASHIER!,
        branchIds: [sathorn.id],
        position: 'Cashier',
      },
    ],
  });
  const kitchen = await createUser({
    email: 'kitchen@spicegarden.local',
    name: 'Anan Prasert',
    memberships: [
      {
        tenantId: spiceGarden.tenant.id,
        roleId: spiceGarden.roleIds.KITCHEN!,
        branchIds: [sathorn.id],
        position: 'Head chef',
      },
    ],
  });
  const waiter = await createUser({
    email: 'waiter@spicegarden.local',
    name: 'Kanya Wong',
    memberships: [
      {
        tenantId: spiceGarden.tenant.id,
        roleId: spiceGarden.roleIds.WAITER!,
        branchIds: [sathorn.id],
        position: 'Waiter',
      },
    ],
  });
  await createUser({
    email: 'viewer@spicegarden.local',
    name: 'Auditor View',
    memberships: [
      {
        tenantId: spiceGarden.tenant.id,
        roleId: spiceGarden.roleIds.VIEWER!,
        branchIds: allSpiceBranches,
        position: 'Auditor',
      },
    ],
  });
  await createUser({
    email: 'owner@baanthai.local',
    name: 'Suda Kaew',
    memberships: [
      {
        tenantId: baanThai.tenant.id,
        roleId: baanThai.roleIds.OWNER!,
        branchIds: [baanThai.branches[0]!.id],
        position: 'Owner',
      },
    ],
  });

  const menu = await createMenu(spiceGarden.tenant.id);
  await attachStations(
    spiceGarden.tenant.id,
    menu.items.map((item) => ({ id: item.id, station: item.station })),
  );

  const sathornTables = await createTables(spiceGarden.tenant.id, sathorn.id, 'SATHORN', 24);
  const ariTables = await createTables(spiceGarden.tenant.id, ari.id, 'ARI', 16);
  const thonglorTables = await createTables(spiceGarden.tenant.id, thonglor.id, 'THONGLOR', 20);

  const ingredients = await createInventory(spiceGarden.tenant.id, sathorn.id);
  await createRecipes(
    spiceGarden.tenant.id,
    menu.items.map((item) => ({ id: item.id, nameEn: item.nameEn })),
    ingredients,
  );

  // Promotions
  await prisma.promotion.createMany({
    data: [
      {
        tenantId: spiceGarden.tenant.id,
        name: 'Welcome 10%',
        code: 'WELCOME10',
        type: 'PERCENTAGE',
        value: new Prisma.Decimal(10),
        minOrderAmount: new Prisma.Decimal(500),
        maxDiscount: new Prisma.Decimal(150),
        isActive: true,
        startsAt: new Date(Date.now() - 30 * 86400000),
        endsAt: new Date(Date.now() + 60 * 86400000),
      },
      {
        tenantId: spiceGarden.tenant.id,
        name: 'Happy Hour ฿100 off',
        code: 'HAPPY100',
        type: 'FIXED',
        value: new Prisma.Decimal(100),
        minOrderAmount: new Prisma.Decimal(800),
        isActive: true,
      },
      {
        tenantId: spiceGarden.tenant.id,
        name: 'Songkran 15%',
        code: 'SONKRAN15',
        type: 'COUPON',
        value: new Prisma.Decimal(15),
        minOrderAmount: new Prisma.Decimal(1000),
        maxRedemptions: 100,
        redemptionCount: 0,
        isActive: false,
      },
    ],
    skipDuplicates: true,
  });

  // Ongoing tables for the live demo: one open session with an order in the kitchen.
  const liveTable = sathornTables[0]!;
  const liveSession = await prisma.tableSession.create({
    data: {
      tenantId: spiceGarden.tenant.id,
      branchId: sathorn.id,
      tableId: liveTable.id,
      status: 'OPEN',
      guestCount: 2,
      openedAt: new Date(Date.now() - 12 * 60 * 1000),
      openedById: waiter.id,
    },
  });
  await prisma.diningTable.update({ where: { id: liveTable.id }, data: { status: 'ORDERING' } });
  const liveItem = menu.items.find((item) => item.nameEn === 'Pad Thai with Prawns')!;
  const liveItem2 = menu.items.find((item) => item.nameEn === 'Thai Iced Tea')!;
  const livePricing = priceOrder(
    [
      { unitPrice: new Prisma.Decimal(liveItem.price), modifiersPerUnit: new Prisma.Decimal(0), quantity: 1 },
      {
        unitPrice: new Prisma.Decimal(liveItem2.price),
        modifiersPerUnit: new Prisma.Decimal(0),
        quantity: 2,
      },
    ],
    {
      vatRate: sathorn.vatRate,
      vatInclusive: sathorn.vatInclusive,
      serviceChargeType: sathorn.serviceChargeType as 'PERCENT' | 'FIXED',
      serviceChargeValue: sathorn.serviceChargeValue,
    },
  );
  const liveOrder = await prisma.order.create({
    data: {
      tenantId: spiceGarden.tenant.id,
      branchId: sathorn.id,
      tableId: liveTable.id,
      tableSessionId: liveSession.id,
      number: await numbers.next(prisma, {
        tenantId: spiceGarden.tenant.id,
        branchId: sathorn.id,
        branchCode: sathorn.code,
        type: 'ORDER',
        date: new Date(),
      }),
      status: 'PENDING',
      source: 'CUSTOMER_QR',
      subtotal: livePricing.subtotal,
      discountTotal: livePricing.discountTotal,
      serviceCharge: livePricing.serviceCharge,
      taxTotal: livePricing.taxTotal,
      total: livePricing.total,
      currency: 'THB',
      createdAt: new Date(Date.now() - 2 * 60 * 1000),
    },
  });
  for (const [index, item] of [liveItem, liveItem2].entries()) {
    const quantity = index === 0 ? 1 : 2;
    const price = livePricing.lines[index]!;
    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: liveOrder.id,
        menuItemId: item.id,
        nameSnapshot: item.name,
        quantity,
        unitPrice: new Prisma.Decimal(item.price),
        modifiersTotal: new Prisma.Decimal(0),
        lineSubtotal: price.lineSubtotal,
        lineDiscount: price.lineDiscount,
        lineTax: price.lineTax,
        lineTotal: price.lineTotal,
        status: 'PENDING',
        createdAt: liveOrder.createdAt,
      },
    });
    const station = await prisma.menuItemStation.findFirst({
      where: { menuItemId: item.id, station: { branchId: sathorn.id } },
    });
    const fallback = await prisma.kitchenStation.findFirst({
      where: { branchId: sathorn.id, code: item.station },
    });
    const stationId = station?.stationId ?? fallback!.id;
    const ticket = await prisma.kitchenTicket.upsert({
      where: { orderId_stationId: { orderId: liveOrder.id, stationId } },
      create: {
        tenantId: spiceGarden.tenant.id,
        branchId: sathorn.id,
        stationId,
        orderId: liveOrder.id,
        number: `${liveOrder.number}-${item.station}`,
        status: 'PENDING',
        createdAt: liveOrder.createdAt,
      },
      update: {},
    });
    await prisma.kitchenTicketItem.create({
      data: { ticketId: ticket.id, orderItemId: orderItem.id, status: 'PENDING' },
    });
  }
  await prisma.orderEvent.create({
    data: { orderId: liveOrder.id, actorType: 'CUSTOMER', toStatus: 'PENDING' },
  });

  const sathornOrders = await seedSales({
    tenant: spiceGarden.tenant,
    branch: sathorn,
    tables: sathornTables.filter((table) => table.id !== liveTable.id),
    items: menu.items,
    groups: menu.groups,
    ownerId: owner.id,
    cashierId: cashier.id,
    days: 30,
    ordersPerDay: 8,
  });
  const ariOrders = await seedSales({
    tenant: spiceGarden.tenant,
    branch: ari,
    tables: ariTables,
    items: menu.items,
    groups: menu.groups,
    ownerId: owner.id,
    cashierId: manager.id,
    days: 30,
    ordersPerDay: 4,
  });
  const thonglorOrders = await seedSales({
    tenant: spiceGarden.tenant,
    branch: thonglor,
    tables: thonglorTables,
    items: menu.items,
    groups: menu.groups,
    ownerId: owner.id,
    cashierId: cashier.id,
    days: 30,
    ordersPerDay: 5,
  });

  // Closed customer requests for operational analytics.
  const requestTypes = ['CALL_WAITER', 'REQUEST_WATER', 'REQUEST_UTENSILS', 'REQUEST_BILL'] as const;
  for (let index = 0; index < 40; index += 1) {
    const table = pick(sathornTables);
    const session = await prisma.tableSession.findFirst({
      where: { tableId: table.id, status: 'CLOSED' },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) continue;
    const createdAt = new Date(session.openedAt.getTime() + between(5, 40) * 60 * 1000);
    await prisma.tableRequest.create({
      data: {
        tenantId: spiceGarden.tenant.id,
        branchId: sathorn.id,
        tableId: table.id,
        tableSessionId: session.id,
        type: pick([...requestTypes]),
        status: 'RESOLVED',
        createdAt,
        acknowledgedAt: new Date(createdAt.getTime() + between(1, 4) * 60 * 1000),
        resolvedAt: new Date(createdAt.getTime() + between(4, 15) * 60 * 1000),
        resolutionNote: 'Handled by floor staff',
      },
    });
  }

  // Shifts for today.
  for (const user of [cashier, kitchen, waiter]) {
    const shift = await prisma.staffShift.create({
      data: {
        tenantId: spiceGarden.tenant.id,
        branchId: sathorn.id,
        userId: user.id,
        role: 'Floor',
        startsAt: bangkokDate(0, 10, 0),
        endsAt: bangkokDate(0, 22, 0),
      },
    });
    await prisma.staffAttendance.create({
      data: {
        shiftId: shift.id,
        userId: user.id,
        clockInAt: new Date(bangkokDate(0, 10, 0).getTime() + between(0, 12) * 60 * 1000),
      },
    });
  }

  // Audit history.
  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: spiceGarden.tenant.id,
        actorId: owner.id,
        action: 'tenant.created',
        resourceType: 'Tenant',
        resourceId: spiceGarden.tenant.id,
        createdAt: bangkokDate(30, 9, 0),
      },
      {
        tenantId: spiceGarden.tenant.id,
        branchId: sathorn.id,
        actorId: owner.id,
        action: 'branch.created',
        resourceType: 'Branch',
        resourceId: sathorn.id,
        createdAt: bangkokDate(29, 9, 0),
      },
      {
        tenantId: spiceGarden.tenant.id,
        actorId: owner.id,
        action: 'menu.item.created',
        resourceType: 'MenuItem',
        resourceId: menu.items[0]!.id,
        createdAt: bangkokDate(28, 10, 0),
      },
      {
        tenantId: spiceGarden.tenant.id,
        branchId: sathorn.id,
        actorId: cashier.id,
        action: 'payment.confirmed',
        resourceType: 'Payment',
        resourceId: 'seed-payment',
        createdAt: bangkokDate(1, 20, 0),
      },
      {
        tenantId: spiceGarden.tenant.id,
        actorId: owner.id,
        action: 'staff.invited',
        resourceType: 'Invitation',
        resourceId: 'seed-invitation',
        createdAt: bangkokDate(5, 11, 0),
      },
    ],
  });

  // Sample notifications for the inbox.
  await prisma.notification.createMany({
    data: [
      {
        tenantId: spiceGarden.tenant.id,
        branchId: sathorn.id,
        type: 'PAYMENT_AWAITING_CONFIRMATION',
        title: 'Payment awaiting confirmation',
        body: 'A PromptPay transfer needs review',
        createdAt: bangkokDate(0, 12, 15),
      },
      {
        tenantId: spiceGarden.tenant.id,
        branchId: sathorn.id,
        type: 'LOW_STOCK',
        title: 'Low stock: กุ้งสด',
        body: 'Prawns are at or below the minimum level',
        createdAt: bangkokDate(0, 9, 30),
      },
    ],
  });

  console.log('');
  console.log('Demo seed complete.');
  console.log(`  Tenants:           2 (Spice Garden + Baan Thai Kitchen)`);
  console.log(`  Branches:          ${spiceGarden.branches.length + baanThai.branches.length}`);
  console.log(`  Tables:            ${sathornTables.length + ariTables.length + thonglorTables.length}`);
  console.log(`  Menu items:        ${menu.items.length}`);
  console.log(`  Historical orders: ${sathornOrders + ariOrders + thonglorOrders + 1}`);
  console.log('');
  console.log('Demo logins (password for all):', DEMO_PASSWORD);
  console.log('  platform@tabletap.local   platform admin');
  console.log('  owner@spicegarden.local   owner (all branches)');
  console.log('  manager@spicegarden.local manager (Sathorn, Ari)');
  console.log('  cashier@spicegarden.local cashier (Sathorn)');
  console.log('  kitchen@spicegarden.local kitchen (Sathorn)');
  console.log('  waiter@spicegarden.local  waiter (Sathorn)');
  console.log('  viewer@spicegarden.local  read-only');
  console.log('  owner@baanthai.local      second tenant owner');
  console.log('');
  console.log('Demo QR links (deterministic, development only):');
  console.log(`  http://localhost:3100/menu/demo-sathorn-t01-4f8c2a91`);
  console.log(`  http://localhost:3100/menu/demo-ari-t01-4f8c2a91`);
  console.log(`  http://localhost:3100/menu/demo-thonglor-t01-4f8c2a91`);
  console.log('');
  console.log(`Platform admin id: ${platformAdmin.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
