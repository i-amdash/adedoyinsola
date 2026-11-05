// The project builder: the catalogue of things a visitor can configure, and the one
// estimate function shared by the browser (live price) and the server (stored quote).
// Prices are in naira. The admin studio edits a copy of this catalogue in the content
// document; this file is the starting point and the fallback.

const opt = (id, label, price = 0, extra = {}) => ({ id, label, price, ...extra });

/** Questions every project gets after its own ones. */
const finishing = [
  {
    id: "design",
    title: "Look & content",
    questions: [
      {
        id: "brand",
        label: "Do you have a logo and brand colours?",
        type: "single",
        options: [
          opt("ready", "Yes, I have a brand", 0),
          opt("refresh", "I have a logo, but it needs a refresh", 120000, { weeks: 0.5 }),
          opt("new", "No, I need a brand identity (logo, colours, fonts)", 250000, { weeks: 1 }),
        ],
      },
      {
        id: "copy",
        label: "Who will write the words and gather photos?",
        type: "single",
        options: [
          opt("mine", "I'll provide all text and photos", 0),
          opt("help", "Help me polish what I have", 80000),
          opt("full", "Write it for me and source images", 200000, { weeks: 0.5 }),
        ],
      },
    ],
  },
  {
    id: "launch",
    title: "Launch & support",
    questions: [
      {
        id: "hosting",
        label: "Hosting and domain",
        type: "single",
        options: [
          opt("managed", "Set it up and manage it for me", 50000, { monthly: 15000 }),
          opt("own", "I'll use my own hosting / I already have it", 0),
        ],
      },
      {
        id: "support",
        label: "Ongoing care after launch",
        help: "Updates, security fixes, small changes and a monthly check-in.",
        type: "single",
        options: [
          opt("none", "Not for now", 0),
          opt("essential", "Essential care", 0, { monthly: 50000 }),
          opt("growth", "Growth plan (more hours, priority fixes)", 0, { monthly: 150000 }),
        ],
      },
      {
        id: "speed",
        label: "How soon do you need it?",
        type: "single",
        options: [
          opt("standard", "Standard timeline", 0),
          opt("priority", "Priority (about 25% faster)", 0, { multiplier: 1.25, speed: 0.75 }),
        ],
      },
    ],
  },
];

