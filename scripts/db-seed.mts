import { eq } from "drizzle-orm";
import { db, pg } from "../src/db/client";
import {
  businesses,
  channels,
  customers,
  knowledgeDocuments,
  products,
} from "../src/db/schema";

// One demo business for local work. Safe to re-run: it replaces itself.
// Data is Bangladesh-style on purpose (BDT, bKash/Nagad, ভাই/আপু, Banglish)
// so the AI is tested against what real customers will ask.

const TEST_BUSINESS_SLUG = "demo-shop";

await db.transaction(async (tx) => {
  // Cascades through every table that carries this business_id.
  await tx.delete(businesses).where(eq(businesses.slug, TEST_BUSINESS_SLUG));

  const [business] = await tx
    .insert(businesses)
    .values({
      slug: TEST_BUSINESS_SLUG,
      name: "Alora Demo Shop",
      description:
        "ঢাকা-ভিত্তিক অনলাইন ফ্যাশন শপ। T-shirt, polo, jeans ও hoodie বিক্রি করে। Facebook ও Instagram এ অর্ডার নেয়।",
      toneNotes:
        "Friendly ও polite। কাস্টমারকে 'ভাই' বা 'আপু' বলে সম্বোধন করবে (জানা না থাকলে 'আপনি')। Reply ছোট রাখবে, মাঝে মাঝে একটা emoji (😊)। কাস্টমার যে script এ লেখে (বাংলা, Banglish বা English) সেই script এ reply দেবে।",
    })
    .returning();

  const [channel] = await tx
    .insert(channels)
    .values({
      businessId: business.id,
      type: "playground",
      name: "Local playground",
      externalId: "demo-shop-playground",
    })
    .returning();

  await tx.insert(customers).values({
    businessId: business.id,
    channelId: channel.id,
    externalId: "local-tester",
    name: "Local Tester",
  });

  await tx.insert(products).values([
    {
      businessId: business.id,
      sku: "TS-BLK-001",
      name: "Black T-shirt",
      description: "100% cotton, regular fit, গোল গলা।",
      price: "1300.00",
      stockQuantity: 12,
      attributes: { color: "Black", sizes: { M: 5, L: 4, XL: 3 } },
    },
    {
      businessId: business.id,
      sku: "TS-WHT-001",
      name: "White T-shirt",
      description: "100% cotton, regular fit, গোল গলা।",
      price: "1250.00",
      stockQuantity: 5,
      // L is sold out on purpose: tests per-size honesty.
      attributes: { color: "White", sizes: { M: 3, L: 0, XL: 2 } },
    },
    {
      businessId: business.id,
      sku: "PL-RED-001",
      name: "Red Polo Shirt",
      description: "Pique cotton polo, collar সহ।",
      price: "1650.00",
      stockQuantity: 4,
      attributes: { color: "Red", sizes: { M: 2, L: 2 } },
    },
    {
      businessId: business.id,
      sku: "HD-NVY-001",
      name: "Navy Hoodie",
      description: "Fleece hoodie, শীতের জন্য।",
      price: "2400.00",
      // Fully out of stock: the AI must never invent availability.
      stockQuantity: 0,
      attributes: { color: "Navy", sizes: { M: 0, L: 0, XL: 0 } },
    },
    {
      businessId: business.id,
      sku: "JN-DNM-001",
      name: "Denim Jeans",
      description: "Slim fit stretch denim।",
      price: "2100.00",
      stockQuantity: 10,
      attributes: { color: "Blue", sizes: { "30": 3, "32": 5, "34": 2 } },
    },
  ]);

  await tx.insert(knowledgeDocuments).values([
    {
      businessId: business.id,
      kind: "delivery",
      title: "Delivery",
      content:
        "ঢাকার ভিতরে delivery charge ৬০ টাকা, ২-৩ কর্মদিবসে পৌঁছায়। ঢাকার বাইরে ১২০ টাকা, ৩-৫ কর্মদিবস। ৩,০০০ টাকার বেশি অর্ডারে ঢাকার ভিতরে delivery free। Courier: Pathao ও Steadfast।",
    },
    {
      businessId: business.id,
      kind: "payment",
      title: "Payment",
      content:
        "Cash on Delivery (COD) আছে। bKash ও Nagad এ advance দেওয়া যায়। bKash/Nagad (personal): 01XXXXXXXXX। ঢাকার বাইরের অর্ডারে delivery charge advance নেওয়া হয়।",
    },
    {
      businessId: business.id,
      kind: "policy",
      title: "Return and exchange",
      content:
        "Product হাতে পাওয়ার ৭ দিনের মধ্যে exchange করা যাবে, যদি ব্যবহার না করা হয় ও tag লাগানো থাকে। Product এ সমস্যা থাকলে return delivery charge আমরা দিই; পছন্দ না হওয়ার কারণে exchange করলে charge কাস্টমারের। Refund ৩-৫ কর্মদিবসে bKash এ দেওয়া হয়।",
    },
    {
      businessId: business.id,
      kind: "faq",
      title: "Size guide",
      content:
        "T-shirt এর বুকের মাপ (ইঞ্চি): M = ৩৮, L = ৪০, XL = ৪২। দুই size এর মাঝামাঝি হলে বড় size নিতে বলা হয়, কারণ cotton সামান্য কুঁচকে যায়।",
    },
    {
      businessId: business.id,
      kind: "about",
      title: "Business hours",
      content:
        "শনিবার থেকে বৃহস্পতিবার সকাল ১০টা থেকে রাত ১০টা। শুক্রবার বিকাল ৩টা থেকে রাত ১০টা। Hotline: 01XXXXXXXXX।",
    },
  ]);
});

await pg.close();
console.log(`Seeded business "${TEST_BUSINESS_SLUG}" with 5 products and 5 knowledge documents.`);
