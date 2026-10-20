"use strict";

const $ = s => document.querySelector(s);
const form = $("#form"), urlInput = $("#url"), countSel = $("#count"), goBtn = $("#go");
const statusEl = $("#status"), progressEl = $("#progress"), out = $("#out");

// ---------- DOM helpers ----------

// el("div", {class: "x"}, "text", childNode, ...). Strings always go in as text, never HTML.
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.append(k instanceof Node ? k : String(k));
  }
  return n;
}

// Static, hard-coded SVG paths only.
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  minus: '<path d="M6 12h12"/>',
  ads: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  tag: '<path d="M20 12.5 12.5 20a1.5 1.5 0 0 1-2 0L3 12.5V4h8.5l8.5 8.5z"/><circle cx="7.5" cy="8" r="1.2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5h16a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0zM5.5 12v8h13v-8"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M9.5 10v9.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  verified: '<path d="m12 2.5 2.4 1.8 3 .1.9 2.8 2.4 1.8-.9 2.9.9 2.8-2.4 1.8-.9 2.8-3 .1L12 21.5l-2.4-1.8-3-.1-.9-2.8-2.4-1.8.9-2.9-.9-2.8 2.4-1.8.9-2.8 3-.1z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  // "More info" rows, mirroring YouTube's About dialog
  url: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  subs: '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 19.5a6.5 6.5 0 0 1 13 0M18 5.5a5 5 0 0 1 0 6M20.5 3.5a8 8 0 0 1 0 10"/>',
  videos: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
};
function icon(name, cls) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  if (cls) s.setAttribute("class", cls);
  s.innerHTML = ICONS[name];
  return s;
}

const link = (href, ...kids) => el("a", { href, target: "_blank", rel: "noreferrer" }, ...kids);
const pill = (cls, ...kids) => el("span", { class: "pill " + cls }, ...kids);
const yesNo = (on, yes = "Có", no = "Không") => pill(on ? "on" : "off", on ? yes : no);

// ---------- formatting ----------

