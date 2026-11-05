import { useEffect, useRef } from "react";
import {
  Bell,
  Bike,
  CalendarDays,
  ChefHat,
  CreditCard,
  Heart,
  Languages,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Pencil,
  QrCode,
  Search,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  User,
  Wallet,
  WifiOff,
} from "lucide-react";
import type { Answers } from "../../shared/builder.mjs";

const list = (v: Answers[string] | undefined) => (Array.isArray(v) ? v : []);
const has = (a: Answers, key: string, id: string) => list(a[key]).includes(id);
const naira = (n: number) => "₦" + n.toLocaleString("en-NG");

/** Bars that stand in for text in the mock-ups. */
const Lines = ({ n = 2, w = [80, 55, 68] }: { n?: number; w?: number[] }) => (
  <span className="pv-lines" aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <i key={i} style={{ width: `${w[i % w.length]}%` }} />
    ))}
  </span>
);

/**
 * When a new section appears, glide the mock to it and flash it so the visitor sees the
 * effect of the answer they just gave.
 */
function useReveal(keys: string[]) {
  const frame = useRef<HTMLDivElement>(null);
  const previous = useRef<string[] | null>(null);
  const joined = keys.join("|");
  useEffect(() => {
    const before = previous.current;
    previous.current = keys;
    if (!before || !frame.current) return;
    const added = keys.find((k) => !before.includes(k));
    if (!added) return;
    const el = frame.current.querySelector<HTMLElement>(`[data-part="${added}"]`);
    if (!el) return;
    el.classList.remove("pv-flash");
    void el.offsetWidth;
    el.classList.add("pv-flash");
    const scroller = el.closest<HTMLElement>(".pv-scroll");
    if (scroller) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
      scroller.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);
  return frame;
}

function Browser({ url, children, theme }: { url: string; children: React.ReactNode; theme: string }) {
  return (
    <div className={`pv-browser pv-theme-${theme}`}>
      <div className="pv-bar">
        <i />
        <i />
        <i />
        <span>{url}</span>
      </div>
      <div className="pv-scroll">{children}</div>
    </div>
  );
}

const PAGE_NAMES = ["Home", "About", "Services", "Work", "Pricing", "Team", "FAQ", "Contact"];

function WebsiteMock({ a }: { a: Answers }) {
  const f = list(a.features);
  const pages = Number(a.pages) || 5;
  const theme = String(a.look || "template");
  const shown = PAGE_NAMES.slice(0, Math.min(pages, 5));
  const ref = useReveal([...f, `look-${theme}`, `pages-${pages > 5 ? "many" : pages}`]);
  return (
    <div ref={ref} className="pv-fill">
      <Browser url="yourbusiness.com" theme={theme}>
        <nav className="pv-nav" data-part={`pages-${pages > 5 ? "many" : pages}`}>
          <b className="pv-logo">{a.brand === "new" || a.brand === "refresh" ? <Sparkles size={11} /> : null}Brand</b>
          <span>
            {shown.map((p) => (
              <em key={p}>{p}</em>
            ))}
            {pages > 5 && <em className="pv-more">+{pages - 5}</em>}
          </span>
          {f.includes("lang") && (
            <small data-part="lang" className="pv-pill">
              <Languages size={10} /> EN
            </small>
          )}
          <small className="pv-cta">{f.includes("booking") ? "Book now" : "Get in touch"}</small>
        </nav>
        <header className="pv-hero" data-part={`look-${theme}`}>
          <div>
            <strong>Your business, beautifully online.</strong>
            <Lines n={2} />
            <small className="pv-cta">Learn more</small>
          </div>
          <figure className="pv-hero-art">{theme === "premium" && <><i /><i /><i /></>}</figure>
        </header>
        <section className="pv-cards">
          {["Services", "About us", "Why us"].map((t) => (
            <article key={t}>
              <b>{t}</b>
              <Lines n={2} w={[90, 60]} />
            </article>
          ))}
        </section>
        {f.includes("booking") && (
          <section className="pv-section pv-booking" data-part="booking">
            <b>
              <CalendarDays size={12} /> Book an appointment
            </b>
            <div className="pv-calendar">
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} className={i === 9 ? "is-on" : i % 6 === 5 ? "is-off" : ""}>
                  {i + 8}
                </i>
              ))}
            </div>
            <div className="pv-slots">
              {["9:00", "11:30", "2:00", "4:30"].map((t, i) => (
                <em key={t} className={i === 1 ? "is-on" : ""}>
                  {t}
                </em>
              ))}
            </div>
          </section>
        )}
        {f.includes("gallery") && (
          <section className="pv-section" data-part="gallery">
            <b>Gallery</b>
            <div className="pv-gallery">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </section>
        )}
        {f.includes("events") && (
          <section className="pv-section" data-part="events">
            <b>Upcoming events</b>
            {["12 DEC", "28 DEC"].map((d) => (
              <div className="pv-event" key={d}>
                <em>{d}</em>
                <Lines n={1} />
                <small className="pv-cta">Tickets</small>
              </div>
            ))}
          </section>
        )}
        {f.includes("blog") && (
          <section className="pv-section" data-part="blog">
            <b>Latest news</b>
            <div className="pv-cards pv-blog">
              {[1, 2, 3].map((i) => (
                <article key={i}>
                  <i />
                  <Lines n={2} w={[85, 50]} />
                </article>
              ))}
            </div>
          </section>
        )}
        {f.includes("newsletter") && (
          <section className="pv-section pv-newsletter" data-part="newsletter">
            <b>Get our updates</b>
            <span>
              <i>your@email.com</i>
              <small className="pv-cta">Subscribe</small>
            </span>
          </section>
        )}
        <footer className="pv-footer">
          <Lines n={1} w={[40]} />
          <span>© Your business</span>
        </footer>
      </Browser>
      {f.includes("cms") && (
        <span className="pv-float pv-edit" data-part="cms">
          <Pencil size={11} /> Edit page
        </span>
      )}
      <div className="pv-bubbles">
        {f.includes("assistant") && (
          <span className="pv-bubble pv-chat" data-part="assistant">
            <MessageCircle size={14} />
            <em>Hi! How can I help?</em>
          </span>
        )}
        {f.includes("whatsapp") && (
          <span className="pv-bubble pv-whatsapp" data-part="whatsapp" aria-label="WhatsApp">
            <MessageCircle size={16} />
          </span>
        )}
      </div>
    </div>
  );
}

