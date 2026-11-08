// شجرة الضفيان — الواجهة الجديدة
// الشجرة، البحث، صلة القرابة، الطلبات، ولوحة الإدارة (مدراء بصلاحيات، مشرفو فروع، سجل كامل)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import * as FS from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import * as FA from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { firebaseConfig, SITE_TITLE, ROOT_LABEL, FILE_PREFIX, ADMIN_PHONES } from "./site-config.js";
import { cleanText, cleanUpdate, cleanPerson, newPersonId, sameNameSiblings, loadTreeSnapshot, loadAllPersons, saveTreeSnapshot, ensureDailyBackup, initAdminTools } from "./family-tools.js";

/* ====================== أدوات عامة ====================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AR = (n) => Number(n || 0).toLocaleString("ar-SA");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const norm = (s) => (s || "").normalize("NFKD").replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ«»]/g, "")
  .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/عبد\s+/g, "عبد").trim().toLowerCase();
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const OWNERS = ADMIN_PHONES;   // المدير العام (من site-config.js، ومطابق لقواعد الحماية)
const PERMS = { review: "قبول ورفض الإضافات والتعديلات", edit: "تعديل وحذف الأسماء مباشرة", roles: "إضافة المدراء والمشرفين وتحديد صلاحياتهم", logs: "مشاهدة السجل والإحصائيات" };
const ICON = {
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8 15.7 6.4M8.3 13.2l7.4 4.4"/></svg>',
  add: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  rel: '<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><circle cx="12" cy="5" r="2.5"/><path d="M12 7.5v4M6 15.5V13h12v2.5"/></svg>',
  me: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M9 7h6M9 11h6"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2800); }
async function copyText(s, msg = "تم النسخ") {
  try { await navigator.clipboard.writeText(s); toast(msg); return true; }
  catch (e) { const ta = document.createElement("textarea"); ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(msg); return true; } catch (e2) { toast("تعذر النسخ في هذا المتصفح"); return false; } finally { ta.remove(); } }
}
const fmtTime = (d) => { if (!d) return ""; const x = d.toDate ? d.toDate() : new Date(d);
  return x.toLocaleString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
const today = (off = 0) => new Date(Date.now() + 3 * 3600e3 - off * 864e5).toISOString().slice(0, 10);   // بتوقيت الرياض
const phoneE164 = (value) => {
  let d = String(value || "").replace(/[٠-٩]/g, (x) => "٠١٢٣٤٥٦٧٨٩".indexOf(x)).replace(/[۰-۹]/g, (x) => "۰۱۲۳۴۵۶۷۸۹".indexOf(x)).replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (/^05\d{8}$/.test(d)) d = "+966" + d.slice(1); else if (/^5\d{8}$/.test(d)) d = "+966" + d; else if (/^9665\d{8}$/.test(d)) d = "+" + d;
  else if (/^974[3-7]\d{7}$/.test(d)) d = "+" + d; else if (/^[3-7]\d{7}$/.test(d)) d = "+974" + d;
  return /^\+9665\d{8}$/.test(d) || /^\+974[3-7]\d{7}$/.test(d) || OWNERS.includes(d) ? d : "";
};

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
const dn = (p) => (p === ROOT ? ROOT_LABEL : String(p.name || "").replace(/\s*«.*?»\s*/g, "").trim() || p.name);
const DEAD = "متوفى";
const isDead = (p) => !!(p && p.deathDate);
const chain = (p) => { const a = []; while (p) { a.push(p); p = P.get(p.parent); } return a; };
const lineage = (p) => chain(p).map((x) => (x === ROOT ? x.name : dn(x))).join(" بن ");
const FAMILY = SITE_TITLE.replace(/^شجرة\s+/, "");
const fullName = (p) => chain(p).map(dn).join(" بن ") + " " + FAMILY;
const pathIds = (p) => chain(p).slice(1).reverse().map((x) => x.id);          // الأجداد من الأصل إلى الأب
const scopeOf = (p) => [...pathIds(p), p.id];
const sonsTxt = (n) => (n === 0 ? "لا أبناء مسجلون" : n === 1 ? "ابن واحد" : n === 2 ? "ابنان" : n <= 10 ? `${AR(n)} أبناء` : `${AR(n)} ابنًا`);

/* ====================== Firebase ====================== */
const F = { ...FS, ...FA };
let db = null, auth = null, user = null, profile = null, myRole = null, ROLES = [], PENDING = [], authReady = false;
async function initFirebase() {
  try { const app = initializeApp(firebaseConfig); db = FS.getFirestore(app); auth = FA.getAuth(app); auth.languageCode = "ar"; return true; }
  catch (e) { console.warn("Firebase unavailable", e); return false; }
}
const ref = (...p) => F.doc(db, ...p);
const col = (c) => F.collection(db, c);
// الأدوار: المدير العام · مدير (صلاحيات محددة) · مشرف فرع. المراجع القديم بدون نوع = مدير بصلاحية القبول والرفض
const isOwner = () => !!user && OWNERS.includes(user.phoneNumber);
const roleKind = () => (myRole ? myRole.kind || "admin" : null);
const can = (perm) => isOwner() || (roleKind() === "admin" && !!(myRole.perms || { review: true })[perm]);
const isStaff = () => isOwner() || !!myRole;
const isMod = () => roleKind() === "mod";
// عدّادات الموقع الحالية (تبقى كما هي حتى لا تنقطع الإحصائيات القديمة)
const weekStartKey = (date = new Date()) => { const s = new Date(date.getTime() + 3 * 3600e3), u = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())); u.setUTCDate(u.getUTCDate() - ((u.getUTCDay() + 6) % 7)); return u.toISOString().slice(0, 10); };
async function recordCounter(group, id) { try { await F.setDoc(ref(group, id), { count: F.increment(1), lastEventAt: F.serverTimestamp() }, { merge: true }); } catch (e) {} }
async function recordPageVisit(page) {
  if (!db) return; const weekStart = weekStartKey();
  recordCounter("analyticsPages", page);
  F.setDoc(ref("analyticsPageWeeks", `${weekStart}_${page}`), { page, weekStart, count: F.increment(1), lastEventAt: F.serverTimestamp() }, { merge: true }).catch(() => {});
}
const visited = new Set();
const pageVisit = (t) => { const page = { tree: "interactive_tree", printed: "first_edition", numbers: "family_numbers" }[t]; if (page && !visited.has(page)) { visited.add(page); recordPageVisit(page); } };

/* ---------- السجل والإحصائيات ---------- */
const DEVICE = store.get("dhf-dev") || (() => { const d = Math.random().toString(36).slice(2, 10); store.set("dhf-dev", d); return d; })();
const LOGT = { visit: "زيارة", share: "مشاركة", copy: "نسخ اسم", login: "تسجيل دخول", register: "تسجيل جديد", request: "طلب جديد",
  approve: "قبول طلب", reject: "رفض طلب", edit: "تعديل مباشر", add: "إضافة مباشرة", delete: "حذف اسم", role: "صلاحيات", tool: "أداة إدارية" };
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
  pageVisit(t);
  if (t === "printed") openPrinted();
  if (t === "numbers") renderNumbers();
  if (t === "admin") renderAdmin();
  if (push) history.replaceState(null, "", t === "tree" ? location.pathname + location.search : "#" + t);
  if (t === "tree") { ensureView(); if (C) requestAnimationFrame(() => chartGens(d3.zoomTransform(C.svg.node()))); }
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
  C.svg.transition("pan").duration(450).call(C.zoom.translateTo, -d.x, -d.y - (d.children ? CDY / 2 : 0), focusPoint());
}
// وسط الجزء الظاهر من الشاشة (بين أزرار الأعلى وبطاقة الاسم)
function focusPoint() {
  const el = $("#v-tree"), top = 10, pph = document.body.classList.contains("has-pp") && innerWidth < 900 ? $("#pp").offsetHeight : 0;
  return [el.clientWidth / 2, top + (el.clientHeight - top - pph) / 2];
}
function chartReveal(id) {
  if (!C) return;
  const d = C.byId.get(id); if (!d) return;
  d.ancestors().slice(1).forEach((a) => (a.children = a._children));
  chartUpdate(C.root);
  const el = $("#v-tree"), pph = document.body.classList.contains("has-pp") && innerWidth < 900 ? $("#pp").offsetHeight : 0;
  C.svg.transition("pan").duration(500).call(C.zoom.translateTo, -d.x, -d.y, [el.clientWidth / 2, (el.clientHeight - pph) / 2]);
}
function chartMarks() {
  if (!C) return;
  C.gNode.selectAll("g.cn").classed("onpath", (d) => pathSet.has(d.data.id)).classed("sel", (d) => d.data.id === sel).classed("me", (d) => d.data.id === ME).classed("dead", (d) => isDead(d.data));
  C.gLink.selectAll("path").classed("onpath", (d) => pathSet.has(d.target.data.id));
}
function chartGens(tr) {
  if (!C) return;
  const w = $("#v-tree").clientWidth;
  C.gens.selectAll("text").data(d3.range(C.maxD + 1)).join("text").attr("x", w - 10).attr("text-anchor", "start").attr("dy", "0.35em")
    .attr("y", (i) => tr.y - tr.k * i * CDY - (CH / 2 + 14) * tr.k).text((i) => "الجيل " + AR(i + 1));
}
$("#zIn").onclick = () => Z().svg.transition().call(Z().zoom.scaleBy, 1.3);
$("#zOut").onclick = () => Z().svg.transition().call(Z().zoom.scaleBy, 1 / 1.3);

if (store.get("dhf-hint")) $("#hint")?.remove();

