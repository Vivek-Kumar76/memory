(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const PAGE = 12, PHOTO_PAGE = 8, MAX_BYTES = 5 * 1024 * 1024;
  const state = { q: "", sort: "newest", page: 1, total: 0, loaded: 0, photos: [], photoTotal: 0, config: {} };

  // User text is always inserted with textContent, so it can never run as HTML (XSS-safe).
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const toDate = (iso) => new Date(/Z|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
  const fmtMonth = (iso) => toDate(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const fmtFull = (iso) => toDate(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  async function get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Request failed");
    return { data: await r.json(), total: Number(r.headers.get("X-Total-Count") || 0) };
  }

  /* ---------- Config / header ---------- */
  function applyConfig(c) {
    state.config = c;
    const n = c.name;
    document.title = `In Memory of ${n}`;
    $("#title-name").textContent = n;
    document.querySelectorAll(".js-name").forEach((e) => { e.textContent = n; });
    $("#tagline").textContent = c.tagline || "A beautiful soul \u2022 A cherished friend \u2022 Forever in our hearts";
    $("#quote").textContent = c.quote || "A life may end, but the memories remain.";
    $("#invite").textContent = c.invite || `If you knew him, then share your unexpressed love for ${n}.`;
    $("#foot-name").textContent = `Built with love in memory of ${n}`;
    const img = $("#portrait");
    img.alt = `Portrait of ${n}`;
    img.onerror = () => { img.hidden = true; };
    img.src = c.portrait;
  }

  /* ---------- Two-page routing (#add = Add note page) ---------- */
  function route() {
    const add = location.hash === "#add";
    $("#home").hidden = add;
    $("#add-view").hidden = !add;
    window.scrollTo(0, 0);
    if (add) $("#f-name").focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", route);

  /* ---------- Cards ---------- */
  const photoAlt = (m) => m.photo_caption || `Photo shared by ${m.name}`;

  function noteCard(m) {
    const a = el("article", "card");
    a.appendChild(el("h3", "card-name", m.name));
    const meta = el("div", "card-meta");
    meta.append(el("span", "", m.relationship || "Other"), el("time", "", fmtMonth(m.created_at)));
    a.append(meta, el("p", "card-text", m.memory));
    return a;
  }

  /* ---------- Loaders ---------- */
  async function loadStats() {
    try {
      const { data } = await get("/api/stats");
      $("#count-memories").textContent = data.memory_count;
      $("#count-photos").textContent = data.photo_count;
    } catch { /* keep zeros */ }
  }

  async function loadPhotos(reset) {
    if (reset) state.photos = [];
    const page = Math.floor(state.photos.length / PHOTO_PAGE) + 1;
    try {
      const { data, total } = await get(`/api/photos?page=${page}&limit=${PHOTO_PAGE}`);
      state.photos.push(...data);
      state.photoTotal = total;
    } catch { return; }
    const box = $("#gallery");
    if (reset) box.replaceChildren();
    const start = box.children.length;
    state.photos.slice(start).forEach((m, i) => {
      const idx = start + i;
      const b = el("button", "photo");
      b.type = "button";
      b.setAttribute("aria-label", `View photo shared by ${m.name}`);
      const img = el("img");
      img.src = m.photo_path; img.alt = photoAlt(m); img.loading = "lazy"; img.decoding = "async";
      b.appendChild(img);
      if (m.photo_caption) b.appendChild(el("span", "photo-cap", m.photo_caption));
      b.appendChild(el("span", "photo-by", `by ${m.name}`));
      b.addEventListener("click", () => openLightbox(state.photos, idx, b));
      box.appendChild(b);
    });
    $("#gallery-empty").hidden = state.photos.length > 0;
    $("#more-photos").hidden = state.photos.length >= state.photoTotal;
  }

  async function loadWall(reset) {
    if (reset) { state.page = 1; state.loaded = 0; }
    const params = new URLSearchParams({ q: state.q, sort: state.sort, page: state.page, limit: PAGE });
    let res;
    try { res = await get(`/api/memories?${params}`); }
    catch { $("#wall-status").textContent = "Notes could not be loaded. Please refresh the page."; return; }
    const wall = $("#wall");
    if (reset) wall.replaceChildren();
    res.data.forEach((m) => wall.appendChild(noteCard(m)));
    state.total = res.total;
    state.loaded += res.data.length;
    const empty = $("#wall-empty");
    empty.hidden = state.total > 0;
    if (state.total === 0) empty.textContent = state.q ? "No notes match your search." : "No notes yet. Be the first to add one.";
    $("#wall-status").textContent = state.q ? `${state.total} ${state.total === 1 ? "note" : "notes"} found` : "";
    $("#more").hidden = state.loaded >= state.total;
  }

  /* ---------- Lightbox ---------- */
  const lb = $("#lightbox");
  let lbList = [], lbIdx = 0, lbOpener = null;

  function showLb() {
    const m = lbList[lbIdx];
    const img = $("#lb-img");
    img.src = m.photo_path; img.alt = photoAlt(m);
    $("#lb-cap").textContent = m.photo_caption || "";
    $("#lb-by").textContent = `Shared by ${m.name}`;
    $("#lb-text").textContent = m.memory;
    $("#lb-date").textContent = fmtFull(m.created_at);
    const multi = lbList.length > 1;
    lb.querySelector(".lb-prev").hidden = !multi;
    lb.querySelector(".lb-next").hidden = !multi;
  }
  function openLightbox(list, idx, opener) {
    lbList = list; lbIdx = idx; lbOpener = opener;
    showLb();
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    lb.querySelector(".lb-close").focus();
  }
  function closeLb() {
    lb.hidden = true;
    document.body.style.overflow = "";
    if (lbOpener) lbOpener.focus();
  }
  function stepLb(d) { lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(); }

  lb.querySelector(".lb-close").addEventListener("click", closeLb);
  lb.querySelector(".lb-prev").addEventListener("click", () => stepLb(-1));
  lb.querySelector(".lb-next").addEventListener("click", () => stepLb(1));
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowLeft" && lbList.length > 1) stepLb(-1);
    else if (e.key === "ArrowRight" && lbList.length > 1) stepLb(1);
    else if (e.key === "Tab") {
      const f = [...lb.querySelectorAll("button")].filter((b) => !b.hidden);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Add note form ---------- */
  const form = $("#memory-form"), msg = $("#form-msg"), memoryBox = $("#f-memory");
  memoryBox.addEventListener("input", () => { $("#counter").textContent = `${memoryBox.value.length} / 2000 (at least 20)`; });

  function fail(text, field) {
    msg.textContent = text; msg.className = "form-msg err";
    if (field) { field.closest(".field").classList.add("invalid"); field.focus(); }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.querySelectorAll(".invalid").forEach((n) => n.classList.remove("invalid"));
    msg.textContent = ""; msg.className = "form-msg";
    const name = $("#f-name"), file = $("#f-photo").files[0];
    if (name.value.trim().length < 2) return fail("Enter your name (at least 2 characters).", name);
    if (memoryBox.value.trim().length < 20) return fail("Your note needs at least 20 characters.", memoryBox);
    if (file) {
      if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return fail("Photo must be a JPG, PNG or WEBP file.", $("#f-photo"));
      if (file.size > MAX_BYTES) return fail("Photo must be 10MB or smaller.", $("#f-photo"));
    }
    const btn = $("#submit");
    btn.disabled = true; btn.textContent = "Sending...";
    try {
      const r = await fetch("/api/memories", { method: "POST", body: new FormData(form) });
      if (!r.ok) {
        let d = "Your note could not be saved. Please try again.";
        try { const j = await r.json(); if (typeof j.detail === "string") d = j.detail; } catch {}
        return fail(d);
      }
      form.reset();
      $("#counter").textContent = "0 / 2000 (at least 20)";
      msg.textContent = state.config.thanks || "Thank you for helping keep this memory alive.";
      await Promise.all([loadStats(), loadWall(true), loadPhotos(true)]);
      setTimeout(() => { msg.textContent = ""; location.hash = "home"; }, 1800);
    } catch {
      fail("Connection problem. Check your internet and try again.");
    } finally {
      btn.disabled = false; btn.textContent = "Submit Note";
    }
  });

  /* ---------- Controls ---------- */
  let timer;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value.trim(); loadWall(true); }, 250);
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; loadWall(true); });
  $("#more").addEventListener("click", () => { state.page += 1; loadWall(false); });
  $("#more-photos").addEventListener("click", () => loadPhotos(false));

  /* ---------- Init ---------- */
  route();
  get("/api/config").then(({ data }) => applyConfig(data)).catch(() => {});
  loadStats(); loadPhotos(true); loadWall(true);
})();