export const defaultBuilder = {
  usdRate: 1550,
  spread: 0.12,
  products: [
    {
      id: "website",
      kind: "web",
      name: "Business website",
      tagline: "An informative site that earns trust and brings enquiries.",
      base: 350000,
      weeks: [2, 3],
      includes: ["Up to 5 pages", "Works beautifully on phones", "Contact form", "Basic SEO setup"],
      enabled: true,
      steps: [
        {
          id: "site",
          title: "Your website",
          questions: [
            { id: "pages", label: "How many pages?", help: "Home, About, Services, Contact… 5 are included.", type: "count", min: 1, max: 40, included: 5, unitPrice: 35000, unitWeeks: 0.2, unit: "page" },
            {
              id: "look",
              label: "How custom should the design be?",
              type: "single",
              options: [
                opt("template", "Clean, proven layout", 0),
                opt("custom", "Custom design made for your brand", 250000, { weeks: 1 }),
                opt("premium", "Premium experience with animation", 600000, { weeks: 2 }),
              ],
            },
            {
              id: "features",
              label: "What should it do?",
              type: "multi",
              options: [
                opt("cms", "Edit content yourself (CMS)", 180000, { weeks: 1 }),
                opt("blog", "Blog or news", 120000, { weeks: 0.5 }),
                opt("booking", "Bookings & appointments", 200000, { weeks: 1 }),
                opt("gallery", "Photo & video gallery", 60000),
                opt("events", "Events & ticket listings", 180000, { weeks: 0.5 }),
                opt("lang", "More than one language", 150000, { weeks: 0.5 }),
                opt("newsletter", "Newsletter sign-up", 40000),
                opt("whatsapp", "WhatsApp chat button", 15000),
                opt("assistant", "Live chat or AI assistant", 250000, { weeks: 1 }),
              ],
            },
          ],
        },
      ],
    },
    {
      id: "store",
      kind: "web",
      name: "Online store",
      tagline: "Sell products online with payments and delivery built in.",
      base: 900000,
      weeks: [4, 6],
      includes: ["Product catalogue", "Cart & checkout", "Order emails", "Store dashboard"],
      enabled: true,
      steps: [
        {
          id: "catalogue",
          title: "Your store",
          questions: [
            {
              id: "size",
              label: "How many products will you sell?",
              type: "single",
              options: [opt("small", "Up to 50", 0), opt("medium", "Up to 500", 150000, { weeks: 0.5 }), opt("large", "Thousands, with bulk import", 400000, { weeks: 1 })],
            },
            {
              id: "payments",
              label: "How will customers pay?",
              type: "multi",
              options: [
                opt("paystack", "Paystack", 60000),
                opt("flutterwave", "Flutterwave", 60000),
                opt("stripe", "International cards (Stripe)", 90000),
                opt("transfer", "Bank transfer with confirmation", 40000),
                opt("cod", "Pay on delivery", 30000),
              ],
            },
          ],
        },
        {
          id: "shopping",
          title: "Shopping features",
          questions: [
            {
              id: "features",
              label: "Pick the features you want",
              type: "multi",
              options: [
                opt("accounts", "Customer accounts & order history", 150000, { weeks: 0.5 }),
                opt("shipping", "Delivery zones & shipping rates", 140000, { weeks: 0.5 }),
                opt("inventory", "Stock tracking & low-stock alerts", 160000, { weeks: 0.5 }),
                opt("promo", "Discount codes & sales", 100000),
                opt("reviews", "Ratings & reviews", 90000),
                opt("wishlist", "Wishlist", 50000),
                opt("abandoned", "Abandoned-cart reminders", 120000),
                opt("vendors", "Multi-vendor marketplace", 1200000, { weeks: 3 }),
              ],
            },
            {
              id: "app",
              label: "Do you also want a shopping app?",
              type: "single",
              options: [opt("none", "Not now", 0), opt("app", "Yes, Android & iOS app", 2500000, { weeks: 5 })],
            },
          ],
        },
      ],
    },
    {
      id: "platform",
      kind: "web",
      name: "Custom web platform",
      tagline: "Portals, dashboards, bookings, marketplaces and SaaS.",
      base: 1500000,
      weeks: [6, 10],
      includes: ["Sign-up & login", "Admin panel", "Responsive on every device", "Secure database"],
      enabled: true,
      steps: [
        {
          id: "platform",
          title: "Your platform",
          questions: [
            {
              id: "type",
              label: "What are you building?",
              type: "single",
              options: [
                opt("booking", "Booking & reservations", 0),
                opt("dashboard", "Dashboard or internal tool", 0),
                opt("portal", "Customer or staff portal", 200000),
                opt("lms", "Learning platform (courses)", 600000, { weeks: 2 }),
                opt("marketplace", "Marketplace", 900000, { weeks: 2 }),
                opt("saas", "SaaS product with subscriptions", 1000000, { weeks: 3 }),
              ],
            },
            { id: "roles", label: "How many types of user?", help: "e.g. customers, staff and admins = 3. Two are included.", type: "count", min: 1, max: 10, included: 2, unitPrice: 120000, unitWeeks: 0.5, unit: "user type" },
          ],
        },
        {
          id: "capabilities",
          title: "Capabilities",
          questions: [
            {
              id: "features",
              label: "What should it do?",
              type: "multi",
              options: [
                opt("payments", "Online payments", 250000, { weeks: 1 }),
                opt("subscriptions", "Subscriptions & billing", 400000, { weeks: 1.5 }),
                opt("notify", "Email & SMS notifications", 150000, { weeks: 0.5 }),
                opt("reports", "Reports & exports", 200000, { weeks: 1 }),
                opt("chat", "Real-time chat", 350000, { weeks: 1.5 }),
                opt("integrations", "Connect other tools (APIs)", 250000, { weeks: 1 }),
                opt("ai", "AI features", 600000, { weeks: 2 }),
                opt("branches", "Multiple branches or companies", 500000, { weeks: 1.5 }),
                opt("audit", "Activity logs", 120000),
              ],
            },
          ],
        },
      ],
    },
    {
      id: "mobile",
      kind: "mobile",
      name: "Mobile app",
      tagline: "Apps for customers, staff, riders and your in-store team.",
      base: 2000000,
      weeks: [8, 12],
      includes: ["Customer app", "Sign-up & login", "Secure backend & database", "Built with Flutter"],
      enabled: true,
      steps: [
        {
          id: "app",
          title: "Your app",
          questions: [
            {
              id: "type",
              label: "What kind of app?",
              type: "single",
              options: [
                opt("restaurant", "Restaurant & food ordering", 0),
                opt("shop", "Online shopping", 0),
                opt("booking", "Bookings & services", 0),
                opt("delivery", "Delivery & logistics", 300000, { weeks: 1 }),
                opt("fintech", "Wallet & payments", 1500000, { weeks: 3 }),
                opt("social", "Community or social", 800000, { weeks: 2 }),
                opt("custom", "Something else", 0),
              ],
            },
            {
              id: "platforms",
              label: "Which phones?",
              type: "single",
              options: [opt("both", "Android & iPhone", 600000, { weeks: 1 }), opt("android", "Android only", 0), opt("ios", "iPhone only", 0)],
            },
          ],
        },
        {
          id: "system",
          title: "The full system",
          questions: [
            {
              id: "pieces",
              label: "What else is part of your business?",
              help: "Each piece connects to the same backend, so orders flow between them.",
              type: "multi",
              options: [
                opt("admin", "Admin web dashboard", 900000, { weeks: 2 }),
                opt("pos", "POS for in-store sales", 1400000, { weeks: 3 }),
                opt("rider", "Rider / driver app", 1600000, { weeks: 3 }),
                opt("vendor", "Vendor or merchant app", 1400000, { weeks: 3 }),
                opt("kitchen", "Kitchen display screen", 500000, { weeks: 1 }),
              ],
            },
          ],
        },
        {
          id: "features",
          title: "App features",
          questions: [
            {
              id: "features",
              label: "Pick the features you want",
              type: "multi",
              options: [
                opt("payments", "In-app payments", 250000, { weeks: 1 }),
                opt("push", "Push notifications", 120000, { weeks: 0.5 }),
                opt("tracking", "Maps & live order tracking", 450000, { weeks: 1.5 }),
                opt("chat", "In-app chat", 350000, { weeks: 1 }),
                opt("loyalty", "Loyalty points & rewards", 300000, { weeks: 1 }),
                opt("qr", "QR scan-to-pay", 250000, { weeks: 1 }),
                opt("wallet", "Wallet & top-ups", 500000, { weeks: 1.5 }),
                opt("reviews", "Ratings & reviews", 100000),
                opt("offline", "Works offline", 300000, { weeks: 1 }),
              ],
            },
            {
              id: "stores",
              label: "Publishing to the app stores",
              type: "single",
              options: [opt("publish", "Publish it for me", 80000), opt("self", "I'll handle publishing", 0)],
            },
          ],
        },
      ],
    },
  ],
  finishing,
};

