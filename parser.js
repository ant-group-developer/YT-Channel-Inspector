// Pure parsing helpers for YouTube channel / watch pages.
// No DOM or chrome.* APIs here so the same file runs in the popup and in Node tests.
(function (root) {
  "use strict";

  // ---------- generic helpers ----------

  // Read one JSON value starting at html[start] (must be '{' or '['),
  // honouring strings so braces inside text don't confuse the scan.
  function sliceJson(html, start) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) return html.slice(start, i + 1);
      }
    }
    return null;
  }

  function extractVar(html, name) {
    const patterns = [`var ${name} = `, `${name} = `, `window["${name}"] = `, `${name}=`];
    for (const p of patterns) {
      const i = html.indexOf(p);
      if (i < 0) continue;
      const start = html.indexOf("{", i + p.length - 1);
      if (start < 0 || start - (i + p.length) > 5) continue;
      const raw = sliceJson(html, start);
      if (!raw) continue;
      try { return JSON.parse(raw); } catch (_) { /* try next pattern */ }
    }
    return null;
  }

  function* findAll(obj, key) {
    const stack = [obj];
    while (stack.length) {
      const o = stack.pop();
      if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) stack.push(o[i]); }
      else if (o && typeof o === "object") {
        if (Object.prototype.hasOwnProperty.call(o, key)) yield o[key];
        const vals = Object.values(o);
        for (let i = vals.length - 1; i >= 0; i--) stack.push(vals[i]);
      }
    }
  }

  function findFirst(obj, key) {
    for (const v of findAll(obj, key)) return v;
    return undefined;
  }

  function text(t) {
    if (t == null) return "";
    if (typeof t === "string") return t;
    if (t.simpleText) return t.simpleText;
    if (t.content) return t.content;
    if (Array.isArray(t.runs)) return t.runs.map(r => r.text).join("");
    return "";
  }

  function ytcfg(html) {
    const get = k => (html.match(new RegExp(`"${k}":"([^"]+)"`)) || [])[1];
    return {
      apiKey: get("INNERTUBE_API_KEY"),
      clientVersion: get("INNERTUBE_CLIENT_VERSION") || "2.20260101.00.00",
      visitorData: get("VISITOR_DATA"),
    };
  }

  // ---------- channel page ----------

  function parseChannelPage(html) {
    const d = extractVar(html, "ytInitialData");
    if (!d) throw new Error("Không đọc được ytInitialData của kênh");
    const meta = (d.metadata && d.metadata.channelMetadataRenderer) || {};
    const micro = (d.microformat && d.microformat.microformatDataRenderer) || {};
    const header = d.header || {};

    const rows = [];
    for (const r of findAll(header, "metadataParts")) for (const p of r) rows.push(text(p.text));
    const handle = rows.find(s => s.startsWith("@")) || "";
    const subscribers = rows.find(s => /subscriber/i.test(s)) || "";
    const videoCount = rows.find(s => /video/i.test(s)) || "";

    const titleLabel = text(findFirst(header, "accessibilityContext") && findFirst(header, "accessibilityContext").label);
    const verified = /verified/i.test(titleLabel) || /CHECK_CIRCLE|OFFICIAL_ARTIST_BADGE/.test(JSON.stringify(header.pageHeaderRenderer && header.pageHeaderRenderer.content && header.pageHeaderRenderer.content.pageHeaderViewModel && header.pageHeaderRenderer.content.pageHeaderViewModel.title || {}));
    const artist = /OFFICIAL_ARTIST_BADGE|AUDIO_BADGE/.test(JSON.stringify(header));

    const buttonTitles = [];
    for (const b of findAll(header, "buttonViewModel")) if (b && b.title) buttonTitles.push(b.title);
    const hasJoinButton = buttonTitles.some(t => /^join$/i.test(t)) || findFirst(header, "sponsorButton") !== undefined;

    const tabs = [];
    const tabList = (((d.contents || {}).twoColumnBrowseResultsRenderer || {}).tabs) || [];
    for (const t of tabList) {
      const r = t.tabRenderer || t.expandableTabRenderer;
      if (r && r.title) tabs.push(r.title);
    }

    let aboutToken = null;
    for (const c of findAll(header, "continuationCommand")) { if (c && c.token) { aboutToken = c.token; break; } }

    const avatarVm = findFirst(header, "decoratedAvatarViewModel");
    const avatarSources = (avatarVm && findFirst(avatarVm, "sources")) || (meta.avatar && meta.avatar.thumbnails) || [];
    const avatar = avatarSources.length ? avatarSources[avatarSources.length - 1].url : "";

    const banner = findFirst(header, "imageBannerViewModel");
    const bannerUrl = banner && banner.image && banner.image.sources && banner.image.sources.length
      ? banner.image.sources[0].url : "";

    const videos = [];
    const seen = new Set();
    for (const v of findAll(d, "videoRenderer")) {
      if (!v || !v.videoId || seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      videos.push({
        videoId: v.videoId,
        title: text(v.title),
        views: text(v.viewCountText),
        published: text(v.publishedTimeText),
        length: text(v.lengthText),
        membersOnly: JSON.stringify(v.badges || []).includes("MEMBERS_ONLY"),
      });
    }
    // Newer layout: richItemRenderer -> lockupViewModel
    for (const l of findAll(d, "lockupViewModel")) {
      if (!l || !l.contentId || l.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO" || seen.has(l.contentId)) continue;
      seen.add(l.contentId);
      const md = (l.metadata && l.metadata.lockupMetadataViewModel) || {};
      const parts = [];
      for (const r of findAll(md, "metadataParts")) for (const p of r) parts.push(text(p.text));
      const badge = findFirst(l.contentImage || {}, "thumbnailBadgeViewModel");
      const lStr = JSON.stringify(l.contentImage || {});
      videos.push({
        videoId: l.contentId,
        title: text(md.title),
        views: parts[0] || "",
        published: parts[1] || "",
        length: badge ? badge.text : "",
        membersOnly: /MEMBERS_ONLY|Members only/i.test(lStr),
      });
    }

    return {
      channelId: meta.externalId || "",
      title: meta.title || "",
      handle,
      subscribers,
      videoCount,
      verified,
      artist,
      description: meta.description || "",
      keywords: meta.keywords || "",
      rssUrl: meta.rssUrl || "",
      vanityUrl: meta.vanityChannelUrl || "",
      avatar,
      bannerUrl,
      isFamilySafe: micro.familySafe,
      availableCountries: (micro.availableCountries || []).length,
      tabs,
      hasStoreTab: tabs.some(t => /store/i.test(t)),
      hasMembershipTab: tabs.some(t => /membership/i.test(t)),
      hasJoinButton,
      hasMerchShelf: findFirst(d, "merchandiseShelfRenderer") !== undefined,
      aboutToken,
      videos,
      cfg: ytcfg(html),
    };
  }

  // ---------- "About" panel (youtubei/v1/browse continuation) ----------

  function parseAbout(json) {
    const a = findFirst(json, "aboutChannelViewModel");
    if (!a) return null;
    const links = [];
    for (const l of a.links || []) {
      const vm = l.channelExternalLinkViewModel;
      if (vm) links.push({ title: text(vm.title), url: text(vm.link) });
    }
    return {
      url: a.displayCanonicalChannelUrl || (a.canonicalChannelUrl || "").replace(/^https?:\/\//, ""),
      description: a.description || "",
      country: a.country || "",
      joined: text(a.joinedDateText).replace(/^Joined\s*/i, ""),
      views: a.viewCountText || "",
      videos: a.videoCountText || "",
      subscribers: a.subscriberCountText || "",
      hasBusinessEmail: !!a.signInForBusinessEmail || !!a.businessEmailRevealButton,
      links,
    };
  }

  // ---------- watch page ----------

  function placementKind(kind) {
    if (/START/.test(kind)) return "pre";
    if (/END/.test(kind)) return "post";
    return "mid";
  }

  function parseWatchPage(html) {
    const pr = extractVar(html, "ytInitialPlayerResponse");
    if (!pr) throw new Error("Không đọc được ytInitialPlayerResponse");
    const d = extractVar(html, "ytInitialData") || {};
    const vd = pr.videoDetails || {};
    const mf = (pr.microformat && pr.microformat.playerMicroformatRenderer) || {};

    const placements = [];
    for (const ap of pr.adPlacements || []) {
      const r = ap.adPlacementRenderer || {};
      const cfg = (r.config && r.config.adPlacementConfig) || {};
      const off = cfg.adTimeOffset || {};
      placements.push({
        kind: placementKind(cfg.kind || ""),
        rawKind: cfg.kind || "",
        offsetMs: Number(off.offsetStartMilliseconds || 0),
        renderer: Object.keys(r.renderer || {})[0] || "",
      });
    }
    const adCounts = { pre: 0, mid: 0, post: 0 };
    for (const p of placements) adCounts[p.kind]++;

    const products = [];
    for (const m of findAll(d, "merchandiseItemRenderer")) {
      const ep = findFirst(m.buttonCommand || {}, "urlEndpoint");
      const url = (ep && ep.url) || (m.description && /\./.test(m.description) ? "https://" + m.description : "");
      products.push({
        title: m.title || "",
        price: m.price || "",
        vendor: m.vendorName || "",
        url,
        affiliate: /utm_medium=affiliate|gads_t_sig|aff_|affiliate/i.test(url),
        thumbnail: (m.thumbnail && m.thumbnail.thumbnails && m.thumbnail.thumbnails.length)
          ? m.thumbnail.thumbnails[m.thumbnail.thumbnails.length - 1].url : "",
      });
    }

    const dStr = JSON.stringify(d);
    let likes = "";
    const likeVm = findFirst(d, "likeButtonViewModel");
    if (likeVm) {
      const title = findFirst(likeVm, "title");
      if (typeof title === "string") likes = title;
    }
    const commentsText = (dStr.match(/"commentCount":\{"simpleText":"([^"]+)"/) || [])[1]
      || text(findFirst(findFirst(d, "commentsEntryPointHeaderRenderer") || {}, "commentCount"));

    return {
      videoId: vd.videoId || "",
      title: vd.title || "",
      channelId: vd.channelId || mf.externalChannelId || "",
      author: vd.author || "",
      lengthSeconds: Number(vd.lengthSeconds || 0),
      views: Number(vd.viewCount || 0),
      isLive: !!vd.isLiveContent,
      keywords: vd.keywords || [],
      category: mf.category || "",
      publishDate: mf.publishDate || mf.uploadDate || "",
      isFamilySafe: mf.isFamilySafe,
      isUnlisted: !!mf.isUnlisted,
      isShortsEligible: !!mf.isShortsEligible,
      availableCountries: (mf.availableCountries || []).length,
      playable: (pr.playabilityStatus && pr.playabilityStatus.status) || "",
      embeddable: !!(pr.playabilityStatus && pr.playabilityStatus.playableInEmbed),
      ads: {
        placements,
        counts: adCounts,
        total: placements.length,
        heartbeat: !!pr.adBreakHeartbeatParams,
        playerAds: Array.isArray(pr.playerAds) ? pr.playerAds.length : 0,
        adSlots: Array.isArray(pr.adSlots) ? pr.adSlots.length : 0,
      },
      paidPromotion: findFirst(pr, "paidContentOverlayRenderer") !== undefined
        || findFirst(d, "paidContentOverlayRenderer") !== undefined,
      products,
      hasProductsOverlay: findFirst(d, "productsInVideoOverlayRenderer") !== undefined,
      hasJoinButton: findFirst(d, "membershipButton") !== undefined || /"label":"Join this channel"/.test(html),
      membersOnly: /MEMBERS_ONLY/.test(dStr) && /members only|members-only/i.test(dStr),
      superThanks: /"(?:text|title|content)":"Thanks"/.test(dStr) || /superThanksButton|SUPER_THANKS/i.test(dStr),
      likes,
      comments: commentsText || "",
    };
  }

  // ---------- URL helpers ----------

  function classifyUrl(raw) {
    let u;
    try { u = new URL(raw); } catch (_) { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return { type: "video", id: u.pathname.slice(1, 12) };
    if (host !== "youtube.com" && host !== "music.youtube.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.pathname === "/watch" && u.searchParams.get("v")) return { type: "video", id: u.searchParams.get("v") };
    if (parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") {
      if (parts[1]) return { type: "video", id: parts[1] };
    }
    if (parts[0] && parts[0].startsWith("@")) return { type: "channel", path: "/" + parts[0] };
    if (["channel", "c", "user"].includes(parts[0]) && parts[1]) return { type: "channel", path: `/${parts[0]}/${parts[1]}` };
    return null;
  }

  // ---------- verdict ----------

  // "2.92M subscribers" -> 2920000, "18,849 views" -> 18849
  function parseCount(s) {
    const m = String(s || "").match(/([\d.,]+)\s*([KMB])?/i);
    if (!m) return null;
    if (m[2]) return parseFloat(m[1].replace(/,/g, "")) * { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()];
    return Number(m[1].replace(/[.,]/g, ""));
  }

  // Lowest YPP tier (fan funding) needs 500 subscribers; ad revenue needs 1,000.
  const YPP_MIN_SUBS = 500;

  // status:
  //   "on"     - Join button or Shopping found: both require YPP, so the channel is monetized
  //   "likely" - only ads, channel is big enough for YPP
  //   "yt"     - ads, but channel is below YPP minimum: YouTube runs its own ads and keeps the revenue
  //   "off"    - no signal
  function verdict(channel, videos, about) {
    const withAds = videos.filter(v => v.ads.total > 0 || v.ads.heartbeat).length;
    const products = videos.reduce((n, v) => n + v.products.length, 0);
    const join = channel.hasJoinButton || videos.some(v => v.hasJoinButton);
    const subs = parseCount((about && about.subscribers) || channel.subscribers);

    const signals = [];
    if (withAds) signals.push(`${withAds}/${videos.length} video có vị trí quảng cáo`);
    if (join) signals.push("Kênh có nút Hội viên (Join)");
    if (products) signals.push(`${products} sản phẩm YouTube Shopping`);
    if (channel.hasStoreTab) signals.push("Kênh có tab Store");

    let status = "off";
    if (join || products > 0 || channel.hasStoreTab) status = "on";
    else if (withAds && subs != null && subs < YPP_MIN_SUBS) status = "yt";
    else if (withAds) status = "likely";

    return {
      status,
      monetized: status === "on" || status === "likely",
      subs,
      withAds,
      signals,
      sampled: videos.length,
    };
  }

  const api = {
    sliceJson, extractVar, findAll, findFirst, text, ytcfg, parseCount, YPP_MIN_SUBS,
    parseChannelPage, parseAbout, parseWatchPage, classifyUrl, verdict,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YTP = api;
})(typeof self !== "undefined" ? self : this);
