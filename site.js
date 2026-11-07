// شجرة الضفيان — الواجهة الجديدة
// الشجرة، البحث، صلة القرابة، الطلبات، ولوحة الإدارة (مدراء بصلاحيات، مشرفو فروع، سجل كامل)
"use strict";

/* ====================== أدوات عامة ====================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AR = (n) => Number(n || 0).toLocaleString("ar-SA");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const norm = (s) => (s || "").normalize("NFKD").replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ«»]/g, "")
  .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/عبد\s+/g, "عبد").trim().toLowerCase();
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const OWNERS = ["+966552806075", "+16505553434"];            // المدير العام (ثابت، مطابق لقواعد الحماية)
const PERMS = { review: "قبول ورفض الإضافات والتعديلات", edit: "التعديل المباشر على الشجرة", roles: "إضافة المدراء والمشرفين وتحديد صلاحياتهم", logs: "مشاهدة السجل والإحصائيات" };
const ICON = {
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8 15.7 6.4M8.3 13.2l7.4 4.4"/></svg>',
  add: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  rel: '<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><circle cx="12" cy="5" r="2.5"/><path d="M12 7.5v4M6 15.5V13h12v2.5"/></svg>',
  me: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
};
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2800); }
async function copyText(s, msg = "تم النسخ") {
  try { await navigator.clipboard.writeText(s); toast(msg); return true; }
  catch (e) { const ta = document.createElement("textarea"); ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(msg); return true; } catch (e2) { toast("تعذر النسخ في هذا المتصفح"); return false; } finally { ta.remove(); } }
}
const fmtTime = (d) => { if (!d) return ""; const x = d.toDate ? d.toDate() : new Date(d);
  return x.toLocaleString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
const today = (off = 0) => { const d = new Date(Date.now() - off * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const phoneE164 = (s) => { let x = String(s || "").replace(/[^\d+]/g, ""); if (x.startsWith("00")) x = "+" + x.slice(2);
  if (/^05\d{8}$/.test(x)) x = "+966" + x.slice(1); else if (/^5\d{8}$/.test(x)) x = "+966" + x; else if (/^966\d{9}$/.test(x)) x = "+" + x;
  return /^\+\d{8,15}$/.test(x) ? x : ""; };

/* ====================== البيانات ====================== */
let P = new Map(), ROOT = null, ALL = [], IDX = [];
function setPeople(rows) {
  P = new Map();
  rows.forEach((r) => P.set(r.id, { ...r, parent: r.parent || "", kids: [] }));
  ROOT = null;
  P.forEach((p) => { if (p.parent && P.has(p.parent)) P.get(p.parent).kids.push(p); else if (!p.parent && !ROOT) ROOT = p; });
  const sortKey = (id) => { const m = /^P(\d+)$/.exec(id); return m ? +m[1] : 1e9; };
  P.forEach((p) => p.kids.sort((a, b) => sortKey(a.id) - sortKey(b.id) || String(a.id).localeCompare(b.id)));
  (function walk(p, d) { p.depth = d; p.kids.forEach((c) => walk(c, d + 1)); p.desc = p.kids.reduce((n, c) => n + 1 + c.desc, 0); })(ROOT, 0);
  ALL = [...P.values()];
  IDX = ALL.map((p) => ({ p, t: chain(p).map((x) => norm(dn(x))) }));
}
const dn = (p) => (p === ROOT ? "ضفي" : String(p.name || "").replace(/\s*«.*?»\s*/g, "").trim() || p.name);
const chain = (p) => { const a = []; while (p) { a.push(p); p = P.get(p.parent); } return a; };
const lineage = (p) => chain(p).map((x) => (x === ROOT ? x.name : dn(x))).join(" بن ");
const fullName = (p) => chain(p).map(dn).join(" بن ") + " الضفيان";
const pathIds = (p) => chain(p).slice(1).reverse().map((x) => x.id);          // الأجداد من الأصل إلى الأب
const scopeOf = (p) => [...pathIds(p), p.id];
const sonsTxt = (n) => (n === 0 ? "لا أبناء مسجلون" : n === 1 ? "ابن واحد" : n === 2 ? "ابنان" : n <= 10 ? `${AR(n)} أبناء` : `${AR(n)} ابنًا`);

/* ====================== Firebase (يُحمَّل بأمان؛ الموقع يعمل حتى لو تعذّر) ====================== */
const CFG = { apiKey: "AIzaSyCw0GNrUYIvwPYY5LpCgnuFYi7a903qAuE", authDomain: "aldhfyantree-f3273.firebaseapp.com", projectId: "aldhfyantree-f3273",
  storageBucket: "aldhfyantree-f3273.firebasestorage.app", messagingSenderId: "436236972378", appId: "1:436236972378:web:e57101eeb8c3b41a2b8363" };
let F = null, db = null, auth = null, user = null, profile = null, myRole = null, ROLES = [], PENDING = [], authReady = false;
async function initFirebase() {
  try {
    const V = "https://www.gstatic.com/firebasejs/12.2.1/";
    const [a, f, u] = await Promise.all([import(V + "firebase-app.js"), import(V + "firebase-firestore.js"), import(V + "firebase-auth.js")]);
    F = { ...f, ...u };
    const app = a.initializeApp(CFG); db = f.getFirestore(app); auth = u.getAuth(app); auth.languageCode = "ar";
    return true;
  } catch (e) { console.warn("Firebase unavailable", e); return false; }
}
const ref = (...p) => F.doc(db, ...p);
const col = (c) => F.collection(db, c);
const isOwner = () => !!user && OWNERS.includes(user.phoneNumber);
const can = (perm) => isOwner() || (myRole?.kind === "admin" && !!myRole.perms?.[perm]);
const isStaff = () => isOwner() || !!myRole;
const isMod = () => myRole?.kind === "mod";

/* ---------- السجل والإحصائيات ---------- */
const DEVICE = store.get("dhf-dev") || (() => { const d = Math.random().toString(36).slice(2, 10); store.set("dhf-dev", d); return d; })();
const LOGT = { visit: "زيارة", share: "مشاركة", copy: "نسخ نسب", login: "تسجيل دخول", register: "تسجيل جديد", request: "طلب جديد",
  approve: "قبول طلب", reject: "رفض طلب", edit: "تعديل مباشر", add: "إضافة مباشرة", role: "صلاحيات", tool: "أداة إدارية" };
async function logEvent(type, extra = {}) {
  if (!db) return;
  const d = { type, at: F.serverTimestamp(), device: DEVICE };
  if (user) { d.uid = user.uid; d.phone = user.phoneNumber || ""; d.name = profile?.name || ""; }
  for (const k of ["page", "personId", "personName", "detail"]) if (extra[k]) d[k] = String(extra[k]).slice(0, 500);
  try { await F.setDoc(F.doc(col("logs")), d); } catch (e) { console.warn("log", type, e.code || e); }
  try { const day = today(); await F.setDoc(ref("stats", `${day}_${type}`), { day, type, count: F.increment(1) }, { merge: true }); } catch (e) {}
}

/* ====================== الواجهة العامة ====================== */
let tab = "tree";
function setTab(t, push = true) {
  tab = t; document.body.classList.toggle("admin-on", t === "admin");
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  $$(".view").forEach((v) => v.classList.toggle("on", v.id === "v-" + t));
  if (t !== "tree") clearSel();
  if (t === "printed") openPrinted();
  if (t === "numbers") renderNumbers();
  if (t === "admin") renderAdmin();
  if (push) history.replaceState(null, "", t === "tree" ? location.pathname + location.search : "#" + t);
  if (t === "tree" && C) requestAnimationFrame(() => chartGens(d3.zoomTransform(C.svg.node())));
}
$$(".tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

/* حجم الخط */
function setFS(n) { document.documentElement.dataset.fs = n; store.set("dhf-fs", n); }
setFS(store.get("dhf-fs") || "1");

/* النافذة السفلية العامة */
let sheetClose = null;
function openSheet(title, html, onClose) {
  const s = $("#sheet");
  s.innerHTML = `<div class="shead"><h2>${title}</h2><button class="xbtn" data-x aria-label="إغلاق">×</button></div>${html}`;
  $("#sheetBg").classList.add("open"); sheetClose = onClose || null; closeDrawer();
  $("[data-x]", s).onclick = closeSheet; return s;
}
function closeSheet() { $("#sheetBg").classList.remove("open"); $("#sheet").innerHTML = ""; const f = sheetClose; sheetClose = null; f && f(); }
$("#sheetBg").addEventListener("click", (e) => { if (e.target.id === "sheetBg") closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if ($("#sheetBg").classList.contains("open")) closeSheet(); else if ($("#drawer").classList.contains("open")) closeDrawer(); else clearSel(); } });