/* ---------- الشجرة الحيّة ---------- */
let T = null; const NW = 70, NH = 27, LW = 78, LH = 31, DY = 92, SLOT = 84, CROWN = 120, TRUNK = 105;
const LEAF = `M${-LW / 2} 0C${-LW / 2 + 8} ${-LH * .55} ${-LW * .05} ${-LH * .64} ${LW * .2} ${-LH * .44}C${LW * .35} ${-LH * .32} ${LW * .46} ${-LH * .12} ${LW / 2} 0C${LW * .43} ${LH * .17} ${LW * .32} ${LH * .33} ${LW * .17} ${LH * .43}C${-LW * .06} ${LH * .6} ${-LW / 2 + 8} ${LH * .55} ${-LW / 2} 0Z`;
const VEINS = [-.28, -.06, .16, .34].map(f => { const x = LW * f, s = LH * (.36 - Math.abs(f) * .28); return `M${x} 0Q${x + 7} ${-s * .5} ${x + 15} ${-s}M${x} 0Q${x + 7} ${s * .5} ${x + 15} ${s}`; }).join("");
// like a real tree: a branch is as thick as the whole family it carries (its cross-section shares the trunk's)
const bw0 = d => Math.max(3, 26 * Math.pow(0.8, d.depth - 1));   // سمك الغصن حسب الجيل
const bw = d => bw0(d) * (T ? T.S : 1);
const seedOf = id => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((h >>> 0) % 1000) / 500 - 1; };
const f1 = v => v.toFixed(1);
// positions: every person sits ABOVE his father (the tree only grows upward); the root is drawn at the foot of the trunk
const PX = d => d.depth === 0 ? 0 : d.X, PY = d => d.depth === 0 ? T.base - 46 : d.Y;
const lerp = (a, b, k) => a + (b - a) * k;
const at = (d, k) => d.depth === 0 ? [0, -CROWN] : [lerp(d.ox ?? d.X, d.X, k), lerp(d.oy ?? d.Y, d.Y, k)];
// tapered, slightly swaying branch; brothers leave their father together (bundled, upward) and then part ways
function branchPath(p, c, k = 1, g = 1) {
  let [x0, y0] = at(p, k), [x3, y3] = at(c, k);
  if (p.depth === 0) { x0 = Math.sin(c.th || 0) * 30 * T.S * .55; y0 += 6; }   // limbs leave from across the trunk top, not one point
  x3 = lerp(x0, x3, g); y3 = lerp(y0, y3, g);
  const L = Math.hypot(x3 - x0, y3 - y0) || 1, s = seedOf(c.data.id), ux = (x3 - x0) / L, uy = (y3 - y0) / L, nx = -uy, ny = ux;
  const dv = d => [Math.sin(d.th || 0), -Math.cos(d.th || 0)];
  const dp = dv(p), dc = dv(c);
  const x1 = x0 + dp[0] * L * .42 + nx * s * L * .05, y1 = y0 + dp[1] * L * .42 + ny * s * L * .05;
  const x2 = x3 - dc[0] * L * .34 - nx * s * L * .06, y2 = y3 - dc[1] * L * .34 - ny * s * L * .06;
  const w0 = bw(c), w1 = Math.max(2, bw(c) * .72), A = [], B = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, m = 1 - t;
    const x = m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3, y = m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3;
    const dx = 3 * m * m * (x1 - x0) + 6 * m * t * (x2 - x1) + 3 * t * t * (x3 - x2), dy = 3 * m * m * (y1 - y0) + 6 * m * t * (y2 - y1) + 3 * t * t * (y3 - y2), l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * t) / 2 * (.35 + .65 * g), ox = -dy / l * w, oy = dx / l * w;
    A.push(f1(x + ox) + "," + f1(y + oy)); B.push(f1(x - ox) + "," + f1(y - oy));
  }
  return "M" + A.join("L") + "L" + B.reverse().join("L") + "Z";
}
function trunkPath(base, w = 30) {
  const b = base, f = w * 2.4, tp = -CROWN - 8, hh = b - tp;
  return `M${-w * .8},${tp} C${-w + 2},${tp + hh * .4} ${-w - 4},${tp + hh * .75} ${-w - 14},${b - 22} C${-w - 26},${b - 10} ${-f},${b - 4} ${-f - 26},${b + 2} L${-f + 16},${b + 3} C${-36},${b - 1} ${-26},${b - 3} ${-16},${b + 1} L-2,${b + 6} L12,${b} C26,${b - 3} 40,${b - 2} 56,${b + 3} L${f + 26},${b + 2} C${f},${b - 5} ${w + 26},${b - 10} ${w + 14},${b - 22} C${w + 4},${tp + hh * .75} ${w - 2},${tp + hh * .4} ${w * .8},${tp}`;
}
// tidy crown: every family owns its own slice of the crown, so branches never cross and names never sit on each other.
// realism on top: the biggest son is placed in the middle (leader), sizes follow family size, leaves point outward.
const vdesc = d => d.children ? d.children.reduce((n, c) => n + 1 + vdesc(c), 0) : 0;
const scOf = d => d._children ? Math.max(.8, Math.min(1.15, .74 + .09 * Math.log2(d.data.desc + 2))) : .84;
const wid = d => (d._children ? 68 : 42) * scOf(d);
function arrange(d) {   // biggest son in the middle, smaller ones alternate outward
  if (!d._children || d._ordered) return; d._ordered = true;
  const by = d._children.slice().sort((a, b) => b.data.desc - a.data.desc), arr = [];
  by.forEach((c, i) => (i % 2 ? arr.push(c) : arr.unshift(c)));
  d._children = arr; if (d.children) d.children = arr;
}
function layoutOpen() {
  const { root } = T;
  root.descendants().forEach(arrange);
  // المسافة بين الإخوة تُحسب بالزاوية مقسومة على بُعد جيلهم، فتبقى بنفس العرض الحقيقي في كل جيل (ما تكبر كل ما بعدنا)
  const n = root.descendants().length, MAXSP = Math.PI * (n > 300 ? 1.25 : n > 80 ? 1.05 : .9);
  const Rg = (k) => 120 + 70 * (k - 1);
  d3.tree().nodeSize([1, 1]).separation((a, b) => ((wid(a) + wid(b)) / 2 + 8) * (a.parent === b.parent ? 1 : 1.25) / Rg(a.depth))(root);
  { const xs = root.descendants().slice(1).map((d) => d.x); if (xs.length) { const lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo, mid = (lo + hi) / 2;
      if (span <= MAXSP) root.descendants().forEach((d) => (d.x -= mid));
      else {   // فروع كثيرة مفتوحة (مثل «عرض الكل»): وزّعها على التاج كامل
        d3.tree().size([MAXSP, 1]).separation((a, b) => ((wid(a) + wid(b)) / 2 / 50) * (a.parent === b.parent ? 1 : 1.3) / Math.max(1, Math.sqrt(a.depth)))(root);
        root.descendants().forEach((d) => (d.x -= MAXSP / 2)); } } }
  const SP = 0;
  const nodes = root.descendants(), md = d3.max(nodes, d => d.depth) || 1, Rr = [0];
  for (let k = 1; k <= md; k++) {
    const ring = nodes.filter(d => d.depth === k).sort((a, b) => a.x - b.x);
    let need = k === 1 ? 120 : Rr[k - 1] + (k <= 3 ? 82 : 60);
    for (let i = 1; i < ring.length; i++) { const g = ring[i].x - ring[i - 1].x, w = (wid(ring[i]) + wid(ring[i - 1])) / 2 + 4; if (g > 1e-6) need = Math.max(need, w / g); }
    Rr[k] = Math.min(need, Rr[k - 1] + (k <= 2 ? 110 : 82));   // خطوة محدودة لكل جيل، والتلامس يُحل بالدفع تحت
  }
  nodes.forEach(d => { d.vd = vdesc(d); d.sc = d.depth ? scOf(d) : 1; if (!d.depth) { d.th = 0; return; }
    const th = -d.x;
    const r = Rr[d.depth] - (!d._children ? 14 : 0) + (!d._children && d.parent.children ? (d.parent.children.indexOf(d) % 2) * 14 : 0);
    d.th = th; d.nX = r * Math.sin(th); d.nY = -CROWN - r * Math.cos(th) * 1.08; });
  {   // ادفع الأسماء المتلامسة بعيداً عن بعض، وتبقى قريبة من مكان عائلتها
    const sims = nodes.slice(1).map(d => ({ d, x: d.nX, y: d.nY, rx: wid(d) / 2 + 3, ry: 17 * d.sc + 3 }));
    for (let y = -CROWN + 30; y < T.base; y += 30) sims.push({ x: 0, y, fx: 0, fy: y, rx: 50, ry: 16 });
    const q = () => d3.quadtree(sims, s => s.x, s => s.y);
    for (let it = 0; it < 60; it++) {      // ellipse-ish (wide, short) separation, matching the name shapes
      const tr = q();
      for (const a of sims) { if (a.fx !== undefined) continue;
        tr.visit((nd, x0, y0, x1, y1) => { if (!nd.length) { let b = nd.data; do { if (b !== a) {
          const dx = a.x - b.x, dy = a.y - b.y, ox = a.rx + b.rx - Math.abs(dx), oy = a.ry + b.ry - Math.abs(dy);
          if (ox > 0 && oy > 0) { if (ox / (a.rx + b.rx) < oy / (a.ry + b.ry)) { const m = ox / 2 * (dx < 0 ? -1 : 1); a.x += m; if (b.fx === undefined) b.x -= m; } else { const m = oy / 2 * (dy < 0 ? -1 : 1); a.y += m; if (b.fx === undefined) b.y -= m; } }
        } } while (nd = nd.next); }
          return x0 > a.x + 140 || x1 < a.x - 140 || y0 > a.y + 50 || y1 < a.y - 50; });
        a.x += (a.d.nX - a.x) * .02; a.y += (a.d.nY - a.y) * .02; }
    }
    sims.forEach(s => { if (s.d) { s.d.nX = s.x; s.d.nY = s.y; } });
  }
  const was = T.vis || new Set();
  nodes.forEach(d => { if (!d.depth) return;
    if (was.has(d.data.id)) { d.ox = d.X; d.oy = d.Y; }
    else { const p = d.parent; d.ox = p.depth ? p.ox : 0; d.oy = p.depth ? p.oy : -CROWN; }
    d.X = d.nX; d.Y = d.nY; });
  T.vis = new Set(nodes.map(d => d.data.id));
  return nodes;
}
// the whole family at once: a crown like the printed tree (computed once, used by «فتح كل الفروع»)
function crownSeats() {
  if (T.seats) return T.seats;
  const SPAN = Math.PI * 1.06, DR = 96, h = d3.hierarchy(ROOT, p => p.kids);
  d3.tree().size([SPAN, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.5) / Math.max(1, a.depth * .6))(h);
  const all = h.descendants();
  all.forEach(d => { const th = SPAN / 2 - d.x, r = d.depth ? 70 + d.depth * DR : 0; d.tx = r * Math.sin(th); d.ty = -CROWN - r * Math.cos(th) * 1.1; });
  const sims = all.map(d => ({ d, x: d.tx, y: d.ty, r: d.depth === 0 ? 40 : d.children ? 40 : 44 }));
  sims[0].fx = 0; sims[0].fy = -CROWN;
  const reach = d3.max(all, d => d.ty) + 200;
  for (let y = -CROWN + 30; y < reach; y += 34) sims.push({ d: null, x: 0, y, fx: 0, fy: y, r: 58 });
  const sim = d3.forceSimulation(sims).stop()
    .force("x", d3.forceX(s => s.d ? s.d.tx : 0).strength(.2)).force("y", d3.forceY(s => s.d ? s.d.ty : s.y).strength(.3))
    .force("c", d3.forceCollide(s => s.r).strength(.9).iterations(2));
  for (let i = 0; i < 200; i++) sim.tick();
  T.seats = new Map(sims.filter(s => s.d).map(s => [s.d.data.id, [s.x, s.y]]));
  return T.seats;
}
function buildTree(keepOpen) {
  const svg = d3.select("#treeSvg"); svg.selectAll("*").remove();
  const root = d3.hierarchy(ROOT, p => p.kids), allNodes = root.descendants();
  allNodes.forEach(d => { d._children = d.children; d.children = null; });
  const zl = svg.append("g");
  svg.insert("defs", ":first-child").html(`
    <pattern id="bark" patternUnits="userSpaceOnUse" width="26" height="70"><rect width="26" height="70" fill="#5e3e26"/>
      <path d="M3 0c2 18-2 30 1 46s-1 24 0 24M11 0c-2 14 3 26 0 40s2 22 1 30M19 0c2 20-3 28 0 44s1 18-1 26" stroke="#3a2416" stroke-width="2.6" fill="none" opacity=".75"/>
      <path d="M7 4c1 12-1 22 1 34M15 10c-1 16 2 24 0 40M23 2c1 14-2 26 0 38" stroke="#7d5636" stroke-width="1.6" fill="none" opacity=".8"/></pattern>
    <pattern id="barkHi" patternUnits="userSpaceOnUse" width="26" height="70"><rect width="26" height="70" fill="#9a6a2c"/>
      <path d="M3 0c2 18-2 30 1 46s-1 24 0 24M11 0c-2 14 3 26 0 40s2 22 1 30M19 0c2 20-3 28 0 44s1 18-1 26" stroke="#6e4618" stroke-width="2.6" fill="none" opacity=".8"/>
      <path d="M7 4c1 12-1 22 1 34M15 10c-1 16 2 24 0 40M23 2c1 14-2 26 0 38" stroke="#c4904a" stroke-width="1.6" fill="none" opacity=".8"/></pattern>
    <linearGradient id="trunkShade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
    <radialGradient id="wood" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#f6e2bc"/><stop offset=".65" stop-color="#e2bb84"/><stop offset="1" stop-color="#c38d55"/></radialGradient>
    <linearGradient id="leafG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6d462"/><stop offset=".55" stop-color="#7fb446"/><stop offset="1" stop-color="#5a9132"/></linearGradient>
    <radialGradient id="soil" cy=".35"><stop offset="0" stop-color="#7a9a48"/><stop offset=".6" stop-color="#8ba65a"/><stop offset="1" stop-color="#b9c58e" stop-opacity="0"/></radialGradient>`);
  const ground = zl.append("ellipse").attr("class", "ground").attr("cx", 0).attr("rx", 360).attr("ry", 42);
  const gLink = zl.append("g");
  const gGround = zl.append("g");
  const trunk = gGround.append("path").attr("class", "trunk"), shade = gGround.append("path").attr("class", "trunk-shade");
  const gNode = zl.append("g");
  const zoom = d3.zoom().scaleExtent([.06, 2.5]).on("zoom", e => { zl.attr("transform", e.transform); if (e.sourceEvent && T) T.moved = true; });
  svg.call(zoom).on("dblclick.zoom", null);
  T = { svg, root, zl, gLink, gNode, zoom, ground, trunk, shade, base: TRUNK, S: 1, byId: new Map(allNodes.map(d => [d.data.id, d])) };
  root.children = root._children;
  if (keepOpen) keepOpen.forEach((id) => { const d = T.byId.get(id); if (d && d._children) d.children = d._children; });
  treeUpdate(root, 0);
  svg.call(zoom.transform, treeHome());
}
function treeHome(center) {
  // الشجرة كاملة داخل المساحة اللي تحت أزرار الأعلى، ووسط الشاشة
  const el = $("#v-tree"), w = el.clientWidth, H = el.clientHeight, top = 16, nodes = T.root.descendants().slice(1);
  const x0 = Math.min(-120, d3.min(nodes, PX) - LW / 2), x1 = Math.max(120, d3.max(nodes, PX) + LW / 2);
  const y0 = d3.min(nodes, PY) - LH - 14, y1 = T.base + 40, avail = H - top - 12;
  const k = Math.max(.08, Math.min(1, (w - 24) / (x1 - x0), avail / (y1 - y0)));
  const ty = center ? top + (avail - k * (y1 - y0)) / 2 - k * y0 : H - 6 - k * y1;   // عادةً: الأرض تحت الشاشة؛ «عرض الكل»: في الوسط
  return d3.zoomIdentity.translate(w / 2 - k * (x0 + x1) / 2, ty).scale(k);
}
function leafPose(sel, d) {
  const th = d.th || 0, L = th >= 0 ? 1 : -1, al = Math.atan2(-Math.cos(th), Math.sin(th)) * 180 / Math.PI, a = L > 0 ? al : al + 180;
  sel.select(".rot").attr("transform", `rotate(${a})`);
  sel.select(".off").attr("transform", `translate(${L * (LW / 2 - 2)},0)`);
  sel.selectAll(".shape,.rib,.veins,.mid").attr("transform", L > 0 ? null : "scale(-1,1)");
}
function treeUpdate(source, dur = 480) {
  const { root, gNode, gLink } = T;
  const nodes = layoutOpen(), links = root.links(), vis = nodes.slice(1);
  const t = T.svg.transition("lay").duration(dur);
  const span = vis.length ? d3.max(vis, d => d.X) - d3.min(vis, d => d.X) : 200;
  T.S = Math.max(1, Math.min(3, span / 1200));
  const tw = 30 * T.S;
  T.base = TRUNK + (T.S - 1) * 40;
  T.trunk.transition(t).attr("d", trunkPath(T.base, tw)); T.shade.transition(t).attr("d", trunkPath(T.base, tw));
  T.ground.transition(t).attr("cy", T.base + 10).attr("rx", 300 + 60 * T.S);
  const node = gNode.selectAll("g.tn").data(nodes, d => d.data.id);
  const en = node.enter().append("g").attr("opacity", 0)
    .attr("class", d => "tn " + (d._children ? "inner" : "leafn") + (d.depth === 0 ? " root" : ""))
    .attr("transform", d => d.depth ? `translate(${d.ox},${d.oy})` : `translate(0,${T.base - 46})`).on("click", (e, d) => treeClick(d));
  en.each(function (d) {
    const g = d3.select(this).append("g").attr("class", "rot").append("g").attr("class", "off"), r = d.depth === 0 ? 1.35 : 1;
    if (d._children) { g.append("ellipse").attr("class", "shape").attr("rx", NW / 2 * r).attr("ry", NH / 2 * r);
      }
    else { g.append("path").attr("class", "rib").attr("d", `M${-LW / 2 - 9} 2Q${-LW / 2 - 3} 1 ${-LW / 2 + 3} 0`);
      g.append("path").attr("class", "shape").attr("d", LEAF);
      }
    g.append("text").attr("class", "nm").attr("dy", "0.38em").attr("text-anchor", "middle").attr("x", d._children ? 0 : 3)
      .attr("font-size", d.depth === 0 ? 18 : Math.min(d._children ? 13 : 14, ((d._children ? NW : LW) - 22) / (dn(d.data).length * .58))).text(dn(d.data));
  });
  const bd = en.append("g").attr("class", "badge").attr("transform", `translate(0,${-NH / 2 - 3})`);
  bd.append("rect").attr("x", -15).attr("y", -9).attr("width", 30).attr("height", 17).attr("rx", 8.5);
  bd.append("text").attr("dy", "0.33em").attr("text-anchor", "middle");
  const all = node.merge(en);
  all.filter(d => !d._children && d.depth).each(function (d) { leafPose(d3.select(this), d); });
  all.select(".badge").style("display", d => d._children && !d.children ? null : "none")
    .select("text").text(d => d._children ? "▲ " + AR(d._children.length) : "");
  all.transition(t).attr("opacity", 1).attr("transform", d => `translate(${PX(d)},${PY(d)}) scale(${d.depth ? d.sc || 1 : 1})`);
  node.exit().transition(t).attr("opacity", 0).attr("transform", d => { const p = d.parent; return p && p.depth ? `translate(${p.X},${p.Y})` : `translate(0,${-CROWN})`; }).remove();
  const link = gLink.selectAll("path").data(links, d => d.target.data.id);
  const le = link.enter().append("path").attr("class", "lk").attr("d", d => branchPath(d.source, d.target, 0, .001));
  le.transition(t).attrTween("d", d => k => branchPath(d.source, d.target, k, Math.max(.001, k)));
  link.transition(t).attrTween("d", d => k => branchPath(d.source, d.target, k, 1));
  link.exit().transition(t).attrTween("d", d => k => branchPath(d.source, d.target, 1, Math.max(.001, 1 - k))).remove();
  treeMarks();
}
function drawGens() {}
function treeClick(d) {
  if (T) T.moved = true;
  $("#hint")?.remove(); store.set("dhf-hint", "1");
  const bx = PX(d), by = PY(d);
  if (d._children) d.children = d.children ? null : d._children;
  select(d.data.id, false);
  treeUpdate(d);
  T.svg.transition("pan").duration(520).call(T.zoom.translateTo, PX(d), PY(d) - (d.children ? 70 : 0), focusPoint());
}
function treeReveal(id, extra) {
  if (!T) return;
  const d = T.byId.get(id); if (!d) return;
  d.ancestors().slice(1).forEach(a => a.children = a._children);
  (extra || []).forEach(x => { const n = T.byId.get(x); if (n && n !== d) n.ancestors().slice(1).forEach(a => a.children = a._children); });
  treeUpdate(T.root);
  const el = $("#v-tree"), w = el.clientWidth, h = el.clientHeight;
  if (extra && extra.length) {
    const ns = [d, ...extra.map(x => T.byId.get(x)).filter(Boolean)];
    const x0 = d3.min(ns, PX) - LW, x1 = d3.max(ns, PX) + LW, y0 = d3.min(ns, PY) - LH, y1 = d3.max(ns, PY) + LH;
    const k = Math.max(.08, Math.min(1.1, (w - 30) / (x1 - x0), (h - 210) / (y1 - y0)));
    return T.svg.transition("pan").duration(650).call(T.zoom.transform, d3.zoomIdentity.translate(w / 2 - k * (x0 + x1) / 2, (h - 150) / 2 - k * (y0 + y1) / 2).scale(k));
  }
  const k = Math.max(d3.zoomTransform(T.svg.node()).k, .7);
  T.svg.transition("pan").duration(550).call(T.zoom.transform, d3.zoomIdentity.translate(w / 2 - k * PX(d), (h - 150) / 2 - k * PY(d)).scale(k));
}
function treeMarks() {
  if (!T) return;
  T.gNode.selectAll("g.tn").classed("onpath", d => pathSet.has(d.data.id)).classed("sel", d => d.data.id === sel).classed("me", d => d.data.id === ME).classed("dead", d => isDead(d.data));
  T.gLink.selectAll("path").classed("onpath", d => pathSet.has(d.target.data.id));
}

