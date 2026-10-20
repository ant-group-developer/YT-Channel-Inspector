// Fetches a channel + its recent videos and runs them through parser.js.
(function (root) {
  "use strict";
  const P = typeof module !== "undefined" && module.exports ? require("./parser.js") : root.YTP;
  const BASE = "https://www.youtube.com";

  // credentials:"omit" -> anonymous view, so a YouTube Premium login
  // on this browser doesn't hide the ads we're trying to detect.
  async function get(url) {
    const res = await fetch(url, { credentials: "omit", headers: { "Accept-Language": "en-US,en;q=0.9" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`);
    return res.text();
  }

  async function fetchAbout(channel) {
    if (!channel.aboutToken) throw new Error("Trang kênh không có nút xem thêm");
    const res = await fetch(`${BASE}/youtubei/v1/browse?prettyPrint=false`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Send the viewer's timezone so "Joined" matches what YouTube shows them
        context: { client: {
          clientName: "WEB", clientVersion: channel.cfg.clientVersion, hl: "en",
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          utcOffsetMinutes: -new Date().getTimezoneOffset(),
        } },
        continuation: channel.aboutToken,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const about = P.parseAbout(await res.json());
    if (!about) throw new Error("Không đọc được dữ liệu");
    return about;
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { error: String(e.message || e), videoId: items[i] }; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  async function inspect(url, { videoCount = 5, onProgress = () => {} } = {}) {
    const target = P.classifyUrl(url);
    if (!target) throw new Error("Không phải link kênh hoặc video YouTube");

    let channelPath = target.path;
    if (target.type === "video") {
      onProgress("Đang tìm kênh từ video…");
      const v = P.parseWatchPage(await get(`${BASE}/watch?v=${target.id}`));
      if (!v.channelId) throw new Error("Không tìm được kênh của video này");
      channelPath = `/channel/${v.channelId}`;
    }

    onProgress("Đang tải trang kênh…");
    const channel = P.parseChannelPage(await get(`${BASE}${channelPath}/videos?hl=en`));

    onProgress("Đang tải thông tin giới thiệu…");
    let about = null, aboutError = "";
    try { about = await fetchAbout(channel); } catch (e) { aboutError = String(e.message || e); }

    const ids = channel.videos.slice(0, videoCount).map(v => v.videoId);
    let done = 0;
    onProgress(`Đang phân tích video 0/${ids.length}…`);
    const videos = await mapLimit(ids, 4, async id => {
      const v = P.parseWatchPage(await get(`${BASE}/watch?v=${id}`));
      onProgress(`Đang phân tích video ${++done}/${ids.length}…`);
      return v;
    });

    const ok = videos.filter(v => !v.error);
    return {
      checkedAt: new Date().toISOString(),
      channel,
      about,
      aboutError,
      videos,
      verdict: P.verdict(channel, ok, about),
    };
  }

  const api = { inspect };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YTInspector = api;
})(typeof self !== "undefined" ? self : this);