/* ====================== الشجرة ====================== */
let C = null, sel = null, pathSet = new Set();
const CW = 116, CH = 42, CDY = 104, CGAP = 12;
const clinkPath = (s, t) => { const y1 = -s.y - CH / 2 - 6, y2 = -t.y + CH / 2, m = (y1 + y2) / 2; return `M${-s.x},${y1}C${-s.x},${m} ${-t.x},${m} ${-t.x},${y2}`; };
function buildChart(keepOpen) {
  const svg = d3.select("#chartSvg"); svg.selectAll("*").remove();
  const root = d3.hierarchy(ROOT, (p) => p.kids), nodes = root.descendants();
  nodes.forEach((d) => { d._children = d.children; d.children = null; });
  const zl = svg.append("g"), gGrid = zl.append("g").attr("class", "cgrid"), gLink = zl.append("g"), gNode = zl.append("g");
  const gens = svg.append("g").attr("class", "cgens");
  const zoom = d3.zoom().scaleExtent([0.12, 2.6]).clickDistance(10).on("zoom", (e) => { zl.attr("transform", e.transform); chartGens(e.transform); });
  svg.call(zoom).on("dblclick.zoom", null);
  root.x0 = 0; root.y0 = 0;
  C = { svg, gens, zl, gGrid, gLink, gNode, zoom, root, maxD: 1,
    layout: d3.tree().nodeSize([CW + CGAP, CDY]).separation((a, b) => (a.parent === b.parent ? 1 : 1.2)),
    byId: new Map(nodes.map((d) => [d.data.id, d])) };
  root.children = root._children;
  if (keepOpen) keepOpen.forEach((id) => { const d = C.byId.get(id); if (d && d._children) d.children = d._children; });
  chartUpdate(root, 0);
  svg.call(zoom.transform, chartHome());
}
const openIds = () => (C ? C.root.descendants().filter((d) => d.children).map((d) => d.data.id) : []);
function chartHome() {
  const el = $("#v-tree"), w = el.clientWidth || 360, h = el.clientHeight || 600, nodes = C.root.descendants();
  const minX = d3.min(nodes, (d) => -d.x) - CW / 2, maxX = d3.max(nodes, (d) => -d.x) + CW / 2;
  const k = Math.max(0.35, Math.min(1.1, (w - 40) / (maxX - minX)));
  const th = (d3.max(nodes, (d) => d.depth) * CDY + CH) * k;
  return d3.zoomIdentity.translate(w / 2 - (k * (minX + maxX)) / 2, Math.min(h - 70, h / 2 + th / 2)).scale(k);
}
function chartUpdate(source, dur = 350) {
  const { root, gNode, gLink, gGrid } = C;
  C.layout(root);
  const nodes = root.descendants(), links = root.links(), t = C.svg.transition("lay").duration(dur), maxD = d3.max(nodes, (d) => d.depth);
  gGrid.selectAll("*").remove();
  for (let i = 0; i <= maxD; i++) gGrid.append("line").attr("x1", -9000).attr("x2", 9000).attr("y1", -i * CDY).attr("y2", -i * CDY);
  C.maxD = maxD; chartGens(d3.zoomTransform(C.svg.node()));
  const node = gNode.selectAll("g.cn").data(nodes, (d) => d.data.id);
  const en = node.enter().append("g").attr("class", "cn").attr("opacity", 0).attr("transform", `translate(${-source.x0},${-source.y0})`)
    .attr("tabindex", 0).attr("role", "button").on("click", (e, d) => chartClick(d))
    .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chartClick(d); } });
  en.append("rect").attr("x", -CW / 2).attr("y", -CH / 2).attr("width", CW).attr("height", CH).attr("rx", 12);
  en.append("rect").attr("class", "cap").attr("x", -CW / 2 + 10).attr("y", CH / 2 - 4).attr("width", CW - 20).attr("height", 3).attr("rx", 1.5);
  en.append("text").attr("class", "nm").attr("dy", "0.36em").attr("text-anchor", "middle")
    .attr("font-size", (d) => Math.min(16, (CW - 14) / (dn(d.data).length * 0.6))).text((d) => dn(d.data));
  const bd = en.append("g").attr("class", "badge").attr("transform", `translate(0,${-CH / 2 - 3})`);
  bd.append("rect").attr("x", -17).attr("y", -10).attr("width", 34).attr("height", 20).attr("rx", 10);
  bd.append("text").attr("dy", "0.36em").attr("text-anchor", "middle");
  const all = node.merge(en);
  all.attr("aria-label", (d) => dn(d.data) + (d._children ? `، ${sonsTxt(d._children.length)}` : "")).classed("has", (d) => !!d._children);
  all.select(".badge").style("display", (d) => (d._children ? null : "none")).select("text").text((d) => (d.children ? "−" : d._children ? "+" + AR(d._children.length) : ""));
  all.transition(t).attr("opacity", 1).attr("transform", (d) => `translate(${-d.x},${-d.y})`);
  node.exit().transition(t).attr("opacity", 0).attr("transform", `translate(${-source.x},${-source.y})`).remove();
  const link = gLink.selectAll("path").data(links, (d) => d.target.data.id), o = { x: source.x0, y: source.y0 };
  const le = link.enter().append("path").attr("class", "clk").attr("d", clinkPath(o, o));
  link.merge(le).transition(t).attr("d", (d) => clinkPath(d.source, d.target));
  link.exit().transition(t).attr("d", clinkPath(source, source)).remove();
  nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
  chartMarks();
}
function chartClick(d) {
  $("#hint")?.remove(); store.set("dhf-hint", "1");
  const bx = -d.x, by = -d.y;
  if (d._children) d.children = d.children ? null : d._children;
  select(d.data.id, false);
  chartUpdate(d);
  C.svg.transition("pan").duration(350).call(C.zoom.translateBy, bx + d.x, by + d.y);
}
function chartReveal(id) {
  const d = C.byId.get(id); if (!d) return;
  d.ancestors().slice(1).forEach((a) => (a.children = a._children));
  chartUpdate(C.root);
  const el = $("#v-tree"), pph = document.body.classList.contains("has-pp") && innerWidth < 900 ? $("#pp").offsetHeight : 0;
  C.svg.transition("pan").duration(500).call(C.zoom.translateTo, -d.x, -d.y, [el.clientWidth / 2, (el.clientHeight - pph) / 2]);
}
function chartMarks() {
  if (!C) return;
  C.gNode.selectAll("g.cn").classed("onpath", (d) => pathSet.has(d.data.id)).classed("sel", (d) => d.data.id === sel).classed("me", (d) => d.data.id === ME);
  C.gLink.selectAll("path").classed("onpath", (d) => pathSet.has(d.target.data.id));
}
function chartGens(tr) {
  if (!C) return;
  const w = $("#v-tree").clientWidth;
  C.gens.selectAll("text").data(d3.range(C.maxD + 1)).join("text").attr("x", w - 10).attr("text-anchor", "start").attr("dy", "0.35em")
    .attr("y", (i) => tr.y - tr.k * i * CDY - (CH / 2 + 14) * tr.k).text((i) => "الجيل " + AR(i + 1));
}
$("#zIn").onclick = () => C.svg.transition().call(C.zoom.scaleBy, 1.3);
$("#zOut").onclick = () => C.svg.transition().call(C.zoom.scaleBy, 1 / 1.3);
$("#zHome").onclick = () => { clearSel(); C.root.descendants().forEach((d) => { if (d.depth >= 1) d.children = null; }); C.root.children = C.root._children; chartUpdate(C.root); C.svg.transition().duration(450).call(C.zoom.transform, chartHome()); };
if (store.get("dhf-hint")) $("#hint")?.remove();

