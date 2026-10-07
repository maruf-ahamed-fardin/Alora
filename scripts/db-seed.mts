import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  deliveryZones,
  knowledgeDocuments,
  messages,
  orders,
  products,
  toneExamples,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/server/auth";

// Two businesses for multi-business local testing. Safe to re-run: replaces itself.
// 1. Alora Demo Shop (demo-shop, admin@alora.ai / password123)
// 2. Artisan Leather (artisan-leather, artisan@example.com / password123)

const TEST_BUSINESS_SLUG = "demo-shop";
const SECOND_BUSINESS_SLUG = "artisan-leather";

const db = getDb();

await db.transaction(async (tx) => {
  // Cascades through every table that carries these business_ids.
  await tx.delete(businesses).where(inArray(businesses.slug, [TEST_BUSINESS_SLUG, SECOND_BUSINESS_SLUG]));

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

  const defaultPasswordHash = await hashPassword("password123");

  await tx.insert(users).values({
    businessId: business.id,
    email: "admin@alora.ai",
    passwordHash: defaultPasswordHash,
    name: "Alora Demo Admin",
    role: "owner",
  });

  const [channel, waChannel, tgChannel, fbChannel] = await tx
    .insert(channels)
    .values([
      {
        businessId: business.id,
        type: "playground",
        name: "Local playground",
        externalId: "demo-shop-playground",
      },
      {
        businessId: business.id,
        type: "whatsapp",
        name: "WhatsApp Official",
        externalId: "demo-shop-wa",
      },
      {
        businessId: business.id,
        type: "telegram",
        name: "Telegram Bot",
        externalId: "demo-shop-tg",
      },
      {
        businessId: business.id,
        type: "messenger",
        name: "Facebook Messenger",
        externalId: "demo-shop-fb",
      },
    ])
    .returning();

  const [tester, stranger, waCust, tgCust, fbCust] = await tx
    .insert(customers)
    .values([
      {
        businessId: business.id,
        channelId: channel.id,
        externalId: "local-tester",
        name: "Local Tester",
      },
      // Owns an order the tester must never be shown (see ORD-2001 below).
      {
        businessId: business.id,
        channelId: channel.id,
        externalId: "other-customer",
        name: "Other Customer",
      },
      {
        businessId: business.id,
        channelId: waChannel.id,
        externalId: "wa-8801711002233",
        name: "Nusrat Jahan",
        phone: "01711002233",
      },
      {
        businessId: business.id,
        channelId: tgChannel.id,
        externalId: "tg-998877",
        name: "Tanvir Rahman",
        phone: "01811223344",
      },
      {
        businessId: business.id,
        channelId: fbChannel.id,
        externalId: "fb-55443322",
        name: "Sadik Hasan",
        phone: "01911223344",
      },
    ])
    .returning();

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

  // Same numbers as the "Delivery" document below; the AI reads these through
  // the get_delivery_charge tool, so keep the two in step.
  await tx.insert(deliveryZones).values([
    {
      businessId: business.id,
      name: "Inside Dhaka",
      keywords: ["dhaka", "ঢাকা", "dhanmondi", "gulshan", "mirpur", "uttara", "banani", "mohammadpur"],
      charge: "60.00",
      minDays: 2,
      maxDays: 3,
      freeAbove: "3000.00",
    },
    {
      businessId: business.id,
      name: "Outside Dhaka",
      isDefault: true,
      charge: "120.00",
      minDays: 3,
      maxDays: 5,
    },
  ]);

  await tx.insert(orders).values([
    {
      businessId: business.id,
      orderNumber: "ORD-1001",
      customerId: tester.id,
      status: "shipped",
      items: [
        { name: "Black T-shirt", sku: "TS-BLK-001", size: "L", quantity: 2, unitPrice: 1300 },
      ],
      subtotal: "2600.00",
      deliveryCharge: "60.00",
      total: "2660.00",
      shippingAddress: "House 12, Road 5, Dhanmondi, Dhaka",
      courier: "Pathao",
      trackingCode: "PT-884213",
      placedAt: new Date("2026-10-01T10:30:00+06:00"),
    },
    {
      businessId: business.id,
      orderNumber: "ORD-1002",
      customerId: tester.id,
      status: "pending",
      items: [{ name: "Denim Jeans", sku: "JN-DNM-001", size: "32", quantity: 1, unitPrice: 2100 }],
      subtotal: "2100.00",
      deliveryCharge: "120.00",
      total: "2220.00",
      shippingAddress: "Zindabazar, Sylhet",
      placedAt: new Date("2026-10-03T16:05:00+06:00"),
    },
    {
      businessId: business.id,
      orderNumber: "ORD-2001",
      customerId: stranger.id,
      status: "confirmed",
      items: [{ name: "Red Polo Shirt", sku: "PL-RED-001", size: "M", quantity: 1, unitPrice: 1650 }],
      subtotal: "1650.00",
      deliveryCharge: "60.00",
      total: "1710.00",
      shippingAddress: "Mirpur 10, Dhaka",
      placedAt: new Date("2026-10-02T12:00:00+06:00"),
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

  // How this shop's team actually talks. Embeddings are filled in by kb:index.
  await tx.insert(toneExamples).values(
    [
      ["hi", "Hello 😊 bolen, kibhabe help korte pari?"],
      ["ভাই অর্ডার করতে চাই", "জি, অবশ্যই 😊 কোন product আর কোন size লাগবে একটু বলবেন?"],
      ["thanks", "Welcome 😊 aro kichu lagle janaben."],
      ["delivery koto din lagbe?", "Dhakar moddhe 2-3 din, baire 3-5 din lage 😊"],
      ["price ta ektu kom hobe?", "Sorry, price fixed 🙏 tobe 3000 takar upore order korle Dhaka te delivery free."],
      ["আমার পণ্য এখনো পাই নি", "দুঃখিত 🙏 আপনার order নাম্বারটা একটু দেবেন? আমি এখনই দেখছি।"],
      ["ami exchange korte chai", "Thik ache 😊 product ta ki use kora hoyeche? Tag lagano thakle exchange kora jabe."],
      ["bkash number ta den", "Ei number e pathan 😊 01XXXXXXXXX (personal). Pathaye TrxID ta janaben."],
    ].map(([customerMessage, reply]) => ({
      businessId: business.id,
      customerMessage,
      reply,
    })),
  );

  // Seed sample conversations for the Unified Inbox
  const [convPlayground, convWa, convTg, convFb] = await tx
    .insert(conversations)
    .values([
      {
        businessId: business.id,
        customerId: tester.id,
        channelId: channel.id,
        status: "open",
        aiEnabled: true,
        lastMessageAt: new Date(Date.now() - 5 * 60 * 1000),
      },
      {
        businessId: business.id,
        customerId: waCust.id,
        channelId: waChannel.id,
        status: "open",
        aiEnabled: true,
        lastMessageAt: new Date(Date.now() - 15 * 60 * 1000),
      },
      {
        businessId: business.id,
        customerId: tgCust.id,
        channelId: tgChannel.id,
        status: "handoff",
        aiEnabled: false,
        lastMessageAt: new Date(Date.now() - 25 * 60 * 1000),
      },
      {
        businessId: business.id,
        customerId: fbCust.id,
        channelId: fbChannel.id,
        status: "open",
        aiEnabled: true,
        lastMessageAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    ])
    .returning();

  await tx.insert(messages).values([
    // Playground thread
    {
      businessId: business.id,
      conversationId: convPlayground.id,
      sender: "customer",
      content: "white tshirt L size ache?",
      createdAt: new Date(Date.now() - 6 * 60 * 1000),
    },
    {
      businessId: business.id,
      conversationId: convPlayground.id,
      sender: "ai",
      content: "দুঃখিত ভাইয়া, White T-shirt এর L সাইজ এখন স্টক আউট আছে 🙏 তবে M আর XL সাইজ এভেইলেবল আছে।\n---\nকোন সাইজটা দেখতে চাচ্ছেন?",
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    },
    // WhatsApp thread
    {
      businessId: business.id,
      conversationId: convWa.id,
      sender: "customer",
      content: "Assalamu Alaikum, black tshirt er price koto?",
      createdAt: new Date(Date.now() - 18 * 60 * 1000),
    },
    {
      businessId: business.id,
      conversationId: convWa.id,
      sender: "ai",
      content: "ওয়ালাইকুম আসসালাম আপু 😊 ব্ল্যাক টি শার্টের প্রাইস ১৩০০ টাকা। ১০০% কটন, রেগুলার ফিট।",
      createdAt: new Date(Date.now() - 17 * 60 * 1000),
    },
    {
      businessId: business.id,
      conversationId: convWa.id,
      sender: "customer",
      content: "Delivery charge koto lagbe Dhaka te?",
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
    },
    // Telegram thread (Handoff)
    {
      businessId: business.id,
      conversationId: convTg.id,
      sender: "customer",
      content: "amar order ORD-1001 er tracking number ta den",
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    },
    {
      businessId: business.id,
      conversationId: convTg.id,
      sender: "ai",
      content: "আপনার ORD-1001 অর্ডারটি Pathao কুরিয়ারে shipped হয়েছে, ট্র্যাকিং কোড PT-884213 😊",
      createdAt: new Date(Date.now() - 28 * 60 * 1000),
    },
    {
      businessId: business.id,
      conversationId: convTg.id,
      sender: "customer",
      content: "ami product ta exchange korte chai, agent er sathe kotha bolbo",
      createdAt: new Date(Date.now() - 26 * 60 * 1000),
    },
    {
      businessId: business.id,
      conversationId: convTg.id,
      sender: "system",
      content: "Customer requested human assistance. AI assistant paused.",
      createdAt: new Date(Date.now() - 25 * 60 * 1000),
    },
    // Messenger thread
    {
      businessId: business.id,
      conversationId: convFb.id,
      sender: "customer",
      content: "Sylhet e delivery koto din lagbe?",
      createdAt: new Date(Date.now() - 62 * 60 * 1000),
    },
    {
      businessId: business.id,
      conversationId: convFb.id,
      sender: "ai",
      content: "ঢাকার বাইরে ৩-৫ কর্মদিবস সময় লাগে ভাইয়া, আর ডেলিভারি চার্জ ১২০ টাকা 😊",
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  ]);

  // Seed Second Business: Artisan Leather (Proves Multi-Business Tenant Isolation)
  const [artisanBiz] = await tx
    .insert(businesses)
    .values({
      slug: SECOND_BUSINESS_SLUG,
      name: "Artisan Leather BD",
      description: "Handcrafted pure full-grain leather wallets and bags made in Bangladesh.",
      toneNotes: "Gentle, premium, courteous tone. Answers in Bengali/English. Emphasizes leather durability.",
    })
    .returning();

  await tx.insert(users).values({
    businessId: artisanBiz.id,
    email: "artisan@example.com",
    passwordHash: defaultPasswordHash,
    name: "Karim Ahmed",
    role: "owner",
  });

  const [artisanPlayground, artisanWa] = await tx
    .insert(channels)
    .values([
      {
        businessId: artisanBiz.id,
        type: "playground",
        name: "Artisan Playground",
        externalId: "artisan-playground",
      },
      {
        businessId: artisanBiz.id,
        type: "whatsapp",
        name: "Artisan WhatsApp Official",
        externalId: "artisan-wa",
      },
    ])
    .returning();

  await tx.insert(products).values([
    {
      businessId: artisanBiz.id,
      sku: "AL-W01",
      name: "Classic Bifold Leather Wallet",
      description: "100% full-grain cowhide leather with 8 card slots and currency compartment.",
      price: "1250.00",
      currency: "BDT",
      stockQuantity: 25,
      attributes: { material: "Full-Grain Leather", color: ["Vintage Brown", "Black"] },
    },
    {
      businessId: artisanBiz.id,
      sku: "AL-B01",
      name: "Executive Leather Messenger Bag",
      description: "Fits up to 15.6 inch laptops. Antique brass hardware and padded strap.",
      price: "5500.00",
      currency: "BDT",
      stockQuantity: 8,
      attributes: { material: "Top-Grain Leather", color: ["Cognac Tan"] },
    },
  ]);

  await tx.insert(deliveryZones).values([
    {
      businessId: artisanBiz.id,
      name: "Inside Dhaka (Artisan Express)",
      keywords: ["dhaka", "ঢাকা", "banani", "gulshan", "dhanmondi"],
      isDefault: false,
      charge: "80.00",
      minDays: 1,
      maxDays: 2,
      freeAbove: "3000.00",
    },
    {
      businessId: artisanBiz.id,
      name: "All Bangladesh (Outside Dhaka)",
      keywords: [],
      isDefault: true,
      charge: "150.00",
      minDays: 2,
      maxDays: 4,
      freeAbove: "5000.00",
    },
  ]);

  await tx.insert(knowledgeDocuments).values({
    businessId: artisanBiz.id,
    kind: "policy",
    title: "Warranty and Leather Care",
    content: "All Artisan Leather goods carry a 2-year replacement warranty on stitching and zippers. Keep away from water and direct prolonged moisture.",
  });

  const [artisanCust] = await tx
    .insert(customers)
    .values({
      businessId: artisanBiz.id,
      channelId: artisanWa.id,
      externalId: "artisan-cust-1",
      name: "Zubair Hossain",
      phone: "+8801811223344",
      notes: "VIP customer interested in custom leather stamping",
    })
    .returning();

  const [artisanConv] = await tx
    .insert(conversations)
    .values({
      businessId: artisanBiz.id,
      customerId: artisanCust.id,
      channelId: artisanWa.id,
      status: "open",
      aiEnabled: true,
      lastMessageAt: new Date(Date.now() - 10 * 60 * 1000),
    })
    .returning();

  await tx.insert(messages).values([
    {
      businessId: artisanBiz.id,
      conversationId: artisanConv.id,
      sender: "customer",
      content: "Vai classic bifold wallet er warranty ache?",
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    },
    {
      businessId: artisanBiz.id,
      conversationId: artisanConv.id,
      sender: "ai",
      content: "জি ভাইয়া, আমাদের সব লেদার ওয়ালেটে ২ বছরের স্টিচিং ও জিপার ওয়ারেন্টি পাবেন 😊",
      createdAt: new Date(Date.now() - 9 * 60 * 1000),
    },
  ]);
});

await closeDb();
console.log(`Seeded 2 businesses: "${TEST_BUSINESS_SLUG}" (admin@alora.ai) and "${SECOND_BUSINESS_SLUG}" (artisan@example.com).`);