/* ---------- التبديل بين الشجرة والمخطط، وعرض/طي الكل ---------- */
let view = store.get("dhf-view") === "chart" ? "chart" : "tree", dirty = { tree: true, chart: true };
const openSet = () => { const s = new Set(); [C, T].forEach((X) => X && X.root.descendants().forEach((d) => d.children && s.add(d.data.id))); return [...s]; };
function ensureView(keep) {
  if (view === "tree" && dirty.tree) { buildTree(keep); dirty.tree = false; }
  if (view === "chart" && dirty.chart) { buildChart(keep); dirty.chart = false; }
}
function setView(v) {
  const keep = openSet(); view = v; store.set("dhf-view", v);
  $("#treeSvg").classList.toggle("hidden", v !== "tree"); $("#chartSvg").classList.toggle("hidden", v !== "chart");
  const tg = $("#vToggle"); tg.classList.toggle("is-chart", v === "chart"); tg.title = v === "tree" ? "مخطط" : "شجرة"; tg.setAttribute("aria-label", v === "tree" ? "التبديل إلى المخطط" : "التبديل إلى الشجرة");
  if (dirty[v]) { ensureView(keep); } 
  marks(); if (sel) reveal(sel);
}
$("#vToggle").onclick = () => setView(view === "tree" ? "chart" : "tree");
// ملء الشاشة: يخفي الرأس والأقسام، ويستخدم ملء الشاشة الحقيقي إذا كان الجهاز يدعمه
function setFull(on) {
  document.body.classList.toggle("full", on);
  try { if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
  $("#zFull").title = on ? "الخروج من ملء الشاشة" : "ملء الشاشة";
  setTimeout(() => { if (C) chartGens(d3.zoomTransform(C.svg.node())); }, 300);
}
$("#zFull").onclick = () => setFull(!document.body.classList.contains("full"));
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("full")) setFull(false); });
const marks = () => { treeMarks(); chartMarks(); };
const reveal = (id) => (view === "tree" ? treeReveal(id) : chartReveal(id));
const Z = () => (view === "tree" ? T : C);
function openAll(on) {
  clearSel();
  if (view === "tree") { T.byId.forEach((d) => (d.children = on ? d._children : d.depth < 1 ? d._children : null)); treeUpdate(T.root); T.svg.transition().duration(450).call(T.zoom.transform, treeHome(on)); }
  else { C.byId.forEach((d) => (d.children = on ? d._children : d.depth < 1 ? d._children : null)); chartUpdate(C.root); C.svg.transition().duration(450).call(C.zoom.transform, chartHome()); }
  dirty[view === "tree" ? "chart" : "tree"] = true;
}
$("#openAll").onclick = () => openAll(true);
$("#foldAll").onclick = () => openAll(false);