const PRODUCTS = [
  ["Ankara tote", 18500],
  ["Shea body butter", 6500],
  ["Leather sandals", 24000],
  ["Beaded necklace", 9800],
  ["Linen shirt", 21000],
  ["Scented candle", 7500],
] as const;
const PAYMENT_NAMES: Record<string, string> = { paystack: "Paystack", flutterwave: "Flutterwave", stripe: "Visa · Mastercard", transfer: "Bank transfer", cod: "Pay on delivery" };

function StoreMock({ a }: { a: Answers }) {
  const f = list(a.features);
  const pay = list(a.payments);
  const count = a.size === "large" ? 6 : a.size === "medium" ? 6 : 4;
  const ref = useReveal([...f, ...pay.map((p) => `pay-${p}`), `size-${a.size}`, `app-${a.app}`]);
  return (
    <div ref={ref} className={`pv-fill${a.app === "app" ? " has-app" : ""}`}>
      <Browser url="yourstore.ng" theme="custom">
        <nav className="pv-nav pv-store-nav">
          <b className="pv-logo">Store</b>
          <span className="pv-search">
            <Search size={10} /> Search products
          </span>
          <span className="pv-icons">
            {f.includes("wishlist") && <Heart size={12} data-part="wishlist" />}
            {f.includes("accounts") && <User size={12} data-part="accounts" />}
            <span className="pv-cart">
              <ShoppingCart size={12} />
              <i>2</i>
            </span>
          </span>
        </nav>
        {f.includes("promo") && (
          <div className="pv-promo" data-part="promo">
            Black Friday · <b>20% off</b> with code <code>SAVE20</code>
          </div>
        )}
        <section className="pv-products" data-part={`size-${a.size}`}>
          {PRODUCTS.slice(0, count).map(([name, price], i) => (
            <article key={name}>
              <figure style={{ ["--h" as string]: `${(i * 47) % 360}` }}>
                {f.includes("wishlist") && <Heart size={10} className="pv-heart" />}
                {f.includes("inventory") && i === 1 && (
                  <em className="pv-tag" data-part="inventory">
                    Only 3 left
                  </em>
                )}
              </figure>
              <b>{name}</b>
              {f.includes("vendors") && <small data-part={i === 0 ? "vendors" : undefined}>Sold by Lekki Crafts</small>}
              {f.includes("reviews") && (
                <span className="pv-stars" data-part={i === 0 ? "reviews" : undefined}>
                  {[0, 1, 2, 3, 4].map((s) => (
                    <Star key={s} size={8} />
                  ))}
                </span>
              )}
              <span className="pv-price">{naira(price)}</span>
            </article>
          ))}
          {a.size !== "small" && <p className="pv-more-products">{a.size === "large" ? "+ 2,480 more products" : "+ 230 more products"}</p>}
        </section>
        <section className="pv-section pv-checkout" data-part="checkout">
          <b>
            <ShoppingCart size={12} /> Checkout
          </b>
          <div className="pv-row">
            <span>Subtotal</span>
            <span>{naira(43000)}</span>
          </div>
          {f.includes("shipping") && (
            <div className="pv-row" data-part="shipping">
              <span>Delivery · Lekki, Lagos</span>
              <span>{naira(2500)}</span>
            </div>
          )}
          {f.includes("promo") && (
            <div className="pv-row pv-discount">
              <span>SAVE20</span>
              <span>−{naira(8600)}</span>
            </div>
          )}
          <div className="pv-pay">
            {pay.length ? (
              pay.map((p) => (
                <em key={p} data-part={`pay-${p}`}>
                  <CreditCard size={10} /> {PAYMENT_NAMES[p] || p}
                </em>
              ))
            ) : (
              <em className="pv-muted">Choose how customers pay</em>
            )}
          </div>
          {f.includes("abandoned") && (
            <div className="pv-note" data-part="abandoned">
              <Bell size={10} /> “You left something in your cart” reminder
            </div>
          )}
        </section>
      </Browser>
      {a.app === "app" && (
        <div className="pv-mini-phone" data-part="app-app">
          <Phone small>
            <div className="ph-head">
              <b>Store</b>
              <ShoppingCart size={11} />
            </div>
            <div className="ph-grid">
              {PRODUCTS.slice(0, 4).map(([name], i) => (
                <i key={name} style={{ ["--h" as string]: `${(i * 47) % 360}` }} />
              ))}
            </div>
          </Phone>
        </div>
      )}
    </div>
  );
}