/** Sensible starting answers so the preview and price are meaningful from the first click. */
export const suggested = {
  "mobile:type=restaurant": { pieces: ["admin", "pos", "rider", "kitchen"], features: ["payments", "push", "tracking", "loyalty"] },
  "mobile:type=delivery": { pieces: ["admin", "rider", "vendor"], features: ["payments", "push", "tracking"] },
  "mobile:type=shop": { pieces: ["admin"], features: ["payments", "push", "reviews"] },
  "mobile:type=fintech": { pieces: ["admin"], features: ["wallet", "qr", "push"] },
};

export function stepsFor(catalog, productId) {
  const product = catalog.products.find((p) => p.id === productId);
  if (!product) return [];
  return [...product.steps, ...(catalog.finishing || [])];
}
export function questionsFor(catalog, productId) {
  return stepsFor(catalog, productId).flatMap((s) => s.questions);
}
const live = (options = []) => options.filter((o) => o.enabled !== false);

/** Default answers for a product: first option for singles, included count for counts. */
export function defaultAnswers(catalog, productId) {
  const answers = {};
  for (const q of questionsFor(catalog, productId)) {
    if (q.type === "single") answers[q.id] = live(q.options)[0]?.id;
    else if (q.type === "multi") answers[q.id] = [];
    else answers[q.id] = Math.max(q.min ?? 1, Math.min(q.max ?? 99, q.included ?? 1));
  }
  return answers;
}