/* ====================== بطاقة الشخص ====================== */
function select(id, reveal) {
  const p = P.get(id); if (!p) return;
  if (tab !== "tree") setTab("tree");
  sel = id; pathSet = new Set(chain(p).map((x) => x.id));
  renderPanel();
  if (reveal) { const keep = view; ensureView(); keep === view && (view === "tree" ? treeReveal(id) : chartReveal(id)); } marks();
}
function clearSel() { sel = null; pathSet = new Set(); document.body.classList.remove("has-pp"); marks(); }
function renderPanel() {
  const p = sel && P.get(sel), el = $("#pp");
  document.body.classList.toggle("has-pp", !!p);
  if (!p) return;
  const dead = isDead(p), rm = relToMe(p.id), info = [["الميلاد", p.birthDate], ["الوفاة", dead && p.deathDate !== DEAD ? p.deathDate : ""], ["العمل أو المنصب", p.position], ["المدينة", p.city], ["ملاحظة", p.note]].filter((x) => x[1]);
  el.innerHTML = `<div class="pp-head"><div class="pp-main"><div class="mq"><span>${esc(fullName(p))}</span></div>
      <div class="pp-meta">${dead ? `<span class="pp-dead">رحمه الله</span> · ` : ""}${rm ? `<span class="pp-rel">${esc(rm)}</span> · ` : ""}الجيل ${AR(p.depth + 1)} · ${sonsTxt(p.kids.length)}${info.length ? ` · ${info.map(([k, v]) => `${k}: ${esc(v)}`).join(" · ")}` : ""}</div></div>
      <button class="xbtn" data-a="close" aria-label="إغلاق">×</button></div>
    <div class="acts">
      <button data-a="copy">${ICON.copy}نسخ الاسم</button>
      <button data-a="share">${ICON.share}مشاركة</button>
      <button data-a="son">${ICON.add}إضافة ابن</button>
      <button data-a="fix">${ICON.edit}${can("edit") ? "تعديل" : "اقتراح تعديل"}</button>
      ${can("edit") && p !== ROOT ? `<button data-a="del" class="danger">${ICON.del}حذف</button>` : ""}
    </div>`;
  requestAnimationFrame(() => { const m = $(".mq", el), sp = $(".mq span", el), over = sp.scrollWidth - m.clientWidth;
    m.classList.toggle("run", over > 2); if (over > 2) { sp.style.setProperty("--mq", over + 24 + "px"); sp.style.animationDuration = Math.max(6, over / 30) + "s"; } });
  requestAnimationFrame(() => document.documentElement.style.setProperty("--pph", el.offsetHeight + "px"));
}
$("#pp").onclick = (e) => {
  const a = e.target.closest("[data-a]")?.dataset.a, p = sel && P.get(sel); if (!a || !p) return;
  if (a === "close") clearSel();
  else if (a === "copy") { copyText(fullName(p), "تم نسخ الاسم كاملاً"); logEvent("copy", { personId: p.id, personName: fullName(p) }); if (/^[A-Za-z0-9_-]+$/.test(p.id)) recordCounter("analyticsNames", p.id); }
  else if (a === "share") sharePerson(p);
  else if (a === "son") openRequest("addChild", p);
  else if (a === "fix") openRequest("update", p);
  else if (a === "del") deletePerson(p);
};
const siteUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");
async function sharePerson(p) {
  const url = `${siteUrl()}?p=${encodeURIComponent(p.id)}`, text = `${fullName(p)}\nمن ${SITE_TITLE}`;
  logEvent("share", { personId: p.id, personName: fullName(p) });
  if (navigator.share) { try { await navigator.share({ title: SITE_TITLE, text, url }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  copyText(`${text}\n${url}`, "تم نسخ الرابط، ألصقه في الواتساب");
}
async function shareSite() {
  const url = siteUrl(), text = `${SITE_TITLE} — إرثٌ يُحفظ، وصلةٌ لا تنقطع`;
  logEvent("share", { page: "site" });
  if (navigator.share) { try { await navigator.share({ title: SITE_TITLE, text, url }); return; } catch (e) { if (e?.name === "AbortError") return; } }
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
  if (save && user && db && profile) { const d = { personId: ME || "" }; if (ME) d.name = treeName(P.get(ME)); Object.assign(profile, d); F.setDoc(ref("profiles", user.uid), d, { merge: true }).catch(() => {}); }
  marks(); renderPanel();
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
    // المساران يبدآن من الجد المشترك (مرة واحدة) ثم يتفرعان لكل شخص
    const show = (arr) => arr.slice(1).map((x) => `<i></i><span class="${x === r.A || x === r.B ? "e" : ""}">${esc(dn(x))}</span>`).join("");
    const a1 = show(r.ca), b1 = show(r.cb), two = a1 && b1;
    res = a === b ? `<p class="note">اخترت نفس الشخص مرتين.</p>` : `<div class="relbox"><div class="muted">${esc(nB)} بالنسبة ${you ? "لك" : "لـ" + esc(dn(r.A))}</div><div class="big">${esc(lab)}</div>
      <div class="muted">يلتقيان في: <b>${esc(lineage(r.common))}</b></div>
      <div class="relmerge"><span class="c">${esc(dn(r.common))}</span>${two ? `<div class="fork"></div>` : ""}
        <div class="${two ? "relcols" : ""}">${two ? `<div class="chainv">${a1}</div><div class="chainv">${b1}</div>` : `<div class="chainv">${a1 || b1}</div>`}</div></div>
      <button class="btn wide ghost" data-rel="show">أظهرهما في الشجرة</button></div>`;
  }
  const s = openSheet("صلة القرابة", `<p class="muted" style="margin:0 0 10px">اختر شخصين لتعرف صلة القرابة بينهما وأين يلتقيان في النسب.</p>
    <div class="relcols">${slot("a", a, "الشخص الأول<br><small>اضغط للاختيار</small>")}${slot("b", b, "الشخص الثاني<br><small>اضغط للاختيار</small>")}</div>
    ${ME && a !== ME ? `<button class="btn small ghost" style="margin-top:8px" data-rel="me">اجعل الأول: أنا</button>` : ""}${res}`);
  s.onclick = (e) => {
    const sl = e.target.closest("[data-slot]")?.dataset.slot, act = e.target.closest("[data-rel]")?.dataset.rel;
    if (sl) pickPerson(sl === "a" ? "اختر الشخص الأول" : "اختر الشخص الثاني", (p) => openRel(sl === "a" ? p.id : a, sl === "b" ? p.id : b));
    if (act === "me") openRel(ME, b);
    if (act === "show") { closeSheet(); const r = relate(a, b); select(b, true); chain(P.get(a)).forEach((x) => pathSet.add(x.id)); reveal(a); reveal(b); marks(); }
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
    <div class="dsec"><h3>أخرى</h3>${item("share", "share", "مشاركة الموقع")}${item("intro", "info", "عن الشجرة")}${item("help", "help", "طريقة الاستخدام")}</div>`;
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
  else if (a === "intro") openIntro();
};
// الواجهة التعريفية (تظهر أول زيارة، ومن القائمة: «عن الشجرة»)
function openIntro() {
  store.set("dhf-welcome", "2");
  const el = $("#intro"); el.hidden = false; el.scrollTop = 0; document.body.classList.add("intro-open");
  setTimeout(() => $(".intro-x", el).focus(), 50);
}
function closeIntro() { $("#intro").hidden = true; document.body.classList.remove("intro-open"); }
$("#intro").onclick = (e) => {
  const a = e.target.closest("[data-intro]")?.dataset.intro; if (!a) return;
  closeIntro(); if (a === "usage") openHelp();
};
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#intro").hidden) closeIntro(); });

function openHelp() {
  openSheet("طريقة الاستخدام", `<div class="welcome">
    <ol>
      <li>اضغط على أي اسم لتظهر أبناؤه.</li>
      <li>للبحث: اضغط <b>بحث</b> واكتب الاسم ثم اسم الأب.</li>
      <li>من <b>القائمة</b> حدد اسمك، فتظهر لك صلة قرابتك بكل شخص.</li>
      <li>لإضافة ابن أو تصحيح معلومة: اختر الاسم ثم اضغط الزر المناسب، ويراجعه المشرف قبل نشره.</li>
    </ol>
    <p class="muted">أزرار الجانب: تبديل الشجرة والمخطط، عرض الكل، طي الكل، التكبير والتصغير، وملء الشاشة.</p>
    <button class="btn wide" data-x2>حسناً</button></div>`).querySelector("[data-x2]").onclick = closeSheet;
}

/* ====================== الدخول والحساب ====================== */
let confirmation = null;
async function openLogin(after) {
  if (!auth) return toast("الخدمة غير متاحة الآن، حاول لاحقاً");
  // لا نطلب الدخول قبل ما يتأكد Firebase من الجلسة المحفوظة في الجهاز
  try { await auth.authStateReady(); } catch (e) {}
  if (auth.currentUser) { user = user || auth.currentUser; if (after) after(); return; }
  const s = openSheet("تسجيل الدخول", `<p class="muted" style="margin:0">سنرسل لك رمز تحقق برسالة نصية. رقمك لا يظهر للعامة.</p>
    <form id="fPhone"><label class="f" for="ph">رقم الجوال</label><input class="inp" id="ph" type="tel" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" autocomplete="tel" required>
      <button class="btn wide" type="submit">إرسال الرمز</button></form>
    <form id="fCode" class="hidden"><label class="f" for="cd">رمز التحقق</label><input class="inp" id="cd" name="otp" type="text" inputmode="numeric" pattern="[0-9٠-٩]*" dir="ltr" autocomplete="one-time-code" maxlength="6" required style="font-size:1.4rem;letter-spacing:.4em;text-align:center">
      <button class="btn wide" type="submit">دخول</button><button class="btn wide ghost" type="button" id="again">إرسال رمز جديد</button></form><p class="err" id="lerr"></p>`);
  $("#again", s).onclick = () => { $("#fCode", s).classList.add("hidden"); $("#fPhone", s).classList.remove("hidden"); const b = $("#fPhone button", s); b.disabled = false; b.textContent = "إرسال الرمز"; $("#lerr", s).textContent = ""; };
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
  // يقرأ الرمز من الرسالة تلقائياً (آيفون يقترحه فوق الكيبورد، وأندرويد كذلك)، وأول ما يكتمل ٦ أرقام يدخل مباشرة
  $("#cd", s).addEventListener("input", (e) => { const n = e.target.value.replace(/[^0-9٠-٩۰-۹]/g, ""); if (n.length === 6) $("#fCode", s).requestSubmit(); });
  $("#fCode", s).onsubmit = async (e) => {
    e.preventDefault();
    // الأرقام العربية (٠١٢…) تتحول لإنجليزية، فبعض الجوالات تكتب الرمز بالعربي
    const code = $("#cd", s).value.replace(/[٠-٩]/g, (x) => "٠١٢٣٤٥٦٧٨٩".indexOf(x)).replace(/[۰-۹]/g, (x) => "۰۱۲۳۴۵۶۷۸۹".indexOf(x)).replace(/\D/g, "");
    if (code.length !== 6) return ($("#lerr", s).textContent = "الرمز ٦ أرقام، اكتبه كاملاً.");
    const b = $("#fCode button[type=submit]", s); if (b.disabled) return; b.disabled = true; b.textContent = "جارٍ التحقق…";
    try { await confirmation.confirm(code); loginAfter = after || null; closeSheet(); }
    catch (err) {
      console.warn("confirm", err?.code, err);
      const c = err?.code || "";
      $("#lerr", s).textContent = c === "auth/invalid-verification-code" ? "الرمز غير صحيح. تأكد أنه آخر رمز وصلك."
        : c === "auth/code-expired" ? "انتهت صلاحية الرمز. اطلب رمزاً جديداً."
        : c === "auth/too-many-requests" ? "محاولات كثيرة. انتظر قليلاً ثم حاول."
        : c === "auth/network-request-failed" ? "تعذر الاتصال. تأكد من الإنترنت وحاول مرة ثانية."
        : "تعذر الدخول (" + (c || "خطأ غير معروف") + ").";
      b.disabled = false; b.textContent = "دخول";
    }
  };
}
let loginAfter = null;
// اسم مختصر من الشجرة (يكفي للمشرف): الاسم وثلاثة من آبائه
const treeName = (p) => cleanText(chain(p).slice(0, 4).map(dn).join(" بن ") + " " + FAMILY, 80);
async function saveProfile(data) {
  const isNew = !profile?.createdAt;
  if (isNew) data.createdAt = F.serverTimestamp();
  await F.setDoc(ref("profiles", user.uid), data, { merge: true });
  profile = { ...(profile || {}), ...data, createdAt: profile?.createdAt || new Date() };
  if (isNew) logEvent("register", { personId: data.personId || "", personName: data.name });
}
function openProfile(first = false) {
  const me = ME && P.get(ME);
  const s = openSheet(first ? "مرحباً بك" : "حسابي", `<p class="muted" style="margin:0">${first ? "حدد اسمك في الشجرة، أو اكتب اسمك إذا لم تجده." : `<span dir="ltr">${esc(user.phoneNumber)}</span>`}</p>
    <form id="fProf"><label class="f">اسمك في الشجرة</label><button type="button" class="pick${me ? " set" : ""}" id="pme">${me ? esc(lineage(me)) : "اضغط لتحديد اسمك"}</button>
    ${me ? "" : `<label class="f" for="pn">أو اكتب اسمك</label><input class="inp" id="pn" value="${esc(profile?.name || "")}" placeholder="الاسم واسم الأب والجد">`}
    <button class="btn wide" type="submit">حفظ</button></form>`);
  $("#pme", s).onclick = () => pickPerson("حدد اسمك في الشجرة", (p) => { setMe(p.id, false); openProfile(first); });
  $("#fProf", s).onsubmit = async (e) => {
    e.preventDefault();
    const name = me ? treeName(me) : cleanText($("#pn", s)?.value || "", 80);
    if (!name) return toast("حدد اسمك في الشجرة أو اكتبه");
    try { await saveProfile({ name, phone: user.phoneNumber, personId: ME || "" }); closeSheet(); toast("تم الحفظ");
      if (loginAfter) { const f = loginAfter; loginAfter = null; f(); } }
    catch (err) { console.warn(err); toast("تعذر الحفظ"); }
  };
}
async function onUser(u) {
  user = u; profile = null; myRole = null; ROLES = []; PENDING = [];
  if (u) {
    try { const ps = await F.getDoc(ref("profiles", u.uid)); if (ps.exists()) profile = ps.data(); } catch (e) {}
    if (profile?.personId && P.has(profile.personId) && !ME) setMe(profile.personId, false);
    try { if (!isOwner() && u.phoneNumber) { const rs = await F.getDoc(ref("reviewers", u.phoneNumber)); if (rs.exists() && rs.data().active === true) myRole = rs.data(); } } catch (e) {}
    if (isStaff()) { await loadRoles(); await loadPending(); }
    const fresh = sessionStorage.getItem("dhf-login") !== u.uid;
    if (fresh) { sessionStorage.setItem("dhf-login", u.uid); if (authReady) logEvent("login"); }
    // إذا كان محدداً اسمه في الشجرة نكتفي به ولا نسأله شيئاً
    if (!profile && ME && P.has(ME)) { try { await saveProfile({ name: treeName(P.get(ME)), phone: u.phoneNumber, personId: ME }); } catch (e) { console.warn(e); } }
    if (!profile && !isOwner()) openProfile(true);
    else if (loginAfter) { const f = loginAfter; loginAfter = null; f(); }
  }
  $("#menuDot").classList.toggle("hidden", !PENDING.length);
  renderPanel();
  if (tab === "admin") isStaff() ? renderAdmin() : setTab("tree");
  if (!authReady) { authReady = true; if (!sessionStorage.getItem("dhf-visit")) { sessionStorage.setItem("dhf-visit", "1"); logEvent("visit", { page: location.hash.slice(1) || "tree" }); } }
}

/* ====================== الطلبات (إضافة ابن / تعديل) ====================== */
const plain = () => ALL.map(({ kids, depth, desc, ...p }) => p);
function openRequest(type, p) {
  if (!db) return toast("الخدمة غير متاحة الآن");
  if (!user) return openLogin(() => openRequest(type, p));
  const direct = can("edit"), add = type === "addChild";
  const s = openSheet(add ? `إضافة ابن لـ ${esc(dn(p))}` : `${direct ? "تعديل" : "اقتراح تعديل"}: ${esc(dn(p))}`,
    `<p class="muted" style="margin:0">${esc(add ? "الأب: " + lineage(p) : lineage(p))}</p>
    <form id="fReq"><label class="f" for="rn">${add ? "اسم الابن" : "الاسم"}</label><input class="inp" id="rn" required maxlength="60" value="${add ? "" : esc(p.name)}">
    ${add ? "" : `<label class="f" for="rb">تاريخ الميلاد</label><input class="inp" id="rb" maxlength="30" value="${esc(p.birthDate || "")}" placeholder="مثال: ١٤٠٥هـ">
      <label class="chk"><input type="checkbox" id="rdead" ${isDead(p) ? "checked" : ""}> متوفى رحمه الله</label>
      <div id="rdBox" class="${isDead(p) ? "" : "hidden"}"><label class="f" for="rd">تاريخ الوفاة (اختياري)</label><input class="inp" id="rd" maxlength="30" value="${esc(p.deathDate && p.deathDate !== DEAD ? p.deathDate : "")}" placeholder="مثال: ١٤٣٠هـ"></div>
      <label class="f" for="rp">العمل أو المنصب</label><input class="inp" id="rp" maxlength="100" value="${esc(p.position || "")}">
      <label class="f" for="rc">المدينة</label><input class="inp" id="rc" maxlength="60" value="${esc(p.city || "")}">
      <label class="f" for="rnote">ملاحظة</label><input class="inp" id="rnote" maxlength="500" value="${esc(p.note || "")}">`}
    ${direct ? "" : `<label class="f" for="rr">مصدر المعلومة أو سبب الطلب</label><textarea class="inp" id="rr" maxlength="1000" placeholder="مثال: أنا ابنه، أو حسب الصك…"></textarea>`}
    <p class="note hidden" id="dup"></p>
    <button class="btn wide" type="submit">${direct ? "حفظ مباشرة" : "إرسال للمراجعة"}</button></form>
    ${direct ? `<p class="note">لديك صلاحية التعديل المباشر، وسيُسجَّل التعديل باسمك.</p>` : `<p class="note">يراجع المشرف طلبك قبل نشره، وتقدر تتابعه من القائمة ← طلباتي.</p>`}`);
  let confirmed = "";
  if ($("#rdead", s)) $("#rdead", s).onchange = (e) => $("#rdBox", s).classList.toggle("hidden", !e.target.checked);
  $("#rn", s).oninput = () => { confirmed = ""; $("#dup", s).classList.add("hidden"); };
  $("#fReq", s).onsubmit = async (e) => {
    e.preventDefault(); const b = e.submitter;
    const v = (id) => ($("#" + id, s)?.value || "");
    const name = cleanText(v("rn"), 60); if (!name) return toast("اكتب الاسم أولاً");
    // تنبيه الأسماء المكررة: نفس الاسم لنفس الأب
    const parentId = add ? p.id : p.parent, twins = add || name !== p.name ? sameNameSiblings(plain(), parentId, name, add ? "" : p.id) : [];
    if (twins.length && confirmed !== name) {
      confirmed = name; const d = $("#dup", s); d.classList.remove("hidden");
      d.textContent = `تنبيه: يوجد بالفعل ابن باسم «${twins[0].name}» لـ ${P.get(parentId) ? lineage(P.get(parentId)) : "نفس الأب"}. إذا كان شخصاً آخر بنفس الاسم اضغط الزر مرة ثانية.`;
      b.textContent = direct ? "حفظ رغم ذلك" : "إرسال رغم ذلك"; return;
    }
    const proposed = add ? { name, parent: p.id, note: "" } : cleanUpdate({ name, birthDate: v("rb"), deathDate: $("#rdead", s)?.checked ? (cleanText(v("rd"), 30) || DEAD) : "", position: v("rp"), city: v("rc"), note: v("rnote") });
    b.disabled = true;
    try {
      if (direct) {
        // رسالة تأكيد قبل الحفظ المباشر
        const what = add ? `<p>إضافة <b>«${esc(name)}»</b> ابناً لـ</p><p class="cfocus">${esc(lineage(p))}</p>`
          : `<p class="cfocus">${esc(lineage(p))}</p>${describe(p, proposed) ? `<p>${esc(describe(p, proposed))}</p>` : `<p class="muted">لا يوجد تغيير.</p>`}`;
        if (!(await confirmBox(add ? "تأكيد الإضافة" : "تأكيد التعديل", what, "نعم، احفظ"))) { b.disabled = false; return; }
        const id = await applyChange({ type, personId: p.id, proposed });
        logEvent(add ? "add" : "edit", { personId: id, personName: add ? `${name} بن ${lineage(p)}` : lineage(p), detail: add ? "" : describe(p, proposed) });
        await loadPeople(true); closeSheet(); toast("تم الحفظ");
        keepOnParent(p.id, add ? id : null);
      } else {
        await F.setDoc(F.doc(col("changeRequests")), {
          type, personId: p.id, personName: cleanText(p.name, 60), personLineage: cleanText(lineage(p), 400), proposed, reason: cleanText(v("rr"), 1000),
          scope: scopeOf(p), submittedBy: user.uid, submittedPhone: user.phoneNumber, submittedName: cleanText(profile?.name || "", 80),
          submittedRelation: cleanText(profile?.relation || "", 80), status: "pending", createdAt: F.serverTimestamp() });
        logEvent("request", { personId: p.id, personName: lineage(p), detail: add ? "إضافة الابن: " + name : "تعديل معلومات" });
        closeSheet(); toast("أُرسل طلبك للمراجعة، شكراً لك");
      }
    } catch (err) { console.warn(err); b.disabled = false; toast("تعذر الإرسال: " + (err?.message || "حاول مرة ثانية")); }
  };
}
// تطبيق إضافة أو تعديل على قاعدة البيانات: نسخة احتياطية يومية، ثم الشخص، ثم النسخة السريعة (مثل النظام الحالي)
// بعد الإضافة يبقى التحديد على الأب، وتنفتح أبناؤه ليظهر الابن الجديد
function keepOnParent(pid, childId) {
  select(pid, false);
  if (view === "tree") treeReveal(pid, childId ? [childId] : null); else chartReveal(childId || pid);
  marks();
}
async function applyChange(r) {
  const all = await loadAllPersons(db), base = all.length ? all.filter((p) => p && p.id && p.name) : plain();
  const map = new Map(base.map((p) => [p.id, p])), target = map.get(r.personId);
  if (!target) throw new Error("الشخص المستهدف غير موجود");
  await ensureDailyBackup(db, base, user.uid);
  let next, id;
  if (r.type === "addChild") {
    const name = cleanText(r.proposed?.name, 60); if (!name) throw new Error("الاسم فارغ");
    const child = { id: newPersonId(new Set(map.keys())), name, parent: target.id, note: "" };
    await F.setDoc(ref("persons", child.id), child); next = [...base, child]; id = child.id;
  } else {
    const updated = cleanPerson({ ...target, ...cleanUpdate(r.proposed || {}), id: target.id, parent: target.parent });
    await F.setDoc(ref("persons", target.id), updated); next = base.map((p) => (p.id === target.id ? updated : p)); id = target.id;
  }
  try { await saveTreeSnapshot(db, next, user.uid); } catch (e) { console.warn(e); toast("تم الحفظ، لكن تعذر تحديث النسخة السريعة"); }
  return id;
}
// نافذة تأكيد صغيرة فوق أي نافذة مفتوحة
function confirmBox(title, html, okText = "تأكيد", danger = false) {
  return new Promise((res) => {
    const w = document.createElement("div"); w.className = "cbox-bg";
    w.innerHTML = `<div class="cbox" role="alertdialog" aria-modal="true"><h3>${title}</h3><div class="cbody">${html}</div>
      <div class="row"><button class="btn${danger ? " red" : ""}" data-c="ok">${okText}</button><button class="btn ghost" data-c="no">إلغاء</button></div></div>`;
    const done = (v) => { w.remove(); res(v); };
    w.onclick = (e) => { const c = e.target.closest("[data-c]")?.dataset.c; if (c) done(c === "ok"); else if (e.target === w) done(false); };
    document.body.appendChild(w); $("[data-c=ok]", w).focus();
  });
}
// حذف اسم (للمدراء فقط) — بعد التأكيد، مع نسخة احتياطية يومية قبل الحذف
async function deletePerson(p) {
  if (!can("edit")) return;
  if (p.kids.length) return confirmBox("لا يمكن الحذف", `<p>لـ <b>${esc(dn(p))}</b> ${esc(sonsTxt(p.kids.length))} في الشجرة. احذف الأبناء أولاً أو انقلهم، ثم احذف الاسم.</p>`, "حسناً");
  const ok = await confirmBox("تأكيد الحذف", `<p>سيُحذف من الشجرة:</p><p class="cfocus">${esc(lineage(p))}</p><p class="muted">تُحفظ نسخة احتياطية قبل الحذف، ويُسجَّل الحذف باسمك.</p>`, "نعم، احذف", true);
  if (!ok) return;
  try {
    const all = await loadAllPersons(db), base = all.length ? all.filter((x) => x && x.id && x.name) : plain();
    if (base.some((x) => x.parent === p.id)) throw new Error("لهذا الاسم أبناء");
    await ensureDailyBackup(db, base, user.uid);
    await F.deleteDoc(ref("persons", p.id));
    const parent = p.parent, name = lineage(p);
    try { await saveTreeSnapshot(db, base.filter((x) => x.id !== p.id), user.uid); } catch (e) { console.warn(e); }
    logEvent("delete", { personId: p.id, personName: name });
    if (ME === p.id) setMe(null, true);
    clearSel(); await loadPeople(true); toast("تم الحذف");
    if (P.has(parent)) select(parent, true);
  } catch (err) { console.warn(err); toast("تعذر الحذف: " + (err?.message || "حاول مرة ثانية")); }
}
const FIELDS = { name: "الاسم", birthDate: "الميلاد", deathDate: "الوفاة", position: "العمل", city: "المدينة", note: "ملاحظة" };
const describe = (p, prop) => Object.keys(FIELDS).filter((k) => k in prop && (prop[k] || "") !== (p[k] || "")).map((k) => `${FIELDS[k]}: ${p[k] || "—"} ← ${prop[k] || "—"}`).join("، ");
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
async function loadRoles() { try { const s = await F.getDocs(col("reviewers")); ROLES = s.docs.map((x) => ({ id: x.id, ...x.data() })).filter((x) => x.active === true).map((x) => ({ ...x, kind: x.kind || "admin", perms: x.perms || { review: true } })); } catch (e) { ROLES = []; } }
// المسؤول عن الطلب: أقرب مشرف فرع للاسم، وإلا المدراء
function responsible(r) {
  const t = P.get(r.personId), sc = r.scope || (t ? scopeOf(t) : []);
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
  const el = $("#admin"), tb = $("#toolsBox"); if (tb) { tb.classList.add("hidden"); document.body.appendChild(tb); }
  if (!isStaff()) { el.innerHTML = `<p class="empty">هذه الصفحة للمدراء والمشرفين فقط.</p>`; return; }
  const tabs = [["req", "الطلبات", PENDING.length], can("roles") && ["roles", "المدراء والمشرفون"], can("logs") && ["stats", "الإحصائيات"], can("logs") && ["logs", "السجل"], !isMod() && ["tools", "التنزيل والنسخ"]].filter(Boolean);
  if (!tabs.some((t) => t[0] === atab)) atab = "req";
  el.innerHTML = `<div class="row" style="margin-bottom:10px"><h2 style="margin:0;flex:1;color:var(--g)">لوحة الإدارة</h2><button class="btn small ghost" data-ad="back">رجوع للشجرة</button></div>
    <p class="muted" style="margin:0 0 10px;font-size:.85rem">${isOwner() ? "أنت المدير العام: كل الصلاحيات." : isMod() ? `مشرف على: ${esc((myRole.branches || []).map((b) => P.get(b) ? lineage(P.get(b)) : b).join("، "))}` : "مدير: " + Object.keys(PERMS).filter((k) => (myRole.perms || { review: true })[k]).map((k) => PERMS[k]).join("، ")}</p>
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
      : Object.keys(FIELDS).filter((k) => r.proposed && k in r.proposed && (r.proposed[k] || "") !== ((target || {})[k] || "")).map((k) => `<div><dt>${FIELDS[k]}</dt><dd>${esc((target || {})[k] || "—")} ← <b>${esc(r.proposed?.[k] || "—")}</b></dd></div>`).join("") || "<div>لا يوجد اختلاف</div>";
    const flags = [];
    if (!target) flags.push("الشخص المستهدف غير موجود في الشجرة الحالية");
    else if (r.type === "addChild" && sameNameSiblings(plain(), r.personId, r.proposed?.name || "").length) flags.push("يوجد بالفعل ابن بنفس الاسم لهذا الأب");
    else if (r.type !== "addChild" && r.proposed?.name && r.proposed.name !== target.name && sameNameSiblings(plain(), target.parent, r.proposed.name, target.id).length) flags.push("الاسم الجديد مطابق لاسم أخ موجود");
    if (r.type === "addChild" && PENDING.filter((x) => x.type === "addChild" && x.personId === r.personId && norm(x.proposed?.name) === norm(r.proposed?.name)).length > 1) flags.push("يوجد طلب آخر معلّق بنفس الاسم لنفس الأب");
    const father = target ? lineage(target) : (r.personLineage || "");
    const focus = r.type === "addChild"
      ? `إضافة <b class="hl">«${esc(r.proposed?.name)}»</b> ابناً لـ <b>${esc(father)}</b>`
      : `تعديل بيانات <b>${esc(father)}</b>`;
    return `<div class="item rq" data-req="${r.id}"><div class="rq-t">${r.type === "addChild" ? "طلب إضافة ابن" : "طلب تعديل"}</div>
      <p class="rq-focus">${focus}</p>
      ${r.type === "addChild" ? "" : `<dl class="diff">${diff}</dl>`}
      ${flags.map((f) => `<p class="note" style="background:#f7e3e1;color:var(--red)">⚠️ ${esc(f)}</p>`).join("")}
      <dl class="rq-meta">
        <div><dt>تاريخ الطلب</dt><dd>${fmtTime(r.createdAt) || "—"}</dd></div>
        <div><dt>مقدم الطلب</dt><dd>${esc(r.submittedName || "—")}</dd></div>
        <div><dt>رقمه</dt><dd><bdi dir="ltr">${esc(r.submittedPhone || "—")}</bdi></dd></div>
        ${r.reason ? `<div><dt>المصدر</dt><dd>${esc(r.reason)}</dd></div>` : ""}
        <div><dt>المسؤول</dt><dd>${rs.mods.length ? "مشرف " + esc(dn(P.get(rs.at) || { name: "" })) + " (" + esc(rs.mods.map((m) => m.name).join("، ")) + ")" : "المدراء"}</dd></div>
      </dl>
      <input class="inp" style="margin-top:8px" placeholder="ملاحظة لمقدم الطلب (اختياري)" data-note>
      <div class="row" style="margin-top:8px"><button class="btn" data-dec="approve">قبول</button><button class="btn red" data-dec="reject">رفض</button></div></div>`;
  }).join("");
  pane.onclick = async (e) => {
    const b = e.target.closest("[data-dec]"); if (!b) return;
    const card = b.closest("[data-req]"), r = PENDING.find((x) => x.id === card.dataset.req), note = $("[data-note]", card).value.trim();
    $$("button", card).forEach((x) => (x.disabled = true));
    try {
      const fresh = await F.getDoc(ref("changeRequests", r.id));
      if (!fresh.exists() || fresh.data().status !== "pending") throw new Error("الطلب لم يعد معلّقاً");
      if (b.dataset.dec === "approve") await applyChange(fresh.data());
      await F.updateDoc(ref("changeRequests", r.id), { status: b.dataset.dec === "approve" ? "approved" : "rejected", reviewedAt: F.serverTimestamp(), reviewedBy: user.uid, reviewedByPhone: user.phoneNumber,
        reviewedByRole: isOwner() ? "owner" : isMod() ? "mod" : "reviewer", reviewedByName: cleanText(profile?.name || myRole?.name || "", 80), reviewNote: cleanText(note, 300) });
      logEvent(b.dataset.dec, { personId: r.personId, personName: r.type === "addChild" ? `${r.proposed?.name} بن ${r.personLineage}` : r.personLineage, detail: `مقدم الطلب: ${r.submittedName || r.submittedPhone}${note ? " · " + note : ""}` });
      toast(b.dataset.dec === "approve" ? "تم القبول والنشر" : "تم الرفض");
      if (b.dataset.dec === "approve") await loadPeople(true);
      await loadPending(); renderAdmin();
    } catch (err) { console.warn(err); toast("تعذر التنفيذ: " + (err?.message || "حاول مرة ثانية")); $$("button", card).forEach((x) => (x.disabled = false)); }
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
      try { await F.deleteDoc(ref("reviewers", x.id)); logEvent("role", { detail: `حذف ${x.kind === "mod" ? "المشرف" : "المدير"}: ${x.name} (${x.id})` }); await loadRoles(); renderAdmin(); toast("تم الحذف"); } catch (err) { toast("تعذر الحذف"); } }
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
      const data = { phone: ph, active: true, name: cleanText(st.name, 80), kind: st.kind,
        perms: st.kind === "admin" ? { review: !!st.perms.review, edit: !!st.perms.edit, roles: !!st.perms.roles, logs: !!st.perms.logs } : {},
        branches: st.kind === "mod" ? st.branches.slice(0, 20) : [], branchNames: st.kind === "mod" ? st.branches.slice(0, 20).map((b) => cleanText(P.get(b) ? lineage(P.get(b)) : b, 200)) : [],
        createdAt: x?.createdAt || F.serverTimestamp(), createdBy: x?.createdBy || user.uid, updatedAt: F.serverTimestamp(), updatedBy: user.uid };
      try { await F.setDoc(ref("reviewers", ph), data);
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
    try {
      const [pages, weeks, names] = await Promise.all([F.getDocs(col("analyticsPages")), F.getDocs(F.query(col("analyticsPageWeeks"), F.where("weekStart", "==", weekStartKey()))), F.getDocs(col("analyticsNames"))]);
      const m = new Map(pages.docs.map((x) => [x.id, x.data().count || 0])), w = new Map(weeks.docs.map((x) => [x.data().page, x.data().count || 0]));
      const top = names.docs.map((x) => ({ id: x.id, n: x.data().count || 0 })).sort((a, b) => b.n - a.n).slice(0, 15);
      const card = (k, t) => `<div class="stat"><b>${AR(m.get(k))}</b><span>${t}</span><span class="muted" style="display:block;font-size:.75rem">هذا الأسبوع: ${AR(w.get(k))}</span></div>`;
      legacy = `<div class="box"><h2>زيارات الصفحات (الإجمالي)</h2><div class="cards">${card("interactive_tree", "الشجرة التفاعلية")}${card("first_edition", "الشجرة المطبوعة")}${card("family_numbers", "العائلة بالأرقام")}</div></div>
        <div class="box"><h2>أكثر الأسماء نسخاً</h2>${top.length ? `<div class="bars">${top.map((x) => `<div class="bar"><span style="grid-column:1/3">${esc(P.get(x.id) ? lineage(P.get(x.id)) : x.id)}</span><em>${AR(x.n)}</em></div>`).join("")}</div>` : `<p class="empty">لا يوجد بعد.</p>`}</div>`;
    } catch (e) { console.warn(e); }
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
  pane.innerHTML = ""; const box = $("#toolsBox"); box.classList.remove("hidden"); pane.appendChild(box); adminTools.show();
}
let adminTools = null;
function setupAdminTools() {
  adminTools = initAdminTools({ db, auth, title: SITE_TITLE, filePrefix: FILE_PREFIX, toast, getPeople: plain, canReview: () => isStaff(), isOwner,
    onTreeReplaced(list) { const open = openSet(); setPeople(list.filter((p) => p && p.id && p.name)); dirty = { tree: true, chart: true }; ensureView(open); } });
  // سجّل استخدام أدوات الإدارة
  $("#toolsBox").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
    const what = b.id === "exportExcelBtn" ? "تنزيل Excel" : b.id === "exportTextBtn" ? "تنزيل نص" : b.id === "backupNowBtn" ? "نسخة احتياطية يدوية" : b.id === "rebuildSnapshotBtn" ? "تحديث النسخة السريعة" : b.matches("[data-backup-restore]") && b.dataset.armed !== "1" ? "استعادة نسخة احتياطية" : "";
    if (what) logEvent("tool", { detail: what }); }, true);
}
/* ====================== الشجرة المطبوعة ====================== */
// صورة خفيفة للعرض السريع، وزر «فتح بكامل الجودة» يفتح النسخة العالية في شاشة كاملة مع التكبير بالأصابع (بدون تحميل)
const HQ_SRC = "printed-full.jpg";
function openPrinted() {}
function openHQ() {
  const w = document.createElement("div"); w.className = "hq"; w.setAttribute("role", "dialog");
  w.innerHTML = `<div class="hq-bar"><b>الشجرة المطبوعة</b><span class="grow"></span><button data-h="out" aria-label="تصغير">−</button><button data-h="in" aria-label="تكبير">+</button><button data-h="x" class="hx" aria-label="إغلاق">×</button></div>
    <div class="hq-stage"><p class="muted center hq-msg">جارٍ فتح الشجرة بكامل الجودة…</p></div>`;
  document.body.appendChild(w); document.body.classList.add("hq-open");
  const st = $(".hq-stage", w), img = new Image();
  img.className = "hq-cv"; img.alt = ""; img.draggable = false; img.decoding = "async";
  img.oncontextmenu = (e) => e.preventDefault();
  const close = () => { w.remove(); document.body.classList.remove("hq-open"); removeEventListener("keydown", esck); };
  const esck = (e) => { if (e.key === "Escape") close(); }; addEventListener("keydown", esck);
  let sel = null, z = null;
  w.onclick = (e) => { const h = e.target.closest("[data-h]")?.dataset.h; if (h === "x") close();
    if (sel && h === "in") sel.transition().call(z.scaleBy, 1.6); if (sel && h === "out") sel.transition().call(z.scaleBy, 1 / 1.6); };
  img.onerror = () => { $(".hq-msg", w).textContent = "تعذر فتح الشجرة. تأكد من الإنترنت ثم حاول مرة ثانية."; };
  img.onload = () => {
    $(".hq-msg", w)?.remove();
    const W = st.clientWidth, H = st.clientHeight, fit = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const cw = img.naturalWidth * fit, ch = img.naturalHeight * fit, x0 = (W - cw) / 2, y0 = (H - ch) / 2;
    img.style.width = cw + "px"; img.style.height = ch + "px"; st.appendChild(img);
    const maxK = Math.max(4, 1.5 / fit); // يكفي للوصول لدقة الصورة الكاملة وأكثر قليلاً
    z = d3.zoom().scaleExtent([1, maxK]).translateExtent([[-W * .2, -H * .2], [W * 1.2, H * 1.2]])
      .on("zoom", (e) => { const t = e.transform; img.style.transform = `translate(${t.x + x0 * t.k}px,${t.y + y0 * t.k}px) scale(${t.k})`; });
    sel = d3.select(st).call(z); sel.call(z.transform, d3.zoomIdentity);
  };
  img.src = HQ_SRC;
}
$("#pHQ").onclick = openHQ;
$("#pPrev").onclick = openHQ;
$("#pPrev").oncontextmenu = (e) => e.preventDefault();