const PLATFORM_NAV: Record<string, string[]> = {
  booking: ["Calendar", "Bookings", "Customers", "Staff"],
  dashboard: ["Overview", "Data", "Team", "Tasks"],
  portal: ["Home", "Requests", "Documents", "Messages"],
  lms: ["Courses", "Students", "Lessons", "Certificates"],
  marketplace: ["Listings", "Sellers", "Orders", "Payouts"],
  saas: ["Overview", "Customers", "Billing", "Usage"],
};
const PLATFORM_KPI: Record<string, [string, string][]> = {
  booking: [["Bookings today", "48"], ["Occupancy", "86%"], ["No-shows", "2"]],
  dashboard: [["Open tasks", "124"], ["Completed", "1,920"], ["On time", "94%"]],
  portal: [["Open requests", "31"], ["Resolved", "412"], ["Avg. reply", "2h"]],
  lms: [["Students", "2,340"], ["Courses", "38"], ["Completion", "71%"]],
  marketplace: [["Orders", "1,284"], ["Sellers", "96"], ["GMV", "₦18.4M"]],
  saas: [["MRR", "₦4.2M"], ["Customers", "612"], ["Churn", "1.8%"]],
};
const ROLE_NAMES = ["Admins", "Customers", "Staff", "Managers", "Partners", "Agents", "Vendors", "Guests", "Auditors", "Support"];