const nf = new Intl.NumberFormat("vi-VN");
const fmt = n => (n == null || n === "" || isNaN(n)) ? "-" : nf.format(Number(n));
function parseCount(s) {
  const m = String(s || "").match(/([\d.,]+)\s*([KMB])?/i);
  if (!m) return null;
  if (m[2]) return parseFloat(m[1].replace(/,/g, "")) * { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()];
  return Number(m[1].replace(/[.,]/g, ""));
}
function compact(n) {
  if (n == null || isNaN(n)) return "-";
  const f = (v, u) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: v < 10 ? 2 : 1 }).format(v) + " " + u;
  if (n >= 1e9) return f(n / 1e9, "tỷ");
  if (n >= 1e6) return f(n / 1e6, "tr");
  if (n >= 1e4) return f(n / 1e3, "N");
  return fmt(n);
}
const dur = s => { s = Math.round(Number(s) || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
const date = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toLocaleDateString("vi-VN") : "-"; };
function ago(s) {
  const d = new Date(s); if (isNaN(d)) return "";
  const h = (Date.now() - d) / 36e5;
  if (h < 1) return "vừa xong";
  if (h < 24) return Math.floor(h) + " giờ trước";
  if (h < 24 * 30) return Math.floor(h / 24) + " ngày trước";
  return date(s);
}

// ---------- status / loading ----------

function setStatus(msg, isError) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

function skeleton() {
  const bar = (w, h, mt) => el("div", { class: "sk", style: `width:${w};height:${h}px;margin-top:${mt || 0}px` });
  out.replaceChildren(
    el("div", { class: "card", style: "padding:14px;display:flex;gap:12px;align-items:center" },
      el("div", { class: "sk", style: "width:56px;height:56px;border-radius:50%" }),
      el("div", { style: "flex:1" }, bar("55%", 14), bar("35%", 10, 8))),
    el("div", { class: "signals" }, [0, 1, 2, 3].map(() => el("div", { class: "sk", style: "height:76px;border-radius:10px" }))),
    el("div", { class: "card", style: "padding:14px" }, bar("100%", 10), bar("90%", 10, 10), bar("70%", 10, 10)));
}

function emptyState(title, sub) {
  out.replaceChildren(el("div", { class: "card empty" },
    el("div", { class: "big" }, icon("search")),
    el("b", null, title), el("div", null, sub)));
}

// ---------- render ----------

function render(r) {
  const { channel: c, about: a, videos: all, verdict: vd } = r;
  const videos = all.filter(v => !v.error);
  const failed = all.filter(v => v.error);
  const ctx = { c, a, videos, failed, r };

  out.replaceChildren(hero(ctx), verdictCard(ctx), signals(ctx), tabs(ctx), footer(ctx));
}

const viSubs = s => String(s || "").replace(/\s*subscribers?$/i, " người đăng ký");
const viVideos = s => String(s || "").replace(/\s*videos?$/i, " video");
const viViews = s => String(s || "").replace(/\s*views?$/i, " lượt xem");

function hero({ c, a, r }) {
  const channelUrl = `https://www.youtube.com/channel/${c.channelId}`;
  const subs = a && a.subscribers || c.subscribers;
  const vids = a && a.videos || c.videoCount;
  const desc = (a && a.description) || c.description;
  const idBtn = el("button", { class: "copy-id", title: "Copy Channel ID", onclick: () => flash(idBtn, c.channelId) }, c.channelId);

  // Same rows as YouTube's "More info" dialog
  const url = a && a.url || (c.handle ? `www.youtube.com/${c.handle}` : "");
  const rows = [
    ["url", url ? link("https://" + url, url) : "-", "Link kênh"],
    ["globe", a && a.country || "-", "Quốc gia"],
    ["info", a && a.joined ? `Tham gia ${date(a.joined)}` : "-", "Ngày tạo kênh"],
    ["subs", subs ? viSubs(subs) : "-", "Người đăng ký"],
    ["videos", vids ? viVideos(vids) : "-", "Số video"],
    ["trend", a && a.views ? viViews(a.views) : "-", "Tổng lượt xem"],
  ];

  let descEl = null;
  if (desc) {
    const body = el("div", { class: "hero-desc clamp" }, desc);
    const more = el("button", { class: "more", type: "button", onclick: () => {
      const open = body.classList.toggle("clamp");
      more.textContent = open ? "…thêm" : "Thu gọn";
    } }, "…thêm");
    descEl = el("div", { class: "hero-desc-wrap" }, body, desc.length > 90 || desc.includes("\n") ? more : null);
  }

  return el("section", { class: "card hero" },
    el("div", { class: "banner" },
      c.bannerUrl ? el("img", { src: c.bannerUrl, alt: "", referrerpolicy: "no-referrer" }) : null),
    el("div", { class: "row" },
      c.avatar ? el("img", { class: "avatar", src: c.avatar, alt: "", referrerpolicy: "no-referrer" }) : el("div", { class: "avatar" }),
      el("div", { class: "who" },
        el("div", { class: "name" },
          link(channelUrl, c.title),
          c.verified ? el("span", { title: "Đã xác minh" }, icon("verified", "verified")) : null,
          c.artist ? pill("blue", "Nghệ sĩ") : null),
        el("div", { class: "meta" },
          [c.handle, subs && viSubs(subs), vids && viVideos(vids)].filter(Boolean).join(" • ")),
        el("div", { class: "meta" }, idBtn))),
    descEl,
    el("div", { class: "more-info" },
      el("div", { class: "mi-title" }, "Thông tin thêm"),
      !a ? el("div", { class: "mi-error" }, icon("alert"), `Không tải được thông tin thêm (${r.aboutError || "lỗi không rõ"}). Bấm kiểm tra lại.`) : null,
      el("div", { class: "mi-grid" }, rows.map(([ic, value, label]) =>
        el("div", { class: "mi-row", title: label },
          icon(ic),
          el("span", { class: "num" }, value))))));
}

const VERDICTS = {
  on: { cls: "ok", icon: "check", title: "Kênh đang bật kiếm tiền",
    sub: "Có Hội viên / Shopping / Store, chỉ kênh trong YPP mới có" },
  likely: { cls: "ok", icon: "check", title: "Nhiều khả năng đã bật kiếm tiền",
    sub: "Có quảng cáo và kênh đủ lớn để vào YPP" },
  yt: { cls: "warn", icon: "alert", title: "Có quảng cáo nhưng chưa đủ điều kiện YPP",
    sub: "Kênh dưới 500 người đăng ký: YouTube tự chạy quảng cáo và không chia doanh thu" },
  off: { cls: "no", icon: "minus", title: "Không thấy dấu hiệu kiếm tiền", sub: "" },
};

function verdictCard({ r, videos }) {
  const v = VERDICTS[r.verdict.status] || VERDICTS.off;
  return el("section", { class: "card verdict " + v.cls },
    el("div", { class: "ring" }, icon(v.icon)),
    el("div", null,
      el("h2", null, v.title),
      el("p", null, [v.sub, `Dựa trên ${videos.length} video gần nhất`].filter(Boolean).join(" · "))));
}

function signals({ c, videos }) {
  const withAds = videos.filter(v => v.ads.total > 0 || v.ads.heartbeat).length;
  const join = c.hasJoinButton || videos.some(v => v.hasJoinButton);
  const products = videos.reduce((n, v) => n + v.products.length, 0);
  const paid = videos.filter(v => v.paidPromotion).length;
  const card = (state, ic, value, label) => el("div", { class: "signal " + state },
    el("div", { class: "ico" }, icon(ic)), el("b", { class: "num" }, value), el("span", null, label));
  return el("section", { class: "signals" },
    card(withAds ? "on" : "off", "ads", `${withAds}/${videos.length}`, "video có QC"),
    card(join ? "on" : "off", "gem", join ? "Có" : "Không", "hội viên"),
    card(products ? "on" : "off", "bag", products, "SP Shopping"),
    card(paid ? "warn" : "off", "tag", paid, "QC trả phí"));
}

// ---------- tabs ----------

const TAB_KEY = "ytci.tab";
function tabs(ctx) {
  const products = ctx.videos.reduce((n, v) => n + v.products.length, 0);
  const defs = [
    ["ads", "Quảng cáo", null, adsPanel],
    ["videos", "Video", ctx.videos.length, videosPanel],
    ["shop", "Shopping", products, shopPanel],
    ["member", "Hội viên", null, memberPanel],
    ["info", "Khác", null, infoPanel],
  ];
  let current = "ads";
  try { current = localStorage.getItem(TAB_KEY) || "ads"; } catch (_) {}
  if (!defs.some(d => d[0] === current)) current = "ads";

  const nav = el("div", { class: "tabs", role: "tablist" });
  const wrap = el("section", { class: "card tabs-wrap" }, nav);
  const buttons = {}, panels = {};
  for (const [id, label, n, fn] of defs) {
    buttons[id] = el("button", { type: "button", role: "tab", onclick: () => select(id) }, label,
      n != null ? el("span", { class: "n" }, n) : null);
    panels[id] = el("div", { class: "panel", role: "tabpanel" }, fn(ctx));
    nav.append(buttons[id]);
    wrap.append(panels[id]);
  }
  function select(id) {
    for (const k in buttons) {
      buttons[k].setAttribute("aria-selected", String(k === id));
      panels[k].hidden = k !== id;
    }
    try { localStorage.setItem(TAB_KEY, id); } catch (_) {}
  }
  select(current);
  return wrap;
}

function kv(pairs) {
  return el("dl", { class: "kv" }, pairs.filter(p => p && p[1] !== undefined).map(([k, v]) =>
    el("div", null, el("dt", null, k), el("dd", null, v === "" || v == null ? "-" : v))));
}

function thumb(v) {
  return link(`https://www.youtube.com/watch?v=${v.videoId}`,
    el("div", { class: "thumb" },
      el("img", { src: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }),
      el("span", { class: "len num" }, dur(v.lengthSeconds))));
}

function timeline(v) {
  const len = v.lengthSeconds * 1000 || 1;
  if (!v.ads.total) {
    return v.ads.heartbeat
      ? el("div", { class: "timeline dashed", title: "Có tham số quảng cáo, vị trí được quyết định lúc phát" })
      : el("div", { class: "timeline", title: "Không có quảng cáo" });
  }
  return el("div", { class: "timeline" }, v.ads.placements.map(p => {
    const pct = p.kind === "pre" ? 0 : p.kind === "post" ? 100 : Math.min(100, p.offsetMs / len * 100);
    return el("i", { class: "mk", style: `left:${pct}%`, title: `${p.kind}-roll @ ${dur(p.offsetMs / 1000)}` });
  }));
}

function adsPanel({ videos }) {
  const withAds = videos.filter(v => v.ads.total > 0 || v.ads.heartbeat).length;
  const tot = { pre: 0, mid: 0, post: 0 };
  for (const v of videos) for (const k in tot) tot[k] += v.ads.counts[k];
  const long = videos.filter(v => v.lengthSeconds >= 480).length;

  return [
    el("div", { class: "ad-totals" },
      el("div", null, el("b", { class: "num" }, `${withAds}/${videos.length}`), el("span", null, "video có quảng cáo")),
      el("div", null, el("b", { class: "num" }, tot.pre), el("span", null, "pre-roll")),
      el("div", null, el("b", { class: "num" }, `${tot.mid} · ${tot.post}`), el("span", null, "mid · post-roll"))),
    el("h3", null, "Chi tiết"),
    kv([
      ["Video ≥ 8 phút (đủ điều kiện mid-roll)", `${long}/${videos.length}`],
      ["Gắn nhãn quảng cáo trả phí", `${videos.filter(v => v.paidPromotion).length} video`],
    ]),
    el("h3", null, "Theo video"),
    el("div", { class: "vlist" }, videos.map(v => el("div", { class: "vrow" },
      thumb(v),
      el("div", { class: "vinfo" },
        link(`https://www.youtube.com/watch?v=${v.videoId}`, el("div", { class: "vtitle" }, v.title)),
        timeline(v),
        el("div", { class: "vtags" },
          !v.ads.total && !v.ads.heartbeat ? pill("off", "Không có QC") : null,
          !v.ads.total && v.ads.heartbeat ? pill("on", "Có QC") : null,
          v.ads.counts.pre ? pill("on", `Pre ×${v.ads.counts.pre}`) : null,
          v.ads.counts.mid ? pill("on", `Mid ×${v.ads.counts.mid}`) : null,
          v.ads.counts.post ? pill("on", `Post ×${v.ads.counts.post}`) : null,
          v.paidPromotion ? pill("warn", "Trả phí") : null))))),
    el("div", { class: "note" },
      "Mid-roll thường được quyết định lúc phát nên có thể không hiện ở đây dù kênh có bật. " +
      "Không có quảng cáo chưa chắc là tắt kiếm tiền (video bị hạn chế QC hoặc vùng không có QC)."),
  ];
}

function videosPanel({ videos, failed }) {
  const total = videos.reduce((s, v) => s + v.views, 0);
  return [
    videos.length ? el("div", { class: "ad-totals" },
      el("div", null, el("b", { class: "num" }, compact(total / videos.length)), el("span", null, "view trung bình")),
      el("div", null, el("b", { class: "num" }, compact(Math.max(...videos.map(v => v.views)))), el("span", null, "view cao nhất")),
      el("div", null, el("b", { class: "num" }, compact(total)), el("span", null, `tổng ${videos.length} video`))) : null,
    el("div", { class: "vlist" }, videos.map(v => el("div", { class: "vrow" },
      thumb(v),
      el("div", { class: "vinfo" },
        link(`https://www.youtube.com/watch?v=${v.videoId}`, el("div", { class: "vtitle" }, v.title)),
        el("div", { class: "vmeta num" },
          el("span", null, fmt(v.views) + " lượt xem"),
          v.likes ? el("span", null, v.likes + " thích") : null,
          el("span", { title: date(v.publishDate) }, ago(v.publishDate))),
        el("div", { class: "vtags" },
          v.category ? el("span", { class: "chip" }, v.category) : null,
          v.products.length ? pill("blue", `${v.products.length} SP`) : null,
          v.isFamilySafe === false ? pill("warn", "Giới hạn tuổi") : null,
          v.isUnlisted ? pill("warn", "Không công khai") : null,
          v.isLive ? pill("warn", "Live") : null,
          v.membersOnly ? pill("blue", "Hội viên") : null))))),
    failed.length ? el("div", { class: "note", style: "color:var(--accent)" }, `${failed.length} video lỗi: ${failed.map(f => f.videoId).join(", ")}`) : null,
  ];
}

function shopPanel({ c, videos }) {
  const products = [];
  for (const v of videos) for (const p of v.products) products.push(p);
  const vendors = {};
  for (const p of products) vendors[p.vendor || "?"] = (vendors[p.vendor || "?"] || 0) + 1;
  const top = Object.entries(vendors).sort((x, y) => y[1] - x[1]);
  const max = top.length ? top[0][1] : 1;
  const unique = [...new Map(products.map(p => [p.title + "|" + p.vendor, p])).values()];

  if (!products.length) {
    return [kv([["Video gắn sản phẩm", `0/${videos.length}`], ["Tab Store", yesNo(c.hasStoreTab)], ["Kệ merch", yesNo(c.hasMerchShelf)]]),
      el("div", { class: "note" }, "Không thấy sản phẩm YouTube Shopping trong các video đã phân tích.")];
  }
  return [
    kv([
      ["Video gắn sản phẩm", `${videos.filter(v => v.products.length).length}/${videos.length}`],
      ["Link affiliate", `${products.filter(p => p.affiliate).length}/${products.length}`],
      ["Tab Store · Kệ merch", el("span", null, yesNo(c.hasStoreTab), " ", yesNo(c.hasMerchShelf))],
    ]),
    el("h3", null, "Nơi bán"),
    el("div", { class: "bars" }, top.map(([k, n]) => el("div", { class: "bar-row" },
      el("span", { class: "k", title: k }, k),
      el("div", { class: "track" }, el("div", { class: "fill", style: `width:${n / max * 100}%` })),
      el("span", { class: "v num" }, n)))),
    el("h3", null, `Sản phẩm (${unique.length})`),
    el("div", { class: "products" }, unique.map(p => el(p.url ? "a" : "div",
      p.url ? { class: "product", href: p.url, target: "_blank", rel: "noreferrer", title: p.title } : { class: "product" },
      el("div", { class: "img" }, p.thumbnail ? el("img", { src: p.thumbnail, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null),
      el("div", { class: "t" }, p.title),
      el("div", { class: "m" }, el("span", null, p.vendor), p.price ? el("span", { class: "price" }, p.price) : (p.affiliate ? pill("blue", "affiliate") : null))))),
  ];
}

function memberPanel({ c, videos }) {
  const join = c.hasJoinButton || videos.some(v => v.hasJoinButton);
  const membersOnly = c.videos.filter(v => v.membersOnly).length + videos.filter(v => v.membersOnly).length;
  const thanks = videos.some(v => v.superThanks);
  const feat = (on, ic, title, sub) => el("div", { class: "feat " + (on ? "on" : "off") },
    el("div", { class: "ico" }, icon(ic)),
    el("div", { class: "txt" }, el("b", null, title), el("span", null, sub)),
    yesNo(on, "Có", "Không"));
  return [
    feat(join, "gem", "Nút Hội viên (Join)", "Chỉ kênh trong YPP mới mở được"),
    feat(c.hasMembershipTab, "lock", "Tab Membership", "Tab riêng cho hội viên trên trang kênh"),
    feat(membersOnly > 0, "lock", "Video chỉ dành cho hội viên", `${membersOnly} trong ${c.videos.length} video đầu tab Videos`),
    feat(thanks, "heart", "Super Thanks", "Nút cảm ơn trả phí dưới video"),
    feat(c.hasStoreTab, "store", "Tab Store", "Cửa hàng merch của kênh"),
  ];
}

function infoPanel({ c, a, videos }) {
  const cats = {};
  for (const v of videos) if (v.category) cats[v.category] = (cats[v.category] || 0) + 1;
  const kws = (c.keywords.match(/"[^"]+"|\S+/g) || []).map(k => k.replace(/"/g, ""));
  return [
    kv([
      ["Danh mục", Object.keys(cats).length ? el("div", { class: "chips" }, Object.entries(cats).map(([k, n]) => el("span", { class: "chip" }, `${k} · ${n}`))) : ""],
      ["An toàn cho gia đình", yesNo(c.isFamilySafe !== false)],
      ["Video giới hạn tuổi", `${videos.filter(v => v.isFamilySafe === false).length}/${videos.length}`],
      ["Cho phép nhúng", `${videos.filter(v => v.embeddable).length}/${videos.length}`],
      ["Quốc gia xem được", String(c.availableCountries || (videos[0] && videos[0].availableCountries) || "-")],
      ["Email doanh nghiệp", a ? yesNo(a.hasBusinessEmail, "Có · cần đăng nhập") : ""],
      ["Tab kênh", el("div", { class: "chips" }, c.tabs.map(t => el("span", { class: "chip" }, t)))],
      ["RSS", c.rssUrl ? link(c.rssUrl, "Feed ", icon("external")) : ""],
    ]),
    a && a.links.length ? [el("h3", null, "Liên kết"),
      el("div", { class: "links" }, a.links.map(l => link("https://" + l.url.replace(/^https?:\/\//, ""), l.title || l.url)))] : null,
    kws.length ? [el("h3", null, "Từ khoá kênh"), el("div", { class: "chips left" }, kws.map(k => el("span", { class: "chip" }, k)))] : null,
  ];
}

function footer({ c, videos, r }) {
  const b = (ic, label, fn) => {
    const btn = el("button", { class: "btn", type: "button", onclick: () => fn(btn) }, icon(ic), label);
    return btn;
  };
  return el("div", { class: "foot" },
    b("copy", "JSON", btn => flash(btn, JSON.stringify(r, null, 2))),
    b("table", "CSV", btn => flash(btn, toCsv(videos))),
    b("external", "Mở kênh", () => chrome.tabs.create({ url: `https://www.youtube.com/channel/${c.channelId}` })),
    el("span", { class: "time" }, new Date(r.checkedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })));
}

async function flash(btn, textToCopy) {
  const old = [...btn.childNodes];
  try { await navigator.clipboard.writeText(textToCopy); btn.replaceChildren(icon("check"), "Đã copy"); }
  catch (_) { btn.replaceChildren("Lỗi copy"); }
  setTimeout(() => btn.replaceChildren(...old), 1200);
}

function toCsv(videos) {
  const head = ["videoId", "title", "publishDate", "lengthSeconds", "views", "likes", "category", "pre", "mid", "post", "products", "paidPromotion"];
  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  return [head.join(","), ...videos.map(v => [v.videoId, v.title, v.publishDate, v.lengthSeconds, v.views, v.likes,
    v.category, v.ads.counts.pre, v.ads.counts.mid, v.ads.counts.post, v.products.length, v.paidPromotion].map(q).join(","))].join("\n");
}

// ---------- wiring ----------

// YouTube answers 403 to youtubei/* calls whose Origin is chrome-extension://…,
// so rewrite Origin for requests this extension makes (and only those).
async function installOriginRule() {
  if (!chrome.declarativeNetRequest) return;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "origin", operation: "set", value: "https://www.youtube.com" }],
      },
      condition: {
        urlFilter: "|https://www.youtube.com/youtubei/",
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ["xmlhttprequest"],
      },
    }],
  });
}