/* ====================== بطاقة الشخص ====================== */
function select(id, reveal) {
  const p = P.get(id); if (!p) return;
  if (tab !== "tree") setTab("tree");
  sel = id; pathSet = new Set(chain(p).map((x) => x.id));
  renderPanel();
  if (C) { if (reveal) chartReveal(id); chartMarks(); }
}
function clearSel() { sel = null; pathSet = new Set(); document.body.classList.remove("has-pp"); chartMarks(); }
function renderPanel() {
  const p = sel && P.get(sel), el = $("#pp");
  document.body.classList.toggle("has-pp", !!p);
  if (!p) return;
  const rm = relToMe(p.id), info = [["الميلاد", p.birthDate], ["الوفاة", p.deathDate], ["العمل أو المنصب", p.position], ["المدينة", p.city], ["ملاحظة", p.note]].filter((x) => x[1]);
  el.innerHTML = `<div class="pp-head"><div class="pp-name">${esc(fullName(p))}
      <div class="pp-meta">الجيل ${AR(p.depth + 1)} · ${sonsTxt(p.kids.length)}${p.desc > p.kids.length ? ` · ${AR(p.desc)} من الذرية` : ""}</div>
      ${rm ? `<span class="pp-rel">${esc(rm)}</span>` : ""}</div>
      <button class="xbtn" data-a="close" aria-label="إغلاق">×</button></div>
    ${info.length ? `<div class="pp-more"><dl>${info.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>` : ""}
    <div class="acts">
      <button data-a="copy">${ICON.copy}نسخ النسب</button>
      <button data-a="share">${ICON.share}مشاركة</button>
      <button data-a="son">${ICON.add}إضافة ابن</button>
      <button data-a="fix">${ICON.edit}${can("edit") ? "تعديل" : "اقتراح تعديل"}</button>
    </div>`;
  requestAnimationFrame(() => document.documentElement.style.setProperty("--pph", el.offsetHeight + "px"));
}
$("#pp").onclick = (e) => {
  const a = e.target.closest("[data-a]")?.dataset.a, p = sel && P.get(sel); if (!a || !p) return;
  if (a === "close") clearSel();
  else if (a === "copy") { copyText(fullName(p), "تم نسخ النسب كاملاً"); logEvent("copy", { personId: p.id, personName: fullName(p) }); }
  else if (a === "share") sharePerson(p);
  else if (a === "son") openRequest("addChild", p);
  else if (a === "fix") openRequest("update", p);
};
const siteUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");
async function sharePerson(p) {
  const url = `${siteUrl()}?p=${encodeURIComponent(p.id)}`, text = `${fullName(p)}\nمن شجرة عائلة الضفيان`;
  logEvent("share", { personId: p.id, personName: fullName(p) });
  if (navigator.share) { try { await navigator.share({ title: "شجرة الضفيان", text, url }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  copyText(`${text}\n${url}`, "تم نسخ الرابط، ألصقه في الواتساب");
}
async function shareSite() {
  const url = siteUrl(), text = "شجرة عائلة الضفيان: ابحث عن اسمك واعرف نسبك كاملاً وصلة قرابتك";
  logEvent("share", { page: "site" });
  if (navigator.share) { try { await navigator.share({ title: "شجرة الضفيان", text, url }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  copyText(`${text}\n${url}`, "تم نسخ رابط الموقع");
}

/* ====================== البحث ====================== */
function search(q) {
  const toks = norm(q).split(/\s+/).filter((x) => x && !["بن", "ابن", "الضفيان", "ال"].includes(x));
  if (!toks.length) return null;
  return IDX.filter((e) => toks.every((t, i) => e.t[i] && e.t[i].startsWith(t))).sort((a, b) => a.p.depth - b.p.depth).slice(0, 40).map((e) => e.p);
}
const resHTML = (r) => !r ? `<p class="muted center">اكتب الاسم ثم اسم الأب، مثل: «سعد محمد»</p>` : r.length
  ? r.map((p) => `<button class="res" data-id="${p.id}"><b>${esc(dn(p))}</b><small>${esc(chain(p).slice(1).map((x) => "بن " + dn(x)).join(" "))} · الجيل ${AR(p.depth + 1)}</small></button>`).join("")
  : `<p class="empty">لا توجد نتائج. جرّب الاسم ثم اسم الأب.</p>`;
// نافذة بحث تُستخدم للبحث العام ولاختيار شخص
function pickPerson(title, onPick, hint = "") {
  const s = openSheet(title, `${hint ? `<p class="muted" style="margin:0 0 8px">${hint}</p>` : ""}<div class="search-in"><input class="inp" id="sq" type="search" placeholder="اكتب الاسم ثم اسم الأب…" autocomplete="off" enterkeyhint="search"></div><div class="results" id="sr">${resHTML(null)}</div>`);
  const q = $("#sq", s), r = $("#sr", s);
  q.oninput = () => (r.innerHTML = resHTML(search(q.value)));
  r.onclick = (e) => { const b = e.target.closest("[data-id]"); if (b) { closeSheet(); onPick(P.get(b.dataset.id)); } };
  setTimeout(() => q.focus(), 80);
}
$("#bSearch").onclick = () => pickPerson("البحث عن اسم", (p) => select(p.id, true));

/* ====================== أنا، وصلة القرابة ====================== */
let ME = null;
function setMe(id, save = true) {
  ME = id && P.has(id) ? id : null; store.set("dhf-me", ME);
  if (save && user && db && profile) { profile.personId = ME || ""; F.setDoc(ref("profiles", user.uid), { personId: ME || "" }, { merge: true }).catch(() => {}); }
  chartMarks(); renderPanel();
}
const ORD = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة"];
function relate(a, b) {
  const A = P.get(a), B = P.get(b), ca = chain(A), idx = new Map(ca.map((x, i) => [x.id, i])), cb = chain(B);
  const down = cb.findIndex((x) => idx.has(x.id)), common = cb[down], up = idx.get(common.id);
  return { A, B, common, up, down, ca: ca.slice(0, up + 1).reverse(), cb: cb.slice(0, down + 1).reverse() };
}
function relLabel(up, down, you) {   // ما يكون «ب» بالنسبة لـ«أ»
  const h = you ? "ك" : "ه", abi = you ? "أبيك" : "أبيه", akh = you ? "أخيك" : "أخيه";
  if (!up && !down) return you ? "أنت" : "نفس الشخص";
  if (!up) return down === 1 ? "ابن" + h : down === 2 ? "حفيد" + h : "من ذريت" + h;
  if (!down) return up === 1 ? (you ? "أبوك" : "أبوه") : up === 2 ? "جد" + h : up === 3 ? "جد " + abi : "من أجداد" + h;
  if (up === 1 && down === 1) return you ? "أخوك" : "أخوه";
  if (up === 1) return down === 2 ? "ابن " + akh : "من ذرية " + akh;
  if (down === 1) return up === 2 ? "عم" + h : up === 3 ? "عم " + abi : "من أعمام أجداد" + h;
  if (up === down) return up === 2 ? "ابن عم" + h : `ابن عم${h} من الدرجة ${ORD[up - 1] || AR(up - 1)}`;
  if (up === 2) return down === 3 ? "ابن ابن عم" + h : "من ذرية عم" + h;
  if (up === 3 && down === 2) return "ابن عم " + abi;
  return "من أبناء عمومت" + h;
}
const relToMe = (id) => (!ME || !P.has(ME) ? "" : id === ME ? "هذا أنت" : relLabel(...(({ up, down }) => [up, down])(relate(ME, id)), true));
function openRel(a = ME, b = null) {
  const slot = (k, id, label) => `<button class="pick${id ? " set" : ""}" data-slot="${k}">${id ? `<b>${esc(dn(P.get(id)))}</b><br><small>${esc(lineage(P.get(id)))}</small>` : label}</button>`;
  let res = "";
  if (a && b) {
    const r = relate(a, b), you = a === ME, lab = relLabel(r.up, r.down, you), nB = dn(r.B);
    const show = (arr) => arr.map((x, i) => `${i ? "<i></i>" : ""}<span class="${x === r.common ? "c" : ""}">${esc(dn(x))}</span>`).join("");
    res = a === b ? `<p class="note">اخترت نفس الشخص مرتين.</p>` : `<div class="relbox"><div class="muted">${esc(nB)} بالنسبة ${you ? "لك" : "لـ" + esc(dn(r.A))}</div><div class="big">${esc(lab)}</div>
      <div class="muted">يلتقيان في: <b>${esc(lineage(r.common))}</b></div>
      <div class="relcols" style="margin-top:12px"><div class="chainv">${show(r.ca)}</div><div class="chainv">${show(r.cb)}</div></div>
      <button class="btn wide ghost" data-rel="show">أظهرهما في الشجرة</button></div>`;
  }
  const s = openSheet("صلة القرابة", `<p class="muted" style="margin:0 0 10px">اختر شخصين لتعرف صلة القرابة بينهما وأين يلتقيان في النسب.</p>
    <div class="relcols">${slot("a", a, "الشخص الأول<br><small>اضغط للاختيار</small>")}${slot("b", b, "الشخص الثاني<br><small>اضغط للاختيار</small>")}</div>
    ${ME && a !== ME ? `<button class="btn small ghost" style="margin-top:8px" data-rel="me">اجعل الأول: أنا</button>` : ""}${res}`);
  s.onclick = (e) => {
    const sl = e.target.closest("[data-slot]")?.dataset.slot, act = e.target.closest("[data-rel]")?.dataset.rel;
    if (sl) pickPerson(sl === "a" ? "اختر الشخص الأول" : "اختر الشخص الثاني", (p) => openRel(sl === "a" ? p.id : a, sl === "b" ? p.id : b));
    if (act === "me") openRel(ME, b);
    if (act === "show") { closeSheet(); const r = relate(a, b); select(b, true); chain(P.get(a)).forEach((x) => pathSet.add(x.id)); chartReveal(a); chartReveal(b); chartMarks(); }
  };
}
function chooseMe() {
  pickPerson("حدد اسمك في الشجرة", (p) => { setMe(p.id); toast("تم: " + dn(p)); select(p.id, true); },
    "ابحث عن اسمك واختره، وبعدها يظهر لك عند كل شخص صلة قرابته بك.");
}

/* ====================== القائمة ====================== */
function openDrawer() {
  const d = $("#drawer"), me = ME && P.get(ME), pend = PENDING.length;
  const item = (a, icon, t, sub = "", badge = "") => `<button class="ditem" data-d="${a}">${ICON[icon]}<span>${t}${sub ? `<small>${sub}</small>` : ""}</span>${badge ? `<i class="badge">${badge}</i>` : ""}</button>`;
  d.innerHTML = `<div class="dhead"><img src="logo.svg" alt="" width="36" height="36"><b>القائمة</b><button class="xbtn" data-d="close" aria-label="إغلاق">×</button></div>
    <div class="dsec"><h3>حسابي</h3>${user
      ? item("account", "user", esc(profile?.name || "حسابي"), `<span dir="ltr">${esc(user.phoneNumber || "")}</span>`) + item("mine", "list", "طلباتي") + (isStaff() ? item("admin", "shield", "لوحة الإدارة", isOwner() ? "المدير العام" : myRole?.kind === "mod" ? "مشرف فرع" : "مدير", pend ? AR(pend) : "") : "") + item("logout", "out", "تسجيل الخروج")
      : item("login", "user", "تسجيل الدخول", "لإضافة الأبناء واقتراح التعديلات")}</div>
    <div class="dsec"><h3>أنا في الشجرة</h3>${item("me", "me", me ? "أنت: " + esc(dn(me)) : "حدد اسمك في الشجرة", me ? esc(lineage(me)) : "يظهر لك عند كل شخص قرابته بك")}
      ${me ? item("me-show", "me", "أظهر مكاني في الشجرة") : ""}${item("rel", "rel", "صلة القرابة", "اعرف القرابة بين أي شخصين")}</div>
    <div class="dsec"><h3>حجم الخط</h3><div class="fs">${[["1", "عادي"], ["2", "كبير"], ["3", "أكبر"]].map(([v, t]) => `<button data-fsz="${v}" class="${document.documentElement.dataset.fs === v ? "on" : ""}" style="font-size:${0.8 + v * 0.12}rem">${t}</button>`).join("")}</div></div>
    <div class="dsec"><h3>أخرى</h3>${item("share", "share", "مشاركة الموقع")}${item("help", "help", "طريقة الاستخدام")}</div>`;
  d.classList.add("open"); d.setAttribute("aria-hidden", "false"); $("#drawerBg").classList.add("open");
}
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); $("#drawerBg").classList.remove("open"); }
$("#bMenu").onclick = openDrawer;
$("#drawerBg").onclick = closeDrawer;
$("#drawer").onclick = (e) => {
  const fs = e.target.closest("[data-fsz]")?.dataset.fsz; if (fs) { setFS(fs); openDrawer(); return; }
  const a = e.target.closest("[data-d]")?.dataset.d; if (!a) return;
  if (a === "close") return closeDrawer();
  closeDrawer();
  if (a === "login") openLogin();
  else if (a === "logout") F.signOut(auth).then(() => toast("تم تسجيل الخروج"));
  else if (a === "account") openProfile();
  else if (a === "mine") openMine();
  else if (a === "admin") setTab("admin");
  else if (a === "me") chooseMe();
  else if (a === "me-show") select(ME, true);
  else if (a === "rel") openRel(ME, sel && sel !== ME ? sel : null);
  else if (a === "share") shareSite();
  else if (a === "help") openHelp();
};
function openHelp() {
  openSheet("طريقة الاستخدام", `<ol style="padding-inline-start:1.2em;margin:0;line-height:2">
    <li>اضغط على أي اسم في الشجرة لتظهر أبناؤه، واضغطه مرة ثانية لإخفائهم.</li>
    <li>اضغط زر <b>بحث</b> في الأعلى واكتب الاسم ثم اسم الأب، مثل «سعد محمد».</li>
    <li>عند اختيار أي اسم تظهر بطاقته في أسفل الشاشة: انسخ النسب أو شاركه أو أضف ابناً.</li>
    <li>من <b>القائمة</b> حدد اسمك في الشجرة، فتظهر لك صلة قرابتك بكل شخص.</li>
    <li>استخدم أزرار <b>+</b> و <b>−</b> للتكبير والتصغير، وزر البيت للعودة لأصل الشجرة.</li>
    <li>لتكبير الخط: القائمة ← حجم الخط.</li></ol>
    <p class="note">المعلومات الخاصة بالأحياء لا تظهر للعامة. أي إضافة أو تعديل يراجعها المشرف قبل نشرها.</p>
    <button class="btn wide" data-x2>فهمت</button>`).querySelector("[data-x2]").onclick = closeSheet;
}

/* ====================== الدخول والحساب ====================== */
let confirmation = null;
function openLogin(after) {
  if (!auth) return toast("الخدمة غير متاحة الآن، حاول لاحقاً");
  const s = openSheet("تسجيل الدخول", `<p class="muted" style="margin:0">سنرسل لك رمز تحقق برسالة نصية. رقمك لا يظهر للعامة.</p>
    <form id="fPhone"><label class="f" for="ph">رقم الجوال</label><input class="inp" id="ph" type="tel" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" autocomplete="tel" required>
      <button class="btn wide" type="submit">إرسال الرمز</button></form>
    <form id="fCode" class="hidden"><label class="f" for="cd">رمز التحقق</label><input class="inp" id="cd" inputmode="numeric" dir="ltr" autocomplete="one-time-code" maxlength="6" required>
      <button class="btn wide" type="submit">دخول</button></form><p class="err" id="lerr"></p>`);
  $("#fPhone", s).onsubmit = async (e) => {
    e.preventDefault(); const ph = phoneE164($("#ph", s).value); $("#lerr", s).textContent = "";
    if (!ph) return ($("#lerr", s).textContent = "اكتب رقم الجوال بشكل صحيح، مثل 0551234567");
    const b = e.submitter; b.disabled = true; b.textContent = "جارٍ الإرسال…";
    try {
      if (!window._rc) window._rc = new F.RecaptchaVerifier(auth, "recaptcha", { size: "invisible" });
      confirmation = await F.signInWithPhoneNumber(auth, ph, window._rc);
      $("#fPhone", s).classList.add("hidden"); $("#fCode", s).classList.remove("hidden"); $("#cd", s).focus();
    } catch (err) { console.warn(err); $("#lerr", s).textContent = "تعذر إرسال الرمز. تأكد من الرقم وحاول مرة ثانية."; b.disabled = false; b.textContent = "إرسال الرمز"; try { window._rc?.clear(); } catch (x) {} window._rc = null; }
  };
  $("#fCode", s).onsubmit = async (e) => {
    e.preventDefault();
    try { await confirmation.confirm($("#cd", s).value.trim()); loginAfter = after || null; closeSheet(); }
    catch (err) { $("#lerr", s).textContent = "الرمز غير صحيح."; }
  };
}
let loginAfter = null;
function openProfile(first = false) {
  const s = openSheet(first ? "عرّفنا بنفسك" : "حسابي", `<p class="muted" style="margin:0">${first ? "هذه البيانات تظهر للمشرف مع طلباتك فقط." : `<span dir="ltr">${esc(user.phoneNumber)}</span>`}</p>
    <form id="fProf"><label class="f" for="pn">الاسم الكامل</label><input class="inp" id="pn" required value="${esc(profile?.name || "")}">
    <label class="f" for="pr">صلتك بالعائلة أو الفرع</label><input class="inp" id="pr" placeholder="مثال: من فرع محمد بن راشد" value="${esc(profile?.relation || "")}">
    <label class="f">اسمك في الشجرة (اختياري)</label><button type="button" class="pick${ME ? " set" : ""}" id="pme">${ME ? esc(lineage(P.get(ME))) : "اضغط لتحديد اسمك"}</button>
    <button class="btn wide" type="submit">حفظ</button></form>`);
  $("#pme", s).onclick = () => { const keep = { name: $("#pn", s).value, relation: $("#pr", s).value }; pickPerson("حدد اسمك في الشجرة", (p) => { setMe(p.id, false); profile = { ...(profile || {}), ...keep }; openProfile(first); }); };
  $("#fProf", s).onsubmit = async (e) => {
    e.preventDefault();
    const isNew = !profile?.createdAt;
    const data = { name: $("#pn", s).value.trim(), relation: $("#pr", s).value.trim(), phone: user.phoneNumber, personId: ME || "" };
    if (isNew) data.createdAt = F.serverTimestamp();
    try { await F.setDoc(ref("profiles", user.uid), data, { merge: true }); profile = { ...(profile || {}), ...data, createdAt: profile?.createdAt || new Date() };
      closeSheet(); toast("تم حفظ بياناتك"); if (isNew) logEvent("register", { detail: data.relation });
      if (loginAfter) { const f = loginAfter; loginAfter = null; f(); } }
    catch (err) { console.warn(err); toast("تعذر الحفظ"); }
  };
}
async function onUser(u) {
  user = u; profile = null; myRole = null; ROLES = []; PENDING = [];
  if (u) {
    try { const ps = await F.getDoc(ref("profiles", u.uid)); if (ps.exists()) profile = ps.data(); } catch (e) {}
    if (profile?.personId && P.has(profile.personId) && !ME) setMe(profile.personId, false);
    try { if (!isOwner() && u.phoneNumber) { const rs = await F.getDoc(ref("roles", u.phoneNumber)); if (rs.exists()) myRole = rs.data(); } } catch (e) {}
    if (isStaff()) { await loadRoles(); await loadPending(); }
    const fresh = sessionStorage.getItem("dhf-login") !== u.uid;
    if (fresh) { sessionStorage.setItem("dhf-login", u.uid); if (authReady) logEvent("login"); }
    if (!profile && !isOwner()) openProfile(true);
    else if (loginAfter) { const f = loginAfter; loginAfter = null; f(); }
  }
  $("#menuDot").classList.toggle("hidden", !PENDING.length);
  renderPanel();
  if (tab === "admin") isStaff() ? renderAdmin() : setTab("tree");
  if (!authReady) { authReady = true; if (!sessionStorage.getItem("dhf-visit")) { sessionStorage.setItem("dhf-visit", "1"); logEvent("visit", { page: location.hash.slice(1) || "tree" }); } }
}

/* ====================== الطلبات (إضافة ابن / تعديل) ====================== */
function openRequest(type, p) {
  if (!db) return toast("الخدمة غير متاحة الآن");
  if (!user) return openLogin(() => openRequest(type, p));
  const direct = can("edit"), add = type === "addChild";
  const s = openSheet(add ? `إضافة ابن لـ ${esc(dn(p))}` : `${direct ? "تعديل" : "اقتراح تعديل"}: ${esc(dn(p))}`,
    `<p class="muted" style="margin:0">${esc(add ? "الأب: " + lineage(p) : lineage(p))}</p>
    <form id="fReq"><label class="f" for="rn">${add ? "اسم الابن" : "الاسم"}</label><input class="inp" id="rn" required value="${add ? "" : esc(p.name)}">
    ${add ? "" : `<label class="f" for="rb">تاريخ الميلاد</label><input class="inp" id="rb" value="${esc(p.birthDate || "")}" placeholder="مثال: ١٤٠٥هـ">
      <label class="f" for="rd">تاريخ الوفاة</label><input class="inp" id="rd" value="${esc(p.deathDate || "")}">
      <label class="f" for="rp">العمل أو المنصب</label><input class="inp" id="rp" value="${esc(p.position || "")}">
      <label class="f" for="rc">المدينة</label><input class="inp" id="rc" value="${esc(p.city || "")}">
      <label class="f" for="rnote">ملاحظة</label><input class="inp" id="rnote" value="${esc(p.note || "")}">`}
    ${direct ? "" : `<label class="f" for="rr">مصدر المعلومة أو سبب الطلب</label><textarea class="inp" id="rr" placeholder="مثال: أنا ابنه، أو حسب الصك…"></textarea>`}
    <button class="btn wide" type="submit">${direct ? "حفظ مباشرة" : "إرسال للمراجعة"}</button></form>
    ${direct ? `<p class="note">لديك صلاحية التعديل المباشر، وسيُسجَّل التعديل باسمك.</p>` : `<p class="note">يراجع المشرف طلبك قبل نشره، وتقدر تتابعه من القائمة ← طلباتي.</p>`}`);
  $("#fReq", s).onsubmit = async (e) => {
    e.preventDefault(); const b = e.submitter; b.disabled = true;
    const v = (id) => ($("#" + id, s)?.value || "").trim();
    const proposed = add ? { id: "N" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: v("rn"), parent: p.id, note: "", birthDate: "", deathDate: "", position: "", city: "", path: scopeOf(p) }
      : { name: v("rn"), birthDate: v("rb"), deathDate: v("rd"), position: v("rp"), city: v("rc"), note: v("rnote") };
    try {
      if (direct) {
        if (add) await F.setDoc(ref("persons", proposed.id), proposed); else await F.updateDoc(ref("persons", p.id), proposed);
        logEvent(add ? "add" : "edit", { personId: add ? proposed.id : p.id, personName: add ? `${proposed.name} بن ${lineage(p)}` : lineage(p), detail: add ? "" : describe(p, proposed) });
        await loadPeople(true); closeSheet(); toast("تم الحفظ"); select(add ? proposed.id : p.id, true);
      } else {
        await F.setDoc(F.doc(col("changeRequests")), {
          type, personId: p.id, personName: dn(p), personLineage: lineage(p), scope: scopeOf(p), proposed, reason: v("rr"),
          submittedBy: user.uid, submittedPhone: user.phoneNumber || "", submittedName: profile?.name || "", submittedRelation: profile?.relation || "",
          status: "pending", createdAt: F.serverTimestamp() });
        logEvent("request", { personId: p.id, personName: lineage(p), detail: add ? "إضافة الابن: " + proposed.name : "تعديل معلومات" });
        closeSheet(); toast("أُرسل طلبك للمراجعة، شكراً لك");
      }
    } catch (err) { console.warn(err); b.disabled = false; toast("تعذر الإرسال، حاول مرة ثانية"); }
  };
}
const FIELDS = { name: "الاسم", birthDate: "الميلاد", deathDate: "الوفاة", position: "العمل", city: "المدينة", note: "ملاحظة" };
const describe = (p, prop) => Object.keys(FIELDS).filter((k) => (prop[k] || "") !== (p[k] || "")).map((k) => `${FIELDS[k]}: ${p[k] || "—"} ← ${prop[k] || "—"}`).join("، ");
async function openMine() {
  const s = openSheet("طلباتي", `<div id="mine"><p class="muted center">جارٍ التحميل…</p></div>`);
  try {
    const snap = await F.getDocs(F.query(col("changeRequests"), F.where("submittedBy", "==", user.uid)));
    const list = snap.docs.map((x) => x.data()).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    $("#mine", s).innerHTML = list.length ? list.map((r) => `<div class="item"><h3>${r.type === "addChild" ? "إضافة الابن: " + esc(r.proposed?.name) : "تعديل: " + esc(r.personName)}</h3>
      <div class="who">${esc(r.personLineage || "")}</div><div class="row" style="margin-top:6px">${statusTag(r.status)}<span class="muted" style="font-size:.8rem">${fmtTime(r.createdAt)}</span></div>
      ${r.reviewNote ? `<p class="note">${esc(r.reviewNote)}</p>` : ""}</div>`).join("") : `<p class="empty">ما أرسلت أي طلب بعد.</p>`;
  } catch (e) { $("#mine", s).innerHTML = `<p class="empty">تعذر تحميل طلباتك.</p>`; }
}
const statusTag = (st) => st === "approved" ? `<span class="tag ok">مقبول</span>` : st === "rejected" ? `<span class="tag no">مرفوض</span>` : `<span class="tag wait">قيد المراجعة</span>`;

/* ====================== لوحة الإدارة ====================== */
async function loadRoles() { try { const s = await F.getDocs(col("roles")); ROLES = s.docs.map((x) => ({ id: x.id, ...x.data() })); } catch (e) { ROLES = []; } }
// المسؤول عن الطلب: أقرب مشرف فرع للاسم، وإلا المدراء
function responsible(r) {
  const sc = r.scope || [];
  for (let i = sc.length - 1; i >= 0; i--) { const mods = ROLES.filter((x) => x.kind === "mod" && (x.branches || []).includes(sc[i])); if (mods.length) return { mods, at: sc[i] }; }
  return { mods: [], at: null };
}
const mineToReview = (r) => { if (isOwner() || can("review")) return true; if (!isMod()) return false; const rs = responsible(r); return rs.mods.some((m) => m.id === user.phoneNumber); };
async function loadPending() {
  try { const s = await F.getDocs(F.query(col("changeRequests"), F.where("status", "==", "pending")));
    PENDING = s.docs.map((x) => ({ id: x.id, ...x.data() })).filter(mineToReview).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)); }
  catch (e) { console.warn(e); PENDING = []; }
  $("#menuDot").classList.toggle("hidden", !PENDING.length);
}
let atab = "req";
async function renderAdmin() {
  const el = $("#admin");
  if (!isStaff()) { el.innerHTML = `<p class="empty">هذه الصفحة للمدراء والمشرفين فقط.</p>`; return; }
  const tabs = [["req", "الطلبات", PENDING.length], can("roles") && ["roles", "المدراء والمشرفون"], can("logs") && ["stats", "الإحصائيات"], can("logs") && ["logs", "السجل"], isOwner() && ["tools", "أدوات"]].filter(Boolean);
  if (!tabs.some((t) => t[0] === atab)) atab = "req";
  el.innerHTML = `<div class="row" style="margin-bottom:10px"><h2 style="margin:0;flex:1;color:var(--g)">لوحة الإدارة</h2><button class="btn small ghost" data-ad="back">رجوع للشجرة</button></div>
    <p class="muted" style="margin:0 0 10px;font-size:.85rem">${isOwner() ? "أنت المدير العام: كل الصلاحيات." : isMod() ? `مشرف على: ${esc((myRole.branches || []).map((b) => P.get(b) ? lineage(P.get(b)) : b).join("، "))}` : "مدير: " + Object.keys(PERMS).filter((k) => myRole.perms?.[k]).map((k) => PERMS[k]).join("، ")}</p>
    <div class="atabs">${tabs.map(([k, t, n]) => `<button data-at="${k}" class="${k === atab ? "on" : ""}">${t}${n ? `<span class="badge">${AR(n)}</span>` : ""}</button>`).join("")}</div><div id="apane"></div>`;
  const pane = $("#apane", el);
  if (atab === "req") renderRequests(pane);
  if (atab === "roles") renderRoles(pane);
  if (atab === "stats") renderStats(pane);
  if (atab === "logs") renderLogs(pane);
  if (atab === "tools") renderTools(pane);
}
$("#admin").addEventListener("click", (e) => {
  const t = e.target.closest("[data-at]")?.dataset.at; if (t) { atab = t; renderAdmin(); return; }
  if (e.target.closest('[data-ad="back"]')) setTab("tree");
});
function renderRequests(pane) {
  if (!PENDING.length) { pane.innerHTML = `<p class="empty">لا توجد طلبات تنتظر قرارك.</p>`; return; }
  pane.innerHTML = PENDING.map((r) => {
    const rs = responsible(r), target = P.get(r.personId);
    const diff = r.type === "addChild" ? `<div><dt>الابن الجديد</dt><dd><b>${esc(r.proposed?.name)}</b></dd></div>`
      : Object.keys(FIELDS).filter((k) => (r.proposed?.[k] || "") !== ((target || {})[k] || "")).map((k) => `<div><dt>${FIELDS[k]}</dt><dd>${esc((target || {})[k] || "—")} ← <b>${esc(r.proposed?.[k] || "—")}</b></dd></div>`).join("") || "<div>لا يوجد اختلاف</div>";
    return `<div class="item" data-req="${r.id}"><h3>${r.type === "addChild" ? "طلب إضافة ابن" : "طلب تعديل"}</h3>
      <div class="who">${r.type === "addChild" ? "الأب" : "الشخص"}: ${esc(r.personLineage || "")}</div>
      <dl class="diff">${diff}${r.reason ? `<div><dt>المصدر</dt><dd>${esc(r.reason)}</dd></div>` : ""}</dl>
      <div class="who">مقدم الطلب: ${esc(r.submittedName || "—")} · <bdi dir="ltr">${esc(r.submittedPhone || "")}</bdi>${r.submittedRelation ? " · " + esc(r.submittedRelation) : ""} · ${fmtTime(r.createdAt)}</div>
      <div class="who">المسؤول: ${rs.mods.length ? "مشرف " + esc(dn(P.get(rs.at) || { name: "" })) + " (" + esc(rs.mods.map((m) => m.name).join("، ")) + ")" : "المدراء"}</div>
      <input class="inp" style="margin-top:8px" placeholder="ملاحظة لمقدم الطلب (اختياري)" data-note>
      <div class="row" style="margin-top:8px"><button class="btn" data-dec="approve">قبول</button><button class="btn red" data-dec="reject">رفض</button></div></div>`;
  }).join("");
  pane.onclick = async (e) => {
    const b = e.target.closest("[data-dec]"); if (!b) return;
    const card = b.closest("[data-req]"), r = PENDING.find((x) => x.id === card.dataset.req), note = $("[data-note]", card).value.trim();
    $$("button", card).forEach((x) => (x.disabled = true));
    try {
      if (b.dataset.dec === "approve") {
        if (r.type === "addChild") { const parent = P.get(r.proposed.parent); await F.setDoc(ref("persons", r.proposed.id), { ...r.proposed, path: parent ? scopeOf(parent) : r.proposed.path || [] }); }
        else { const pr = { ...r.proposed }; delete pr.id; delete pr.parent; delete pr.path; await F.updateDoc(ref("persons", r.personId), pr); }
      }
      await F.updateDoc(ref("changeRequests", r.id), { status: b.dataset.dec === "approve" ? "approved" : "rejected", reviewedAt: F.serverTimestamp(), reviewedBy: user.uid, reviewedByName: profile?.name || myRole?.name || "المدير", reviewNote: note });
      logEvent(b.dataset.dec, { personId: r.type === "addChild" ? r.proposed.id : r.personId, personName: r.type === "addChild" ? `${r.proposed.name} بن ${r.personLineage}` : r.personLineage, detail: `مقدم الطلب: ${r.submittedName || r.submittedPhone}${note ? " · " + note : ""}` });
      toast(b.dataset.dec === "approve" ? "تم القبول والنشر" : "تم الرفض");
      if (b.dataset.dec === "approve") await loadPeople(true);
      await loadPending(); renderAdmin();
    } catch (err) { console.warn(err); toast("تعذر التنفيذ: ليست لديك صلاحية على هذا الفرع"); $$("button", card).forEach((x) => (x.disabled = false)); }
  };
}
function renderRoles(pane) {
  const owners = OWNERS.map((ph) => `<div class="item"><h3>المدير العام</h3><div class="who" dir="ltr" style="text-align:right">${ph}</div><span class="tag">كل الصلاحيات</span></div>`).join("");
  pane.innerHTML = `<button class="btn wide" data-r="new" style="margin-top:0">+ إضافة مدير أو مشرف فرع</button>
    ${ROLES.length ? ROLES.map((x) => `<div class="item"><h3>${esc(x.name || "—")} <span class="tag">${x.kind === "mod" ? "مشرف فرع" : "مدير"}</span></h3>
      <div class="who" dir="ltr" style="text-align:right">${esc(x.id)}</div>
      <div class="who">${x.kind === "mod" ? "الفروع: " + esc((x.branches || []).map((b) => (P.get(b) ? lineage(P.get(b)) : b)).join(" · ")) : Object.keys(PERMS).filter((k) => x.perms?.[k]).map((k) => PERMS[k]).join("، ") || "بدون صلاحيات"}</div>
      <div class="row" style="margin-top:8px"><button class="btn small ghost" data-r="edit" data-id="${esc(x.id)}">تعديل</button><button class="btn small red" data-r="del" data-id="${esc(x.id)}">حذف</button></div></div>`).join("") : `<p class="empty">ما فيه مدراء أو مشرفون مضافون بعد.</p>`}
    ${owners}`;
  pane.onclick = async (e) => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    if (b.dataset.r === "new") roleForm();
    if (b.dataset.r === "edit") roleForm(ROLES.find((x) => x.id === b.dataset.id));
    if (b.dataset.r === "del") { const x = ROLES.find((y) => y.id === b.dataset.id);
      if (!confirm(`حذف صلاحيات ${x.name}؟`)) return;
      try { await F.deleteDoc(ref("roles", x.id)); logEvent("role", { detail: `حذف ${x.kind === "mod" ? "المشرف" : "المدير"}: ${x.name} (${x.id})` }); await loadRoles(); renderAdmin(); toast("تم الحذف"); } catch (err) { toast("تعذر الحذف"); } }
  };
}
function roleForm(x) {
  const st = { kind: x?.kind || "mod", perms: { ...(x?.perms || { review: true }) }, branches: [...(x?.branches || [])], name: x?.name || "", phone: x?.id || "" };
  const draw = () => {
    const s = openSheet(x ? "تعديل الصلاحيات" : "إضافة مدير أو مشرف", `<form id="fRole">
      <label class="f" for="rnm">الاسم</label><input class="inp" id="rnm" required value="${esc(st.name)}">
      <label class="f" for="rph">رقم الجوال (يدخل فيه)</label><input class="inp" id="rph" type="tel" dir="ltr" placeholder="05xxxxxxxx" required value="${esc(st.phone)}" ${x ? "readonly" : ""}>
      <label class="f">النوع</label><div class="seg"><button type="button" data-k="mod" class="${st.kind === "mod" ? "on" : ""}">مشرف فرع</button><button type="button" data-k="admin" class="${st.kind === "admin" ? "on" : ""}">مدير</button></div>
      ${st.kind === "mod" ? `<p class="note">يقبل أو يرفض أي إضافة أو تعديل تحت الأسماء اللي تختارها (أبناؤهم وأحفادهم كلهم). إذا فيه مشرف أقرب للاسم، الطلب يروح للأقرب.</p>
        <label class="f">الفروع</label><div class="blist">${st.branches.map((b) => `<span>${esc(P.get(b) ? lineage(P.get(b)) : b)}<button type="button" data-rm="${b}" aria-label="إزالة">×</button></span>`).join("") || '<span class="muted">لم تختر أي فرع</span>'}</div>
        <button type="button" class="btn small ghost" id="addBr" style="margin-top:8px">+ اختيار اسم</button>`
        : `<label class="f">الصلاحيات</label><div class="checks">${Object.entries(PERMS).map(([k, t]) => `<label><input type="checkbox" data-p="${k}" ${st.perms[k] ? "checked" : ""}> ${t}</label>`).join("")}</div>`}
      <p class="err" id="rerr"></p><button class="btn wide" type="submit">حفظ</button></form>`);
    const keep = () => { st.name = $("#rnm", s).value; st.phone = $("#rph", s).value; $$("[data-p]", s).forEach((c) => (st.perms[c.dataset.p] = c.checked)); };
    $$("[data-k]", s).forEach((b) => (b.onclick = () => { keep(); st.kind = b.dataset.k; draw(); }));
    $$("[data-rm]", s).forEach((b) => (b.onclick = () => { keep(); st.branches = st.branches.filter((y) => y !== b.dataset.rm); draw(); }));
    $("#addBr", s) && ($("#addBr", s).onclick = () => { keep(); pickPerson("اختر اسم الفرع", (p) => { if (!st.branches.includes(p.id)) st.branches.push(p.id); draw(); }); });
    $("#fRole", s).onsubmit = async (e) => {
      e.preventDefault(); keep(); const ph = phoneE164(st.phone);
      if (!ph) return ($("#rerr", s).textContent = "رقم الجوال غير صحيح");
      if (OWNERS.includes(ph)) return ($("#rerr", s).textContent = "هذا رقم المدير العام");
      if (st.kind === "mod" && !st.branches.length) return ($("#rerr", s).textContent = "اختر فرعاً واحداً على الأقل");
      const data = { name: st.name.trim(), phone: ph, kind: st.kind, perms: st.kind === "admin" ? st.perms : {}, branches: st.kind === "mod" ? st.branches : [],
        branchNames: st.kind === "mod" ? st.branches.map((b) => (P.get(b) ? lineage(P.get(b)) : b)) : [], updatedBy: user.phoneNumber || "", updatedAt: F.serverTimestamp() };
      try { await F.setDoc(ref("roles", ph), data);
        logEvent("role", { detail: `${x ? "تعديل" : "إضافة"} ${st.kind === "mod" ? "مشرف فرع" : "مدير"}: ${data.name} (${ph}) — ${st.kind === "mod" ? data.branchNames.join("، ") : Object.keys(PERMS).filter((k) => data.perms[k]).map((k) => PERMS[k]).join("، ")}` });
        closeSheet(); await loadRoles(); await loadPending(); renderAdmin(); toast("تم الحفظ"); }
      catch (err) { console.warn(err); $("#rerr", s).textContent = "تعذر الحفظ، تأكد من صلاحيتك"; }
    };
  };
  draw();
}
async function renderStats(pane) {
  pane.innerHTML = `<p class="muted center">جارٍ التحميل…</p>`;
  try {
    const snap = await F.getDocs(F.query(col("stats"), F.where("day", ">=", today(29))));
    const rows = snap.docs.map((x) => x.data()), sum = (type, days) => rows.filter((r) => r.type === type && r.day >= today(days - 1)).reduce((n, r) => n + (r.count || 0), 0);
    const types = ["visit", "share", "copy", "login", "register", "request", "approve", "reject", "add", "edit"];
    let legacy = "";
    try { const lp = await F.getDocs(col("analyticsPages")); const m = new Map(lp.docs.map((x) => [x.id, x.data().count || 0]));
      legacy = `<div class="box"><h2>إجمالي الزيارات قبل التحديث</h2><div class="cards"><div class="stat"><b>${AR(m.get("interactive_tree"))}</b><span>الشجرة التفاعلية</span></div><div class="stat"><b>${AR(m.get("first_edition"))}</b><span>الشجرة المطبوعة</span></div><div class="stat"><b>${AR(m.get("family_numbers"))}</b><span>العائلة بالأرقام</span></div></div></div>`; } catch (e) {}
    const days = [...Array(14)].map((_, i) => today(13 - i)), vmax = Math.max(1, ...days.map((d) => rows.filter((r) => r.day === d && r.type === "visit").reduce((n, r) => n + r.count, 0)));
    pane.innerHTML = `<div class="cards"><div class="stat"><b>${AR(sum("visit", 1))}</b><span>زيارة اليوم</span></div><div class="stat"><b>${AR(sum("visit", 7))}</b><span>آخر ٧ أيام</span></div><div class="stat"><b>${AR(sum("visit", 30))}</b><span>آخر ٣٠ يوماً</span></div><div class="stat"><b>${AR(PENDING.length)}</b><span>طلب ينتظرك</span></div></div>
      <div class="box"><h2>الزيارات في آخر أسبوعين</h2><div class="bars">${days.map((d) => { const n = rows.filter((r) => r.day === d && r.type === "visit").reduce((a, r) => a + r.count, 0);
        return `<div class="bar"><span>${new Date(d + "T12:00").toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" })}</span><i style="width:${(n / vmax) * 100}%"></i><em>${AR(n)}</em></div>`; }).join("")}</div></div>
      <div class="box"><h2>النشاط في آخر ٣٠ يوماً</h2><div class="bars">${types.map((t) => `<div class="bar"><span>${LOGT[t]}</span><span></span><em>${AR(sum(t, 30))}</em></div>`).join("")}</div></div>${legacy}`;
  } catch (e) { console.warn(e); pane.innerHTML = `<p class="empty">تعذر تحميل الإحصائيات.</p>`; }
}
let LOGS = [], logCursor = null, logFilter = "all";
const LOGGROUPS = { all: "الكل", visit: "الزيارات", share: "المشاركة والنسخ", login: "الدخول والتسجيل", request: "الطلبات والقرارات", edit: "التعديلات والصلاحيات" };
const inGroup = (t, g) => g === "all" || (g === "visit" && t === "visit") || (g === "share" && (t === "share" || t === "copy")) || (g === "login" && (t === "login" || t === "register")) ||
  (g === "request" && ["request", "approve", "reject"].includes(t)) || (g === "edit" && ["edit", "add", "role", "tool"].includes(t));
async function renderLogs(pane, more = false) {
  if (!more) { LOGS = []; logCursor = null; logEnd = false; pane.innerHTML = `<p class="muted center">جارٍ التحميل…</p>`; }
  try {
    const q = logCursor ? F.query(col("logs"), F.orderBy("at", "desc"), F.startAfter(logCursor), F.limit(150)) : F.query(col("logs"), F.orderBy("at", "desc"), F.limit(150));
    const s = await F.getDocs(q); LOGS = LOGS.concat(s.docs.map((x) => x.data())); if (s.docs.length) logCursor = s.docs[s.docs.length - 1]; logEnd = s.docs.length < 150;
    drawLogs(pane);
  } catch (e) { console.warn(e); pane.innerHTML = `<p class="empty">تعذر تحميل السجل.</p>`; }
}
let logEnd = false;
function drawLogs(pane) {
  const list = LOGS.filter((l) => inGroup(l.type, logFilter));
  pane.innerHTML = `<div class="atabs">${Object.entries(LOGGROUPS).map(([k, t]) => `<button data-lf="${k}" class="${k === logFilter ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="box" style="margin-top:0">${list.length ? list.map((l) => `<div class="log"><time>${fmtTime(l.at)}</time><div><b>${LOGT[l.type] || esc(l.type)}</b> — ${esc(l.name || (l.phone ? "" : "زائر"))} ${l.phone ? `<bdi dir="ltr">${esc(l.phone)}</bdi>` : ""}${!l.uid ? ` <span class="muted">(جهاز ${esc((l.device || "").slice(0, 4))})</span>` : ""}
      ${l.personName ? `<div>${esc(l.personName)}</div>` : ""}${l.detail ? `<div class="muted">${esc(l.detail)}</div>` : ""}${l.page && l.type === "visit" ? `<div class="muted">الصفحة: ${esc(l.page)}</div>` : ""}</div></div>`).join("") : `<p class="empty">لا توجد سجلات.</p>`}</div>
    ${logEnd ? "" : `<button class="btn wide ghost" data-more>عرض المزيد</button>`}`;
  pane.onclick = (e) => { const f = e.target.closest("[data-lf]")?.dataset.lf; if (f) { logFilter = f; drawLogs(pane); }
    if (e.target.closest("[data-more]")) renderLogs(pane, true); };
}
function renderTools(pane) {
  const missing = ALL.filter((p) => p !== ROOT && JSON.stringify(p.path || null) !== JSON.stringify(pathIds(p))).length;
  pane.innerHTML = `<div class="item"><h3>تحديث بيانات الفروع</h3><p class="who">مشرفو الفروع يحتاجون أن يعرف كل اسم في قاعدة البيانات أجداده. ${missing ? `يوجد <b>${AR(missing)}</b> اسماً تحتاج تحديث.` : "كل الأسماء محدّثة."}</p>
      <button class="btn" data-t="paths" ${missing ? "" : "disabled"}>تحديث الآن</button></div>
    ${remote ? "" : `<div class="item"><h3>استيراد الشجرة</h3><p class="who">قاعدة البيانات فارغة. استورد الأسماء الأصلية (${AR(ALL.length)} اسماً).</p><button class="btn" data-t="seed">استيراد</button></div>`}`;
  pane.onclick = async (e) => {
    const t = e.target.closest("[data-t]")?.dataset.t; if (!t) return; e.target.disabled = true; e.target.textContent = "جارٍ التنفيذ…";
    try {
      const todo = t === "seed" ? ALL : ALL.filter((p) => p !== ROOT && JSON.stringify(p.path || null) !== JSON.stringify(pathIds(p)));
      for (let i = 0; i < todo.length; i += 400) { const b = F.writeBatch(db);
        todo.slice(i, i + 400).forEach((p) => t === "seed" ? b.set(ref("persons", p.id), { id: p.id, name: p.name, parent: p.parent, note: p.note || "", birthDate: "", deathDate: "", position: "", city: "", path: pathIds(p) })
          : b.update(ref("persons", p.id), { path: pathIds(p) }));
        await b.commit(); }
      logEvent("tool", { detail: t === "seed" ? `استيراد ${todo.length} اسماً` : `تحديث فروع ${todo.length} اسماً` });
      await loadPeople(true); toast("تم"); renderAdmin();
    } catch (err) { console.warn(err); toast("تعذر التنفيذ"); renderAdmin(); }
  };
}

/* ====================== الشجرة المطبوعة ====================== */
let pdfDoc = null, pdfScale = 0, pdfBusy = false;
async function openPrinted() {
  if (pdfDoc) return;
  try {
    const lib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    pdfDoc = await (await lib.getDocument("shajarat-aldhfyan-original.pdf").promise).getPage(1);
    const base = pdfDoc.getViewport({ scale: 1 }); pdfScale = Math.max(0.3, ($("#pdfWrap").clientWidth - 20) / base.width);
    await drawPdf(); $("#pdfMsg").remove();
  } catch (e) { console.warn(e); $("#pdfMsg").innerHTML = `تعذر فتح الشجرة داخل الصفحة. <a href="shajarat-aldhfyan-original.pdf">افتح الملف مباشرة</a>`; }
}
async function drawPdf() {
  if (!pdfDoc || pdfBusy) return; pdfBusy = true;
  const cv = $("#pdfCanvas"), pr = Math.min(2, devicePixelRatio || 1), vp = pdfDoc.getViewport({ scale: pdfScale * pr });
  cv.width = vp.width; cv.height = vp.height; cv.style.width = vp.width / pr + "px"; cv.hidden = false;
  await pdfDoc.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise; pdfBusy = false;
}
$("#pIn").onclick = () => { pdfScale = Math.min(pdfScale * 1.4, 6); drawPdf(); };
$("#pOut").onclick = () => { pdfScale = Math.max(pdfScale / 1.4, 0.2); drawPdf(); };

/* ====================== العائلة بالأرقام ====================== */
function renderNumbers() {
  const gens = d3.range(d3.max(ALL, (p) => p.depth) + 1).map((d) => ALL.filter((p) => p.depth === d).length), gmax = Math.max(...gens);
  const counts = new Map();
  ALL.forEach((p) => { if (p === ROOT) return; let k = norm(dn(p)); if (["ابراهيم", "برايهم", "ابرايهم", "ابراهم"].includes(k)) k = "ابراهيم"; const it = counts.get(k) || { name: k === "ابراهيم" ? "إبراهيم" : dn(p), n: 0 }; it.n++; counts.set(k, it); });
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 10), rare = [...counts.values()].filter((x) => x.n === 1).map((x) => x.name).sort((a, b) => a.localeCompare(b, "ar"));
  const br = ROOT.kids, bmax = Math.max(...br.map((b) => b.desc + 1));
  $("#numbers").innerHTML = `<div class="cards"><div class="stat"><b>${AR(ALL.length)}</b><span>اسماً في الشجرة</span></div><div class="stat"><b>${AR(gens.length)}</b><span>جيلاً</span></div>
      <div class="stat"><b>${AR(br.length)}</b><span>فروع رئيسية</span></div><div class="stat"><b>${AR(counts.size)}</b><span>اسماً مختلفاً</span></div></div>
    <div class="box"><h2>الفروع الرئيسية</h2><div class="bars">${br.map((b) => `<div class="bar"><span>${esc(dn(b))}</span><i style="width:${((b.desc + 1) / bmax) * 100}%"></i><em>${AR(b.desc + 1)}</em></div>`).join("")}</div></div>
    <div class="box"><h2>عدد الأسماء في كل جيل</h2><div class="bars">${gens.map((n, i) => `<div class="bar"><span>الجيل ${AR(i + 1)}</span><i style="width:${(n / gmax) * 100}%"></i><em>${AR(n)}</em></div>`).join("")}</div></div>
    <div class="box"><h2>أكثر الأسماء تكراراً</h2><div class="bars">${top.map((x) => `<div class="bar"><span>${esc(x.name)}</span><i style="width:${(x.n / top[0].n) * 100}%"></i><em>${AR(x.n)}</em></div>`).join("")}</div></div>
    <div class="box"><h2>أسماء لم تتكرر</h2><p class="muted" style="margin-top:0">${AR(rare.length)} اسماً وردت مرة واحدة فقط</p><div class="chips">${rare.map((n) => `<span>${esc(n)}</span>`).join("")}</div></div>`;
}

/* ====================== التحميل ====================== */
let remote = false;
async function loadPeople(keep) {
  if (!db) return;
  try {
    const snap = await F.getDocs(col("persons"));
    if (!snap.empty) { const open = openIds(); setPeople(snap.docs.map((x) => x.data())); remote = true; buildChart(keep ? open : null); if (sel && !P.has(sel)) clearSel(); else renderPanel(); }
  } catch (e) { console.warn("persons", e); }
}
function route() {
  const q = new URLSearchParams(location.search), pid = q.get("p") || q.get("person"), h = location.hash.slice(1);
  if (["printed", "numbers"].includes(h)) setTab(h, false);
  if (pid && P.has(pid)) select(pid, true);
  if (q.get("login") === "1" && auth && !user) openLogin();
}
(async function start() {
  setPeople(window.SEED_PEOPLE || []);
  const me = store.get("dhf-me"); if (me && P.has(me)) ME = me;
  buildChart();
  addEventListener("resize", () => { if (C) chartGens(d3.zoomTransform(C.svg.node())); });
  const ok = await initFirebase();
  if (ok) { await loadPeople(); F.onAuthStateChanged(auth, (u) => onUser(u)); }
  route();
})();