function PlatformMock({ a }: { a: Answers }) {
  const f = list(a.features);
  const type = String(a.type || "booking");
  const roles = Number(a.roles) || 2;
  const ref = useReveal([...f, `type-${type}`, `roles-${roles}`]);
  return (
    <div ref={ref} className="pv-fill">
      <Browser url="app.yourplatform.com" theme="custom">
        <div className="pv-app">
          <aside className="pv-side" data-part={`type-${type}`}>
            <b className="pv-logo">
              <LayoutDashboard size={11} /> Platform
            </b>
            {(PLATFORM_NAV[type] || PLATFORM_NAV.booking).map((n, i) => (
              <em key={n} className={i === 0 ? "is-on" : ""}>
                {n}
              </em>
            ))}
            {f.includes("reports") && <em>Reports</em>}
            {f.includes("subscriptions") && <em>Plans</em>}
            <div className="pv-roles" data-part={`roles-${roles}`}>
              <small>{roles} user types</small>
              <span>
                {ROLE_NAMES.slice(0, roles).map((r) => (
                  <i key={r} title={r}>
                    {r[0]}
                  </i>
                ))}
              </span>
            </div>
          </aside>
          <div className="pv-main">
            <div className="pv-top">
              <span className="pv-search">
                <Search size={10} /> Search
              </span>
              {f.includes("branches") && (
                <em className="pv-pill" data-part="branches">
                  <MapPin size={9} /> Ikeja branch ▾
                </em>
              )}
              {f.includes("notify") && (
                <span className="pv-bell" data-part="notify">
                  <Bell size={12} />
                  <i />
                </span>
              )}
              <i className="pv-avatar" />
            </div>
            <div className="pv-kpis">
              {(PLATFORM_KPI[type] || PLATFORM_KPI.booking).map(([k, v]) => (
                <article key={k}>
                  <small>{k}</small>
                  <b>{v}</b>
                </article>
              ))}
            </div>
            {f.includes("ai") && (
              <div className="pv-ai" data-part="ai">
                <Sparkles size={11} /> <span>Ask AI: “Which customers are likely to cancel this month?”</span>
              </div>
            )}
            {f.includes("reports") ? (
              <div className="pv-chart" data-part="reports">
                {[40, 62, 48, 75, 58, 88, 70, 95].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
            ) : (
              <div className="pv-table">
                {[0, 1, 2].map((i) => (
                  <div key={i}>
                    <i />
                    <Lines n={1} w={[60, 40, 70]} />
                    <em>{["Active", "Pending", "Done"][i]}</em>
                  </div>
                ))}
              </div>
            )}
            <div className="pv-widgets">
              {f.includes("payments") && (
                <article data-part="payments">
                  <small>
                    <CreditCard size={10} /> Payments today
                  </small>
                  <b>₦1,240,000</b>
                </article>
              )}
              {f.includes("subscriptions") && (
                <article data-part="subscriptions">
                  <small>Plan</small>
                  <b>Pro · monthly</b>
                </article>
              )}
              {f.includes("integrations") && (
                <article data-part="integrations">
                  <small>Connected</small>
                  <span className="pv-logos">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </article>
              )}
              {f.includes("audit") && (
                <article data-part="audit">
                  <small>Activity</small>
                  <Lines n={2} w={[90, 70]} />
                </article>
              )}
            </div>
          </div>
          {f.includes("chat") && (
            <div className="pv-chatpanel" data-part="chat">
              <small>
                <MessageCircle size={10} /> Chat
              </small>
              <em>Hi, is my order ready?</em>
              <em className="is-me">Yes! Dispatching now.</em>
            </div>
          )}
        </div>
      </Browser>
    </div>
  );
}

function Phone({ children, small, label }: { children: React.ReactNode; small?: boolean; label?: string }) {
  return (
    <figure className={`pv-phone${small ? " is-small" : ""}`}>
      <div className="pv-phone-screen">
        <i className="pv-notch" />
        {children}
      </div>
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

const MENUS: Record<string, { title: string; chips: string[]; items: [string, number][] }> = {
  restaurant: { title: "What are you craving?", chips: ["Rice", "Grills", "Soups", "Drinks"], items: [["Smoky jollof rice", 4500], ["Suya platter", 6000], ["Chapman", 2000]] },
  shop: { title: "New arrivals", chips: ["Women", "Men", "Beauty", "Home"], items: [["Ankara tote", 18500], ["Shea butter", 6500], ["Sandals", 24000]] },
  booking: { title: "Book your next visit", chips: ["Hair", "Nails", "Spa", "Barber"], items: [["Braids · 3h", 25000], ["Manicure", 8000], ["Massage · 1h", 20000]] },
  delivery: { title: "Send a package", chips: ["Bike", "Car", "Van", "Same day"], items: [["Lekki → Yaba", 3500], ["Ikeja → VI", 4800], ["Ajah → Surulere", 5200]] },
  social: { title: "Your community", chips: ["Feed", "Groups", "Events", "Saved"], items: [["New post from Tolu", 0], ["Event this Saturday", 0], ["12 new members", 0]] },
  custom: { title: "Welcome back", chips: ["Home", "Explore", "Saved", "Profile"], items: [["Your first feature", 0], ["Another screen", 0], ["And one more", 0]] },
};

function CustomerApp({ a }: { a: Answers }) {
  const f = list(a.features);
  const type = String(a.type || "restaurant");
  if (type === "fintech") {
    return (
      <>
        <div className="ph-head">
          <b>Hi, Ada</b>
          <Bell size={11} />
        </div>
        <div className="ph-balance">
          <small>Wallet balance</small>
          <b>₦245,800.00</b>
          <span>
            <em>Send</em>
            <em>Add money</em>
            <em>Bills</em>
          </span>
        </div>
        {f.includes("qr") && (
          <div className="ph-card ph-qr" data-part="qr">
            <QrCode size={14} /> Scan to pay
          </div>
        )}
        {["Airtime · MTN", "Transfer to Tobi", "DSTV renewal"].map((t, i) => (
          <div className="ph-row" key={t}>
            <i />
            <span>{t}</span>
            <em>{["−₦2,000", "−₦15,000", "−₦9,000"][i]}</em>
          </div>
        ))}
      </>
    );
  }
  const menu = MENUS[type] || MENUS.custom;
  return (
    <>
      <div className="ph-head">
        <b>{menu.title}</b>
        {f.includes("chat") && <MessageCircle size={11} data-part="chat" />}
      </div>
      <div className="ph-chips">
        {menu.chips.map((c, i) => (
          <em key={c} className={i === 0 ? "is-on" : ""}>
            {c}
          </em>
        ))}
      </div>
      {f.includes("loyalty") && (
        <div className="ph-card ph-loyalty" data-part="loyalty">
          <Star size={10} /> 240 points · free drink at 300
        </div>
      )}
      {f.includes("wallet") && (
        <div className="ph-card ph-wallet" data-part="wallet">
          <Wallet size={10} /> Wallet ₦12,500
        </div>
      )}
      {f.includes("tracking") && (
        <div className="ph-map" data-part="tracking">
          <svg className="ph-route" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <path d="M8 32 C 30 30, 34 10, 56 14 S 84 8, 92 8" />
          </svg>
          <Bike size={11} className="ph-rider" />
          <small>Rider is 6 min away</small>
        </div>
      )}
      {menu.items.map(([name, price], i) => (
        <div className="ph-item" key={name}>
          <i style={{ ["--h" as string]: `${20 + i * 40}` }} />
          <span>
            <b>{name}</b>
            {f.includes("reviews") && (
              <span className="pv-stars" data-part={i === 0 ? "reviews" : undefined}>
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} size={7} />
                ))}
              </span>
            )}
            {price ? <em>{naira(price)}</em> : <Lines n={1} w={[70]} />}
          </span>
          <small>+</small>
        </div>
      ))}
      {(type === "restaurant" || type === "shop") && (
        <div className="ph-cartbar" data-part="payments">
          <span>View cart · 2 items</span>
          <b>{f.includes("payments") ? "Pay ₦10,500" : "₦10,500"}</b>
        </div>
      )}
      {f.includes("qr") && (
        <span className="ph-fab" data-part="qr">
          <QrCode size={12} />
        </span>
      )}
      {f.includes("offline") && (
        <span className="ph-offline" data-part="offline">
          <WifiOff size={8} /> Works offline
        </span>
      )}
    </>
  );
}