async function run() {
  const url = urlInput.value.trim();
  if (!url) return;
  goBtn.disabled = true;
  progressEl.hidden = false;
  skeleton();
  try {
    await installOriginRule().catch(() => {});
    const r = await YTInspector.inspect(url, { videoCount: Number(countSel.value), onProgress: m => setStatus(m) });
    setStatus("");
    render(r);
  } catch (e) {
    setStatus("");
    out.replaceChildren(el("div", { class: "card empty" },
      el("div", { class: "big" }, icon("alert")),
      el("b", null, "Không kiểm tra được"), el("div", null, String(e.message || e))));
  } finally {
    goBtn.disabled = false;
    progressEl.hidden = true;
  }
}

form.addEventListener("submit", e => { e.preventDefault(); run(); });

(async () => {
  try { const saved = localStorage.getItem("videoCount"); if (saved) countSel.value = saved; } catch (_) {}
  countSel.addEventListener("change", () => { try { localStorage.setItem("videoCount", countSel.value); } catch (_) {} });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && YTP.classifyUrl(tab.url)) {
    urlInput.value = tab.url;
    run();
  } else {
    emptyState("Chưa có kênh nào", "Mở một kênh hoặc video YouTube rồi bấm extension, hoặc dán link vào ô phía trên.");
    urlInput.focus();
  }
})();