/* ====================== العائلة بالأرقام ====================== */
function renderNumbers() {
  const gens = d3.range(d3.max(ALL, (p) => p.depth) + 1).map((d) => ALL.filter((p) => p.depth === d).length);
  const counts = new Map();
  ALL.forEach((p) => { if (p === ROOT) return; let k = norm(dn(p)); if (["ابراهيم", "برايهم", "ابرايهم", "ابراهم"].includes(k)) k = "ابراهيم"; const it = counts.get(k) || { name: k === "ابراهيم" ? "إبراهيم" : dn(p), n: 0 }; it.n++; counts.set(k, it); });
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 10), rare = [...counts.values()].filter((x) => x.n === 1).map((x) => x.name).sort((a, b) => a.localeCompare(b, "ar"));
  const rows = (list) => `<div class="nlist">${list.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>`;
  $("#numbers").innerHTML = `<div class="cards"><div class="stat"><b>${AR(ALL.length)}</b><span>اسماً في الشجرة</span></div><div class="stat"><b>${AR(gens.length)}</b><span>جيلاً</span></div>
      <div class="stat"><b>${AR(ROOT.kids.length)}</b><span>فروع رئيسية</span></div><div class="stat"><b>${AR(counts.size)}</b><span>اسماً مختلفاً</span></div></div>
    <div class="box"><h2>الفروع الرئيسية</h2>${rows(ROOT.kids.map((b) => [esc(dn(b)), AR(b.desc + 1)]))}</div>
    <div class="box"><h2>عدد الأسماء في كل جيل</h2>${rows(gens.map((n, i) => ["الجيل " + AR(i + 1), AR(n)]))}</div>
    <div class="box"><h2>أكثر الأسماء تكراراً</h2>${rows(top.map((x) => [esc(x.name), AR(x.n)]))}</div>
    <div class="box"><h2>أسماء لم تتكرر</h2><p class="muted" style="margin-top:0">${AR(rare.length)} اسماً وردت مرة واحدة فقط</p><div class="chips">${rare.map((n) => `<span>${esc(n)}</span>`).join("")}</div></div>
    <div class="box nasab"><h2>نسب أسرة الضفيان</h2>
      <p>تنتسب أسرة الضفيان إلى آل بريد من المشارفة، من المعاضيد، من الوهبة، من بني حنظلة، من قبيلة بني تميم العدنانية.</p>
      <h3>النسب بالتفصيل:</h3>
      <p><b>ضفي بن راشد بن بريد بن محمد بن بريد بن مشرف بن عمر بن معضاد بن ريس بن زاخر بن محمد بن علوي بن وهيب بن قاسم بن موسى بن مسعود بن عقبة بن سُنَيع بن نهشل بن شداد بن زهير بن شهاب بن ربيعة بن أبي سود بن مالك بن حنظلة بن مالك بن زيد مناة بن تميم بن مُرّ بن أُدّ بن طابخة بن إلياس بن مضر بن نزار بن معد بن عدنان.</b></p>
      <h3>التسلسل القبلي:</h3>
      <p><b>الضفيان ← آل بريد ← المشارفة ← المعاضيد ← آل ريس ← الزواخر ← الوهبة ← حنظلة ← بني تميم ← مضر ← عدنان.</b></p>
      <details><summary>المصادر والمراجع</summary><ul>
        <li>الجزء من <b>راشد بن بريد</b> إلى <b>عدنان</b> تؤيده سلاسل منشورة في تراجم آل مشرف، ومنها نسب الشيخ محمد بن عبد الوهاب؛ فهو من السلسلة نفسها عند راشد بن بريد.
          <a href="https://shamela.org/gen/62e5ad2ae8804_a75cd78e9eaa28817d985b62906aec4e_gen.pdf" target="_blank" rel="noopener">مصدر للسلسلة المنشورة</a>، <a href="https://arabic-books.amuslim.org/%D8%A7%D9%84%D8%AA%D8%A7%D8%B1%D9%8A%D8%AE/Web/7656/001.htm" target="_blank" rel="noopener">نسخة نصية بديلة</a>.</li>
        <li>كتاب <i>المنتخب في ذكر نسب قبائل العرب</i> يذكر أن آل مشرف من ذرية <b>مشرف بن عمر بن معضاد بن ريس بن زاخر بن محمد بن علوي بن وهيب</b>، وأن الوهبة يجمعهم محمد بن علوي بن وهيب.
          <a href="https://khzanah.com/books/494" target="_blank" rel="noopener">نص الكتاب</a>، <a href="https://islamport.com/l/nsb/5150/69.htm" target="_blank" rel="noopener">موضع ذكر المشارفة</a>.</li></ul>
        <p class="note"><b>ملاحظة توثيقية:</b> توجد اختلافات كتابية طفيفة بين المصادر، مثل: <b>عمر/عمرو، وهيب/وهب، أبي سود/أبي الأسود، وسنيع/مشعل</b>، كما أن بعض السلاسل تسقط أحد الاسمين المتكررين «محمد بن بريد»، فلا ينبغي حسم ذلك دون وثيقة الأسرة.</p></details></div>`;
}