const PIECES: Record<string, { label: string; icon: React.ReactNode }> = {
  admin: { label: "Admin dashboard", icon: <LayoutDashboard size={11} /> },
  pos: { label: "POS · in-store", icon: <Store size={11} /> },
  rider: { label: "Rider app", icon: <Bike size={11} /> },
  vendor: { label: "Vendor app", icon: <Store size={11} /> },
  kitchen: { label: "Kitchen display", icon: <ChefHat size={11} /> },
};

function Piece({ id }: { id: string }) {
  if (id === "admin")
    return (
      <div className="pv-laptop">
        <div className="pv-laptop-screen">
          <span className="pv-mini-side" />
          <div>
            <span className="pv-mini-kpis">
              <i />
              <i />
              <i />
            </span>
            <span className="pv-mini-chart">
              {[40, 70, 55, 90, 65].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </span>
          </div>
        </div>
        <i className="pv-laptop-base" />
      </div>
    );
  if (id === "pos")
    return (
      <div className="pv-tablet">
        <div className="pv-pos">
          <span className="pv-pos-grid">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} style={{ ["--h" as string]: `${(i * 37) % 360}` }} />
            ))}
          </span>
          <span className="pv-pos-ticket">
            <Lines n={3} w={[90, 70, 80]} />
            <b>₦18,500</b>
            <em>Charge</em>
          </span>
        </div>
      </div>
    );
  if (id === "kitchen")
    return (
      <div className="pv-screen">
        {["#1042", "#1043", "#1044"].map((n, i) => (
          <span key={n} className={i === 0 ? "is-hot" : ""}>
            <b>{n}</b>
            <Lines n={3} w={[80, 60, 70]} />
            <em>{["4 min", "Ready", "New"][i]}</em>
          </span>
        ))}
      </div>
    );
  if (id === "rider")
    return (
      <Phone small>
        <div className="ph-map ph-map-tall">
          <svg className="ph-route" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M10 50 C 28 46, 30 22, 52 26 S 80 10, 90 8" />
          </svg>
          <MapPin size={11} className="ph-pin" />
        </div>
        <div className="ph-card">
          <small>Pickup → Lekki Phase 1</small>
          <b className="ph-accept">Accept · ₦1,500</b>
        </div>
      </Phone>
    );
  return (
    <Phone small>
      <div className="ph-head">
        <b>Orders</b>
        <Bell size={9} />
      </div>
      {["#1042 · New", "#1041 · Preparing", "#1040 · Done"].map((t, i) => (
        <div className="ph-row" key={t}>
          <i />
          <span>{t}</span>
          <em className={i === 0 ? "is-new" : ""}>{i === 0 ? "Accept" : ""}</em>
        </div>
      ))}
    </Phone>
  );
}