/** Drop anything that isn't in the catalogue (old drafts, tampered requests). */
export function cleanAnswers(catalog, productId, raw) {
  const answers = defaultAnswers(catalog, productId);
  const input = raw && typeof raw === "object" ? raw : {};
  for (const q of questionsFor(catalog, productId)) {
    const v = input[q.id];
    const ids = new Set(live(q.options).map((o) => o.id));
    if (q.type === "single" && typeof v === "string" && ids.has(v)) answers[q.id] = v;
    if (q.type === "multi" && Array.isArray(v)) answers[q.id] = [...new Set(v.filter((x) => typeof x === "string" && ids.has(x)))];
    if (q.type === "count" && Number.isFinite(v)) answers[q.id] = Math.round(Math.max(q.min ?? 1, Math.min(q.max ?? 99, v)));
  }
  return answers;
}

const roundTo = (n, step) => Math.round(n / step) * step;

/**
 * Price, timeline and line items for a configured project. Amounts are naira; the
 * range is ±spread around the point estimate, rounded to tidy numbers.
 */
export function estimate(catalog, productId, rawAnswers) {
  const product = catalog.products.find((p) => p.id === productId);
  if (!product) return null;
  const answers = cleanAnswers(catalog, productId, rawAnswers);
  const lines = [{ label: `${product.name} (base)`, amount: product.base }];
  let total = product.base,
    weeks = 0,
    monthly = 0,
    multiplier = 1,
    speed = 1;
  for (const q of questionsFor(catalog, productId)) {
    if (q.type === "count") {
      const extra = Math.max(0, answers[q.id] - (q.included ?? 0));
      if (extra) {
        const amount = extra * (q.unitPrice || 0);
        total += amount;
        weeks += extra * (q.unitWeeks || 0);
        lines.push({ label: `${extra} extra ${q.unit || "item"}${extra === 1 ? "" : "s"}`, amount });
      }
      continue;
    }
    const chosen = q.type === "single" ? [answers[q.id]] : answers[q.id];
    for (const id of chosen) {
      const o = live(q.options).find((x) => x.id === id);
      if (!o) continue;
      total += o.price || 0;
      weeks += o.weeks || 0;
      monthly += o.monthly || 0;
      if (o.multiplier) multiplier *= o.multiplier;
      if (o.speed) speed *= o.speed;
      if (o.price) lines.push({ label: o.label, amount: o.price });
    }
  }
  if (multiplier !== 1) {
    const amount = total * (multiplier - 1);
    lines.push({ label: "Priority delivery", amount: Math.round(amount) });
    total += amount;
  }
  const spread = Math.min(0.5, Math.max(0, catalog.spread ?? 0.12));
  const step = total >= 2000000 ? 50000 : 10000;
  const minWeeks = Math.max(1, Math.round((product.weeks[0] + weeks) * speed));
  const maxWeeks = Math.max(minWeeks, Math.round((product.weeks[1] + weeks) * speed));
  return {
    product: product.id,
    total: roundTo(total, step),
    low: roundTo(total * (1 - spread), step),
    high: roundTo(total * (1 + spread), step),
    weeks: [minWeeks, maxWeeks],
    monthly,
    lines,
    answers,
  };
}

export function formatMoney(naira, currency = "NGN", usdRate = 1550) {
  if (currency === "USD") {
    const usd = naira / (usdRate || 1550);
    return "$" + (usd >= 10000 ? Math.round(usd / 100) * 100 : Math.round(usd / 10) * 10).toLocaleString("en-US");
  }
  if (naira >= 1000000) {
    const m = (naira / 1000000).toFixed(naira >= 10000000 ? 1 : 2);
    return `₦${m.includes(".") ? m.replace(/\.?0+$/, "") : m}M`;
  }
  if (naira >= 1000) return `₦${Math.round(naira / 1000)}k`;
  return `₦${naira}`;
}

/** Readable summary lines, used by the email, the admin and the PDF. */
export function describe(catalog, productId, answers) {
  const out = [];
  for (const step of stepsFor(catalog, productId))
    for (const q of step.questions) {
      const v = answers?.[q.id];
      if (q.type === "count") out.push([q.label, `${v} ${q.unit || ""}${v === 1 ? "" : "s"}`.trim()]);
      else {
        const ids = q.type === "single" ? [v] : v || [];
        const labels = ids.map((id) => q.options.find((o) => o.id === id)?.label).filter(Boolean);
        out.push([q.label, labels.length ? labels.join(", ") : "None"]);
      }
    }
  return out;
}