/* ====================== التحميل ====================== */
let remote = false;
async function loadPeople(keep) {
  if (!db) return;
  try {
    let list = null;
    try { list = await loadTreeSnapshot(db); } catch (e) { console.warn("snapshot", e); }
    if (!list) list = await loadAllPersons(db);
    list = (list || []).filter((p) => p && p.id && p.name);
    if (list.length) { const open = openSet(); setPeople(list); remote = true; dirty = { tree: true, chart: true }; ensureView(keep ? open : null); if (sel && !P.has(sel)) clearSel(); else renderPanel(); }
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
  setView(view);
  // لما يتغير حجم الشاشة (مثل شريط العنوان في الجوال) قبل ما يحرّك الزائر الشجرة، نعيد ضبطها
  addEventListener("resize", () => { if (C) chartGens(d3.zoomTransform(C.svg.node()));
    if (view === "tree" && T && !T.moved && !sel) T.svg.call(T.zoom.transform, treeHome()); });
  setTimeout(() => { if (view === "tree" && T && !T.moved && !sel) T.svg.call(T.zoom.transform, treeHome()); }, 600);
  const ok = await initFirebase();
  if (ok) { setupAdminTools(); pageVisit(tab); await loadPeople(); F.onAuthStateChanged(auth, (u) => onUser(u)); }
  route();
  if (store.get("dhf-welcome") !== "2" && !new URLSearchParams(location.search).get("p") && !$("#sheetBg").classList.contains("open")) openIntro();
})();