function MobileMock({ a }: { a: Answers }) {
  const pieces = list(a.pieces).filter((p) => PIECES[p]);
  const f = list(a.features);
  const ref = useReveal([...f, ...pieces.map((p) => `piece-${p}`), `type-${a.type}`, `os-${a.platforms}`]);
  const os = a.platforms === "android" ? "Android" : a.platforms === "ios" ? "iPhone" : "Android & iPhone";
  return (
    <div ref={ref} className={`pv-fill pv-system${pieces.length ? " has-pieces" : ""}`}>
      <div className="pv-system-main" data-part={`type-${a.type}`}>
        {f.includes("push") && (
          <div className="pv-push" data-part="push">
            <Bell size={10} /> <span>Your order is on its way!</span>
          </div>
        )}
        <Phone label={`Customer app · ${os}`}>
          <div className="pv-scroll ph-scroll">
            <CustomerApp a={a} />
          </div>
        </Phone>
      </div>
      {pieces.length > 0 && (
        <div className="pv-pieces">
          {pieces.map((p) => (
            <figure key={p} className={`pv-piece pv-piece-${p}`} data-part={`piece-${p}`}>
              <Piece id={p} />
              <figcaption>
                {PIECES[p].icon} {PIECES[p].label}
                <i className="pv-sync" title="Synced" />
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {pieces.length > 0 && <p className="pv-backend">All connected to one secure backend · live updates</p>}
    </div>
  );
}

export default function Preview({ product, kind, answers }: { product: string; kind: "web" | "mobile"; answers: Answers }) {
  if (kind === "mobile") return <MobileMock a={answers} />;
  if (product === "store") return <StoreMock a={answers} />;
  if (product === "platform") return <PlatformMock a={answers} />;
  return <WebsiteMock a={answers} />;
}
