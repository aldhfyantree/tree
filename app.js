import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getAnalytics,
  isSupported,
  logEvent,
  setUserId,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";

import {
  firebaseConfig,
  SITE_TITLE,
  ROOT_LABEL,
  FILE_PREFIX,
  GUIDE_KEY,
  ADMIN_PHONES,
} from "./site-config.js";
import {
  cleanText,
  cleanUpdate,
  cleanPerson,
  newPersonId,
  sameNameSiblings,
  loadTreeSnapshot,
  loadAllPersons,
  saveTreeSnapshot,
  ensureDailyBackup,
  initAdminTools,
} from "./family-tools.js";

const app = initializeApp(firebaseConfig),
  db = getFirestore(app),
  auth = getAuth(app);
let analytics = null;
isSupported()
  .then((ok) => {
    if (ok) {
      analytics = getAnalytics(app);
      logEvent(analytics, "page_view", { page_name: "interactive_tree" });
    }
  })
  .catch(() => {});
recordPageVisit("interactive_tree");
auth.languageCode = "ar";
const SEED_PEOPLE = Array.isArray(window.SEED_PEOPLE) ? window.SEED_PEOPLE : [];
// This tree has no seed fallback merge: what is in the database is the tree.
const normalizePeople = (list) =>
  (Array.isArray(list) ? list : []).filter((p) => p && p.id && p.name);
const mergeRemotePeople = (list) => normalizePeople(list);
let people = normalizePeople(SEED_PEOPLE),
  remoteLoaded = false,
  currentPerson = null,
  userProfile = null,
  confirmation = null,
  zoom = 1,
  radialState = null,
  classicState = null,
  selectedId = null,
  treeMode = "classic",
  currentRole = "user",
  expandedIds = new Set(),
  zoomBehavior = null;
let sharedPersonOpened = false;
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const ar = (n) => Number(n).toLocaleString("ar-SA");
const norm = (s) =>
  (s || "")
    .normalize("NFKD")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06edـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/عبد\s+/g, "عبد")
    .trim()
    .toLowerCase();
const isOwner = () => currentRole === "owner";
const canReview = () => currentRole === "owner" || currentRole === "reviewer";
const toast = (m) => {
  const t = $("#toast");
  t.textContent = m;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
};
async function recordCounter(group, id) {
  try {
    await setDoc(
      doc(db, group, id),
      { count: increment(1), lastEventAt: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    console.warn("Analytics counter unavailable", error);
  }
}
function weekStartKey(date = new Date()) {
  const saudiDate = new Date(date.getTime() + 3 * 60 * 60 * 1000),
    utc = new Date(
      Date.UTC(
        saudiDate.getUTCFullYear(),
        saudiDate.getUTCMonth(),
        saudiDate.getUTCDate(),
      ),
    ),
    dayFromMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - dayFromMonday);
  return utc.toISOString().slice(0, 10);
}
async function recordPageVisit(page) {
  const weekStart = weekStartKey();
  await Promise.all([
    recordCounter("analyticsPages", page),
    setDoc(
      doc(db, "analyticsPageWeeks", `${weekStart}_${page}`),
      {
        page,
        weekStart,
        count: increment(1),
        lastEventAt: serverTimestamp(),
      },
      { merge: true },
    ).catch((error) => console.warn("Weekly analytics unavailable", error)),
  ]);
}
const byId = () => new Map(people.map((p) => [p.id, p]));
const childrenMap = () => {
  const m = new Map();
  people.forEach((p) => {
    if (!m.has(p.parent)) m.set(p.parent, []);
    m.get(p.parent).push(p);
  });
  return m;
};
function lineage(p) {
  const map = byId(),
    names = [];
  let x = p;
  while (x) {
    names.push(x.name);
    x = map.get(x.parent);
  }
  return names.join(" بن ");
}
function generations() {
  const map = byId(),
    memo = new Map();
  function d(p) {
    if (!p?.parent) return 1;
    if (memo.has(p.id)) return memo.get(p.id);
    const v = 1 + d(map.get(p.parent));
    memo.set(p.id, v);
    return v;
  }
  return Math.max(...people.map(d));
}

let snapshotLoaded = false,
  peopleReady = null;
async function fetchRemotePeople() {
  // One read for the whole tree (meta/tree); the full collection is only a fallback.
  try {
    const fromSnapshot = await loadTreeSnapshot(db);
    if (fromSnapshot) {
      snapshotLoaded = true;
      return fromSnapshot;
    }
  } catch (error) {
    console.warn("Tree snapshot unavailable", error);
  }
  snapshotLoaded = false;
  return loadAllPersons(db);
}
async function loadPeople() {
  try {
    const remotePeople = await fetchRemotePeople();
    if (remotePeople.length) {
      people = normalizePeople(remotePeople);
      remoteLoaded = true;
      $("#dataStatus").textContent = "متصل بالنسخة المعتمدة";
    }
  } catch (e) {
    console.warn(e);
  }
  renderAll();
  openSharedPerson();
}
function renderAll() {
  sizeTreeCanvas();
  if ($("#peopleCount")) $("#peopleCount").textContent = ar(people.length);
  if ($("#generationCount"))
    $("#generationCount").textContent = ar(generations());
  const kids = childrenMap(),
    roots = kids.get("") || [];
  if (roots[0] && !expandedIds.size) expandedIds.add(roots[0].id);
  renderTree();
  const root = roots[0],
    branches = root ? kids.get(root.id) || [] : [];
  if ($("#branchCount")) $("#branchCount").textContent = ar(branches.length);
  if ($("#mostNames")) renderNameFrequency();
  $("#branches").innerHTML = branches
    .map(
      (p, i) =>
        `<button class="branch-btn branch-${i + 1}" data-branch="${esc(p.id)}"><span class="branch-dot"></span><b>${esc(p.name)}</b></button>`,
    )
    .join("");
}
function renderNameFrequency() {
  const names = new Map();
  people.forEach((p) => {
    const cleanName = String(p.name || "")
        .replace(/\s*«.*?»\s*/g, "")
        .trim(),
      rawKey = norm(cleanName),
      key = ["ابراهيم", "برايهم", "ابرايهم", "ابراهم"].includes(rawKey)
        ? "ابراهيم"
        : rawKey,
      displayName = key === "ابراهيم" ? "إبراهيم" : cleanName;
    if (!key) return;
    const item = names.get(key) || { name: displayName, count: 0 };
    item.count++;
    names.set(key, item);
  });
  const values = [...names.values()];
  const most = [...values]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"))
    .slice(0, 10);
  const least = [...values]
    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, "ar"))
    .slice(0, 10);
  const draw = (items) =>
    items
      .map((x) => `<span><b>${esc(x.name)}</b><em>${ar(x.count)}</em></span>`)
      .join("");
  $("#mostNames").innerHTML = draw(most);
  $("#leastNames").innerHTML = draw(least);
}
function countDesc(id, kids) {
  let n = 0;
  (kids.get(id) || []).forEach((c) => {
    n++;
    n += countDesc(c.id, kids);
  });
  return n;
}
function esc(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function visibleTree() {
  const kids = childrenMap(),
    root = people.find((x) => !x.parent);
  if (!root) return { root: null, kids, nodes: [] };
  const nodes = [];
  const walk = (p, depth) => {
    nodes.push({ ...p, depth });
    if (expandedIds.has(p.id))
      (kids.get(p.id) || []).forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
  return { root, kids, nodes };
}
function buildRadialData() {
  const { root, kids, nodes } = visibleTree();
  if (!root) return null;
  const angle = new Map([[root.id, 0]]),
    branches = (kids.get(root.id) || []).filter((b) =>
      nodes.some((n) => n.id === b.id),
    );
  const leafCount = (p) => {
      const cs = expandedIds.has(p.id) ? kids.get(p.id) || [] : [];
      return cs.length ? cs.reduce((n, c) => n + leafCount(c), 0) : 1;
    },
    weights = branches.map(leafCount),
    total = Math.max(
      1,
      weights.reduce((a, b) => a + b, 0),
    );
  let used = 0;
  function placeBranch(branch, index) {
    const start = -Math.PI / 2 + (used / total) * Math.PI * 2 + 0.08;
    used += weights[index];
    const end = -Math.PI / 2 + (used / total) * Math.PI * 2 - 0.08;
    let leaves = [];
    const collect = (p) => {
      const cs = expandedIds.has(p.id)
        ? (kids.get(p.id) || []).filter((c) => nodes.some((n) => n.id === c.id))
        : [];
      if (!cs.length) leaves.push(p);
      else cs.forEach(collect);
    };
    collect(branch);
    leaves.forEach((p, i) =>
      angle.set(
        p.id,
        start +
          (end - start) * (leaves.length === 1 ? 0.5 : i / (leaves.length - 1)),
      ),
    );
    const settle = (p) => {
      const cs = expandedIds.has(p.id)
        ? (kids.get(p.id) || []).filter((c) => nodes.some((n) => n.id === c.id))
        : [];
      cs.forEach(settle);
      if (cs.length)
        angle.set(
          p.id,
          cs.reduce((n, c) => n + angle.get(c.id), 0) / cs.length,
        );
    };
    settle(branch);
  }
  branches.forEach(placeBranch);
  const maxDepth = Math.max(1, ...nodes.map((n) => n.depth)),
    step = 64,
    size = Math.max(760, maxDepth * step * 2 + 280),
    center = size / 2;
  const placed = nodes.map((p) => {
    const r = p.depth ? 46 + p.depth * step : 0,
      a = angle.get(p.id) || 0;
    return {
      ...p,
      x: center + Math.cos(a) * r,
      y: center + Math.sin(a) * r,
      a,
      targetX: center + Math.cos(a) * r,
      targetY: center + Math.sin(a) * r,
    };
  });
  const rootNode = placed.find((n) => n.id === root.id);
  if (rootNode) {
    rootNode.fx = center;
    rootNode.fy = center;
  }
  const simulation = d3
    .forceSimulation(placed)
    .force("x", d3.forceX((d) => d.targetX).strength(0.34))
    .force("y", d3.forceY((d) => d.targetY).strength(0.34))
    .force("collide", d3.forceCollide(58).strength(1).iterations(3))
    .stop();
  for (let i = 0; i < 140; i++) simulation.tick();
  return {
    root,
    kids,
    nodes: placed,
    nodeMap: new Map(placed.map((n) => [n.id, n])),
    maxDepth,
    size,
    center,
  };
}
function radialLink(a, b) {
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2,
    dx = b.x - a.x,
    dy = b.y - a.y,
    bend = 0.16;
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
}
/* ---- Tree view: 1 SVG unit = 1 screen pixel; d3 zoom handles pan & scale ---- */
const treeRoot = () => people.find((x) => !x.parent) || null;
const readableScale = () => (window.innerWidth < 700 ? 0.92 : 0.85);
function canvasSize() {
  const c = $("#treeCanvas"),
    W = c?.clientWidth || window.innerWidth - 16,
    H = c?.clientHeight || 520;
  return { W: Math.max(280, W), H: Math.max(320, H) };
}
function sizeTreeCanvas() {
  const c = $("#treeCanvas");
  if (!c || !c.offsetParent) return;
  const top = c.getBoundingClientRect().top + window.scrollY;
  document.documentElement.style.setProperty("--tree-top", `${Math.round(top)}px`);
}
function currentSvg() {
  return treeMode === "radial" ? $("#familySvg") : $("#classicSvg");
}
function nodePos(id) {
  if (treeMode === "radial") {
    const n = radialState?.nodeMap.get(id);
    return n ? { x: n.x, y: n.y } : null;
  }
  const n = classicState?.nodeMap.get(id);
  return n ? { x: n.px, y: n.py } : null;
}
function allPositions() {
  return treeMode === "radial"
    ? [...(radialState?.nodeMap.values() || [])].map((n) => ({ x: n.x, y: n.y }))
    : [...(classicState?.nodeMap.values() || [])].map((n) => ({ x: n.px, y: n.py }));
}
function boundsOf(points) {
  const padX = treeMode === "radial" ? 62 : 70,
    padY = 28;
  return {
    x0: Math.min(...points.map((p) => p.x)) - padX,
    x1: Math.max(...points.map((p) => p.x)) + padX,
    y0: Math.min(...points.map((p) => p.y)) - padY,
    y1: Math.max(...points.map((p) => p.y)) + padY,
  };
}
function fitTransform(points, minK, maxK) {
  const { W, H } = canvasSize(),
    b = boundsOf(points),
    k = Math.max(minK, Math.min(maxK, (W - 24) / (b.x1 - b.x0), (H - 24) / (b.y1 - b.y0)));
  return d3.zoomIdentity
    .translate(W / 2 - (k * (b.x0 + b.x1)) / 2, H / 2 - (k * (b.y0 + b.y1)) / 2)
    .scale(k);
}
function centredOn(point, k) {
  const { W, H } = canvasSize();
  return d3.zoomIdentity.translate(W / 2 - k * point.x, H / 2 - k * point.y).scale(k);
}
function setView(t, animate = false) {
  const svg = currentSvg();
  if (!svg || !zoomBehavior) return;
  const sel = d3.select(svg);
  (animate ? sel.transition().duration(280) : sel).call(zoomBehavior.transform, t);
}
/** The opening view: everything if it fits at a readable size, otherwise the focus area. */
function initialView(focusId) {
  const points = allPositions();
  if (!points.length) return;
  const minK = readableScale(),
    fit = fitTransform(points, 0.1, 1.2),
    rootId = treeRoot()?.id;
  if (fit.k >= minK) return setView(fit);
  if (treeMode === "classic" && classicState?.big && (!focusId || focusId === rootId)) {
    // Whole tree open: start at the top, with the root in the top-right corner.
    const { W } = canvasSize(),
      r = nodePos(rootId),
      k = Math.max(minK, 1);
    if (r) return setView(d3.zoomIdentity.translate(W - 82 * k - k * r.x, 44 - k * r.y).scale(k));
  }
  const focus = nodePos(focusId) || nodePos(treeRoot()?.id);
  const kids = (childrenMap().get(focusId || treeRoot()?.id) || [])
    .map((c) => nodePos(c.id))
    .filter(Boolean);
  const area = [focus, ...kids].filter(Boolean);
  const target = fitTransform(area, minK, 1.2);
  setView(target);
}
/** After opening/closing a branch, keep the tapped name where it was, then reveal its sons. */
function keepNodeInPlace({ id, t0, before }) {
  const after = nodePos(id);
  if (!after) return initialView(id);
  const kept = d3.zoomIdentity
    .translate(t0.x + t0.k * (before.x - after.x), t0.y + t0.k * (before.y - after.y))
    .scale(t0.k);
  setView(kept);
  const kids = (expandedIds.has(id) ? childrenMap().get(id) || [] : []).map((c) => nodePos(c.id)).filter(Boolean);
  if (!kids.length) return;
  const { W, H } = canvasSize(),
    b = boundsOf([after, ...kids]),
    sx0 = kept.applyX(b.x0),
    sx1 = kept.applyX(b.x1),
    sy0 = kept.applyY(b.y0),
    sy1 = kept.applyY(b.y1);
  if (sx0 >= 0 && sx1 <= W && sy0 >= 0 && sy1 <= H) return;
  const k = Math.min(kept.k, Math.max(readableScale(), fitTransform([after, ...kids], 0.1, kept.k).k));
  setView(fitTransform([after, ...kids], k, k), true);
}
function focusNode(id) {
  const p = nodePos(id),
    svg = currentSvg();
  if (!p || !svg) return;
  const k = Math.max(d3.zoomTransform(svg).k, readableScale()),
    menuOpen = !$("#personMenu")?.classList.contains("hidden"),
    lift = menuOpen && window.innerWidth < 800 ? 70 : 0;
  setView(centredOn({ x: p.x, y: p.y + lift / k }, k), true);
}
function bindTreeGestures(svg, graphSelector) {
  if (!svg || !window.d3) return;
  zoomBehavior = d3
    .zoom()
    .scaleExtent([0.12, 3])
    .clickDistance(8)
    .on("zoom", (event) => {
      d3.select(graphSelector).attr("transform", event.transform);
      zoom = event.transform.k;
      updateRadialVisibility();
      $("#zoomLabel").textContent = `${ar(Math.round(zoom * 100))}٪`;
    });
  d3.select(svg).call(zoomBehavior).on("dblclick.zoom", null);
}
function renderRadialTree() {
  radialState = buildRadialData();
  if (!radialState) return;
  const { root, nodes, nodeMap } = radialState,
    { W, H } = canvasSize();
  const links = nodes
    .filter((n) => n.parent && nodeMap.has(n.parent))
    .map(
      (n) =>
        `<path class="family-link" data-link="${n.id}" d="${radialLink(nodeMap.get(n.parent), n)}"/>`,
    )
    .join("");
  const dots = nodes
    .map((n) => {
      const main = n.depth === 1,
        rootNode = n.id === root.id,
        displayName = rootNode ? ROOT_LABEL : n.name,
        hasKids = (radialState.kids.get(n.id) || []).length,
        open = expandedIds.has(n.id),
        w = rootNode ? 116 : main ? 112 : 98;
      return `<g class="radial-person depth-${n.depth}${main ? " main-branch" : ""}${rootNode ? " root-person" : ""}${open ? " is-open" : ""}" data-node="${n.id}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})"><rect class="person-card-bg" x="${-w / 2}" y="-19" width="${w}" height="38" rx="12"/><text class="node-name" y="5" text-anchor="middle">${esc(displayName)}</text>${hasKids ? `<circle class="branch-state" cx="${w / 2 - 6}" cy="-14" r="9"/><text class="branch-state-mark" x="${w / 2 - 6}" y="-9.5" text-anchor="middle">${open ? "−" : "+"}</text>` : ""}</g>`;
    })
    .join("");
  $("#treeCanvas").classList.remove("classic-canvas");
  $("#tree").innerHTML =
    `<svg id="familySvg" viewBox="0 0 ${W} ${H}" role="img"><defs><filter id="soft"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity=".14"/></filter></defs><g id="radialGraph"><g class="links-layer">${links}</g><g class="nodes-layer">${dots}</g></g></svg>`;
}
function renderClassicTree() {
  const { root, kids } = visibleTree();
  if (!root) return;
  const COL = 176,
    ROW = 58;
  const hierarchy = d3.hierarchy(root, (p) =>
    expandedIds.has(p.id) ? kids.get(p.id) || [] : [],
  );
  d3.tree().nodeSize([ROW, COL])(hierarchy);
  // Big trees: put each father beside his first son (top-aligned) so families stay together.
  const big = hierarchy.descendants().length > 40;
  if (big) {
    // One row per leaf; each father shares the row of his first son → no overlaps.
    let row = 0;
    const place = (n) => {
      if (!n.children?.length) n.x = row++ * ROW;
      else {
        n.children.forEach(place);
        n.x = n.children[0].x;
      }
    };
    place(hierarchy);
  }
  const nodes = hierarchy.descendants(),
    minX = Math.min(...nodes.map((n) => n.x));
  const width = Math.max(720, hierarchy.height * COL + 220),
    { W, H } = canvasSize();
  nodes.forEach((n) => {
    n.px = width - 90 - n.depth * COL;
    n.py = n.x - minX + 72;
  });
  classicState = {
    width,
    big,
    nodeMap: new Map(nodes.map((n) => [n.data.id, n])),
  };
  const links = hierarchy
    .links()
    .map(
      ({ source, target }) =>
        `<path class="classic-link family-link" data-link="${target.data.id}" d="M${source.px},${source.py} C${(source.px + target.px) / 2},${source.py} ${(source.px + target.px) / 2},${target.py} ${target.px},${target.py}"/>`,
    )
    .join("");
  const cards = nodes
    .map((n) => {
      const p = n.data,
        hasKids = (kids.get(p.id) || []).length,
        open = expandedIds.has(p.id),
        rootNode = p.id === root.id;
      return `<g class="classic-person${rootNode ? " root-person" : ""}${open ? " is-open" : ""}" data-node="${p.id}" transform="translate(${n.px} ${n.py})"><rect class="classic-card-bg" x="-66" y="-20" width="132" height="40" rx="12"/><text class="classic-node-name" y="6" text-anchor="middle">${rootNode ? esc(ROOT_LABEL) : esc(p.name)}</text>${hasKids ? `<circle class="branch-state" cx="58" cy="-15" r="9"/><text class="branch-state-mark" x="58" y="-10.5" text-anchor="middle">${open ? "−" : "+"}</text>` : ""}</g>`;
    })
    .join("");
  $("#treeCanvas").classList.add("classic-canvas");
  $("#tree").innerHTML =
    `<svg id="classicSvg" viewBox="0 0 ${W} ${H}" role="img"><g id="classicGraph"><g>${links}</g><g>${cards}</g></g></svg>`;
}
/**
 * view: undefined → opening view; { focus } → opening view around a person;
 * { keep: true, id, t0, before } → keep the tapped person in place.
 */
function renderTree(view) {
  try {
    treeMode === "radial" ? renderRadialTree() : renderClassicTree();
    const svg = currentSvg();
    if (!svg) throw new Error("no svg");
    bindTreeGestures(svg, treeMode === "radial" ? "#radialGraph" : "#classicGraph");
    applyPathHighlight();
    $("#expandAllTop")?.classList.toggle("hidden", treeMode === "radial");
    $("#treeCanvas")?.classList.toggle("radial-mode", treeMode === "radial");
    if (view?.keep) keepNodeInPlace(view);
    else initialView(view?.focus || selectedId);
  } catch (error) {
    console.error("Tree render failed", error);
    $("#tree").innerHTML =
      '<div class="tree-empty-state">تعذر عرض الشجرة. تم حفظ البيانات، يرجى تحديث الصفحة.</div>';
  }
}
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    sizeTreeCanvas();
    const svg = currentSvg(),
      { W, H } = canvasSize();
    if (svg) svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  }, 150);
});
function updateRadialVisibility() {
  const svg = $("#familySvg");
  if (!svg) return;
  svg.classList.toggle("zoom-mid", zoom >= 1.45);
  svg.classList.toggle("zoom-full", zoom >= 2.25);
}
function ancestorIds(id) {
  const map = byId(),
    ids = [];
  let p = map.get(id);
  while (p) {
    ids.push(p.id);
    p = map.get(p.parent);
  }
  return ids;
}
function applyPathHighlight() {
  const path = new Set(ancestorIds(selectedId));
  const directChildren = new Set(
    selectedId ? (childrenMap().get(selectedId) || []).map((p) => p.id) : [],
  );
  $$("[data-node]").forEach((n) => {
    n.classList.toggle("selected", n.dataset.node === selectedId);
    n.classList.toggle("path-node", path.has(n.dataset.node));
    n.classList.toggle("direct-child", directChildren.has(n.dataset.node));
  });
  $$(".family-link").forEach((l) =>
    l.classList.toggle("path-active", path.has(l.dataset.link)),
  );
  $("#familySvg")?.classList.toggle("has-selection", !!selectedId);
}
function selectPerson(id, focus = false) {
  selectedId = id;
  applyPathHighlight();
  const p = byId().get(id);
  $("#dataStatus").textContent = p ? lineage(p) : "الشجرة كاملة";
  if (focus) focusNode(id);
}
function zoomToPerson(id) {
  focusNode(id);
}
function focusClassic(id) {
  focusNode(id);
}
function showPersonMenu(p) {
  currentPerson = p;
  selectPerson(p.id);
  $("#menuPersonName").textContent = lineage(p);
  $("#personMenu").classList.remove("hidden");
}
$("#tree").onclick = (e) => {
  if (e.defaultPrevented) return;
  const n = e.target.closest("[data-node]");
  if (!n) return;
  const p = byId().get(n.dataset.node);
  if (!p) return;
  const hasKids = (childrenMap().get(p.id) || []).length;
  if (hasKids) {
    const svg = currentSvg(),
      t0 = svg ? d3.zoomTransform(svg) : null,
      before = nodePos(p.id);
    if (expandedIds.has(p.id)) expandedIds.delete(p.id);
    else if (treeMode === "radial") expandedIds = new Set([...ancestorIds(p.id), p.id]);
    else expandedIds.add(p.id);
    selectedId = p.id;
    renderTree(t0 && before ? { keep: true, id: p.id, t0, before } : { focus: p.id });
  }
  showPersonMenu(p);
};
function fitTree() {
  const points = allPositions();
  if (points.length) setView(fitTransform(points, 0.12, 1.2), true);
}
function openPerson(p) {
  currentPerson = p;
  $("#profileInitial").textContent = p.name[0];
  $("#profileName").textContent = lineage(p);
  $("#profileLineage").textContent = "سجل الشخص والمعلومات المعتمدة";
  const fields = [
    ["الميلاد", p.birthDate],
    ["الوفاة", p.deathDate],
    ["المنصب أو العمل", p.position],
    ["المدينة", p.city],
  ].filter((x) => x[1]);
  $("#profileDetails").innerHTML = fields.length
    ? fields.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")
    : '<p class="muted">لا توجد معلومات إضافية منشورة.</p>';
  const hasKids = people.some((x) => x.parent === p.id);
  $("#addChildBtn").classList.toggle("hidden", hasKids);
  $("#personDialog").showModal();
}
function switchView(name) {
  $$(".view").forEach((v) =>
    v.classList.toggle("active", v.id === `${name}View`),
  );
  $$("[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name),
  );
  if (name === "review") {
    loadRequests();
    loadAnalytics();
  }
  if (name === "tree")
    requestAnimationFrame(() => {
      sizeTreeCanvas();
      renderTree({ focus: selectedId });
    });
}
$$("[data-view]").forEach(
  (b) => (b.onclick = () => switchView(b.dataset.view)),
);
$$("[data-close]").forEach(
  (b) => (b.onclick = () => document.getElementById(b.dataset.close).close()),
);
function resetTree() {
  const root = treeRoot();
  expandedIds = new Set(root ? [root.id] : []);
  zoom = 1;
  selectedId = null;
  $("#personMenu").classList.add("hidden");
  $("#dataStatus").textContent = "الفروع الرئيسية";
  renderTree();
}
$("#rootBtnMobile").onclick = resetTree;
/** Open every branch — classic view only (the radial view would be unreadable). */
function expandAllBranches() {
  if (treeMode === "radial") setTreeMode("classic", false);
  const kids = childrenMap();
  expandedIds = new Set(
    people.filter((p) => (kids.get(p.id) || []).length).map((p) => p.id),
  );
  $("#dataStatus").textContent = "الشجرة كاملة";
  renderTree({ focus: treeRoot()?.id });
}
/** Radial shows one line of descent at a time: keep only the selected path open. */
function setTreeMode(mode, render = true) {
  treeMode = mode === "radial" ? "radial" : "classic";
  $$("[data-tree-mode]").forEach((x) =>
    x.classList.toggle("active", x.dataset.treeMode === treeMode),
  );
  $$("[data-guide-mode]").forEach((x) =>
    x.classList.toggle("active", x.dataset.guideMode === treeMode),
  );
  if (treeMode === "radial") {
    const root = treeRoot();
    expandedIds = new Set([root?.id, ...(selectedId ? ancestorIds(selectedId) : [])].filter(Boolean));
  }
  if (render) renderTree({ focus: selectedId });
}
$("#expandAllTop").onclick = expandAllBranches;
$("#fitTreeBtn").onclick = fitTree;
$("#zoomIn").onclick = () => buttonZoom(1.3);
$("#zoomOut").onclick = () => buttonZoom(1 / 1.3);
function buttonZoom(f) {
  const svg = currentSvg();
  if (!svg || !zoomBehavior) return;
  d3.select(svg).transition().duration(160).call(zoomBehavior.scaleBy, f);
}
$("#branches").onclick = (e) => {
  const b = e.target.closest("[data-branch]");
  if (!b) return;
  expandedIds.add(b.dataset.branch);
  selectedId = b.dataset.branch;
  renderTree({ focus: b.dataset.branch });
  selectPerson(b.dataset.branch);
};
$("#search").oninput = (e) => {
  const q = norm(e.target.value),
    box = $("#searchResults");
  if (q.length < 2) {
    box.classList.add("hidden");
    return;
  }
  const rank = (p) => (norm(lineage(p)).startsWith(q) ? 0 : norm(p.name).includes(q) ? 1 : 2),
    all = people
      .filter((p) => norm(p.name).includes(q) || norm(lineage(p)).includes(q))
      .sort((a, b) => rank(a) - rank(b)),
    hits = all.slice(0, 30),
    tokens = q.split(" ").filter((t) => t && t !== "بن" && t !== "ابن"),
    // Highlight only the first run of words that matches the query in order (skipping «بن»).
    mark = (text) => {
      const parts = String(text).split(/(\s+)/),
        words = parts.map((w, idx) => ({ idx, key: norm(w) })).filter((w) => w.key && w.key !== "بن" && w.key !== "ابن"),
        hit = new Set();
      for (let start = 0; start < words.length && tokens.length; start++) {
        if (tokens.every((t, k) => words[start + k]?.key.includes(t))) {
          tokens.forEach((_, k) => hit.add(words[start + k].idx));
          break;
        }
      }
      return parts.map((w, idx) => (hit.has(idx) ? `<mark>${esc(w)}</mark>` : esc(w))).join("");
    },
    n = all.length,
    countText =
      n === 1 ? "نتيجة واحدة" : n === 2 ? "نتيجتان" : n <= 10 ? `${ar(n)} نتائج` : `${ar(n)} نتيجة`;
  box.innerHTML = n
    ? `<p class="search-count">${countText}${n > hits.length ? ` — يظهر أول ${ar(hits.length)}، أضف «بن» واسم الأب للتضييق` : ""}</p>` +
      hits
        .map(
          (p) =>
            `<div class="result" data-result="${esc(p.id)}"><b>${mark(p.name)}</b><small>${mark(lineage(p))}</small></div>`,
        )
        .join("")
    : '<p class="empty">لا توجد نتائج. جرّب كتابة الاسم بدون همزة أو بدون «عبد».</p>';
  box.classList.remove("hidden");
};
$("#searchResults").onclick = (e) => {
  const r = e.target.closest("[data-result]");
  if (!r) return;
  const id = r.dataset.result,
    p = byId().get(id);
  ancestorIds(id).forEach((x) => x !== id && expandedIds.add(x));
  selectedId = id;
  renderTree({ focus: id });
  if (p) showPersonMenu(p);
  focusNode(id);
  $("#searchResults").classList.add("hidden");
  $("#search").value = "";
  $("#search").blur();
};

$$("[data-tree-mode]").forEach(
  (b) => (b.onclick = () => setTreeMode(b.dataset.treeMode)),
);

$("#closePersonMenu").onclick = () => $("#personMenu").classList.add("hidden");
$("#copyLineageBtn").onclick = async () => {
  await navigator.clipboard.writeText(lineage(currentPerson));
  await recordCounter("analyticsNames", currentPerson.id);
  if (analytics)
    logEvent(analytics, "copy_family_name", {
      person_id: currentPerson.id,
      tree_view: treeMode,
    });
  toast("تم نسخ الاسم الكامل");
};
$("#sharePersonBtn").onclick = async () => {
  if (!currentPerson) return;
  const url = new URL("index.html", location.href);
  url.searchParams.set("person", currentPerson.id);
  url.searchParams.set("mode", treeMode);
  const title = lineage(currentPerson);
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `من ${SITE_TITLE}: ${title}`, url: url.href });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await navigator.clipboard.writeText(url.href);
  toast("تم نسخ رابط الاسم");
};

function openSharedPerson() {
  if (sharedPersonOpened) return;
  const params = new URLSearchParams(location.search),
    id = params.get("person"),
    mode = params.get("mode");
  if (!id || !byId().has(id)) return;
  sharedPersonOpened = true;
  if (["radial", "classic"].includes(mode)) treeMode = mode;
  $$('[data-tree-mode]').forEach((button) =>
    button.classList.toggle("active", button.dataset.treeMode === treeMode),
  );
  ancestorIds(id).forEach((ancestorId) => expandedIds.add(ancestorId));
  renderTree();
  requestAnimationFrame(() => selectPerson(id, true));
}

const guideKey = GUIDE_KEY;
function closeGuide() {
  try {
    localStorage.setItem(guideKey, "1");
  } catch (_) {}
  $("#welcomeGuide")?.close();
}
$("#helpBtn").onclick = () => $("#welcomeGuide").showModal();
$$('[data-guide-close]').forEach((button) => (button.onclick = closeGuide));
$("#guideStartBtn").onclick = closeGuide;
$$('[data-guide-mode]').forEach((button) => {
  button.onclick = () => setTreeMode(button.dataset.guideMode);
});
let guideSeen = false;
try {
  guideSeen = !!localStorage.getItem(guideKey);
} catch (_) {}
if (!guideSeen)
  setTimeout(() => $("#welcomeGuide")?.showModal(), 450);

async function loadAnalytics() {
  if (!isOwner()) return;
  try {
    const [pages, weeks, names] = await Promise.all([
        getDocs(collection(db, "analyticsPages")),
        getDocs(
          query(
            collection(db, "analyticsPageWeeks"),
            where("weekStart", "==", weekStartKey()),
          ),
        ),
        getDocs(collection(db, "analyticsNames")),
      ]),
      pageMap = new Map(pages.docs.map((x) => [x.id, x.data().count || 0])),
      weekMap = new Map(
        weeks.docs.map((x) => [x.data().page, x.data().count || 0]),
      ),
      map = byId(),
      top = names.docs
        .map((x) => ({
          id: x.id,
          count: x.data().count || 0,
          lastEventAt: x.data().lastEventAt,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    const visitCard = (page, label) =>
      `<article><span class="analytics-card-title">${label}</span><div class="analytics-card-values"><div><b>${ar(pageMap.get(page) || 0)}</b><small>الإجمالي</small></div><div><b>${ar(weekMap.get(page) || 0)}</b><small>هذا الأسبوع</small></div></div></article>`;
    const formatCopiedAt = (value) =>
      value?.toDate
        ? new Intl.DateTimeFormat("ar-SA", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Asia/Riyadh",
          }).format(value.toDate())
        : "غير مسجل";
    $("#analyticsSummary").innerHTML =
      `<div class="analytics-cards">${visitCard("interactive_tree", "الشجرة التفاعلية")}${visitCard("first_edition", "الشجرة المطبوعة")}${visitCard("family_numbers", "العائلة بالأرقام")}</div><h2>الأسماء التي تم نسخها</h2>${top.length ? `<div class="analytics-list">${top.map((x, i) => `<div><span>${ar(i + 1)}. ${esc(map.has(x.id) ? lineage(map.get(x.id)) : x.id)}<small class="copy-meta">آخر نسخ: ${formatCopiedAt(x.lastEventAt)}</small></span><b>${ar(x.count)}</b></div>`).join("")}</div>` : '<p class="empty">لا توجد عمليات نسخ مسجلة بعد.</p>'}`;
  } catch (error) {
    $("#analyticsSummary").innerHTML =
      '<p class="empty">تعذر تحميل الإحصائيات.</p>';
    console.warn(error);
  }
}
$("#suggestMenuBtn").onclick = () => openRequest("update");
$("#addChildMenuBtn").onclick = () => openRequest("addChild");

$("#loginBtn").onclick = () => $("#loginDialog").showModal();
$("#accountBtn").onclick = () => {
  $("#accountInfo").innerHTML =
    `${esc(userProfile?.name || "مساهم")}<br><span dir="ltr">${esc(auth.currentUser?.phoneNumber || "")}</span>`;
  $("#accountDialog").showModal();
};
$("#logoutBtn").onclick = async () => {
  await signOut(auth);
  $("#accountDialog").close();
  toast("تم تسجيل الخروج");
};
function normalizeSaudiPhone(value) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  let digits = String(value || "")
    .replace(/[٠-٩]/g, (digit) => arabicDigits.indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => persianDigits.indexOf(digit))
    .replace(/[^\d+]/g, "")
    .trim();
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) return digits;
  if (/^05\d{8}$/.test(digits)) return `+966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;
  if (/^9665\d{8}$/.test(digits)) return `+${digits}`;
  if (/^974[3-7]\d{7}$/.test(digits)) return `+${digits}`;
  if (/^[3-7]\d{7}$/.test(digits)) return `+974${digits}`;
  return digits;
}
function isSupportedPhone(phone) {
  return /^\+9665\d{8}$/.test(phone) || /^\+974[3-7]\d{7}$/.test(phone);
}
async function resolveCurrentRole(user) {
  if (!user) return "user";
  if (ADMIN_PHONES.includes(user.phoneNumber)) return "owner";
  try {
    const reviewer = await getDoc(doc(db, "reviewers", user.phoneNumber));
    return reviewer.exists() && reviewer.data().active === true
      ? "reviewer"
      : "user";
  } catch (error) {
    console.warn("Reviewer role unavailable", error);
    return "user";
  }
}
async function loadReviewers() {
  if (!isOwner()) return;
  const snapshot = await getDocs(collection(db, "reviewers"));
  $("#reviewerList").innerHTML = snapshot.empty
    ? '<p class="empty">لا يوجد مراجعون إضافيون.</p>'
    : snapshot.docs
        .map(
          (item) =>
            `<article><span dir="ltr">${esc(item.id)}</span><button class="danger" type="button" data-remove-reviewer="${esc(item.id)}">إزالة</button></article>`,
        )
        .join("");
}
$("#reviewerForm").onsubmit = async (event) => {
  event.preventDefault();
  if (!isOwner()) return;
  const phone = normalizeSaudiPhone($("#reviewerPhone").value);
  if (!isSupportedPhone(phone)) {
    toast("أدخل رقم جوال سعودي أو قطري صحيح");
    return;
  }
  if (ADMIN_PHONES.includes(phone)) {
    toast("هذا الرقم مدير بالفعل");
    return;
  }
  await setDoc(doc(db, "reviewers", phone), {
    phone,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser.uid,
  });
  event.target.reset();
  await loadReviewers();
  toast("تمت إضافة المراجع");
};
$("#reviewerList").onclick = async (event) => {
  const button = event.target.closest("[data-remove-reviewer]");
  if (!button || !isOwner()) return;
  await deleteDoc(doc(db, "reviewers", button.dataset.removeReviewer));
  await loadReviewers();
  toast("تمت إزالة المراجع");
};
$("#phoneForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    $("#authMessage").textContent = "";
    const phoneNumber = normalizeSaudiPhone($("#phone").value);
    if (!isSupportedPhone(phoneNumber)) {
      $("#authMessage").textContent =
        "أدخل رقم جوال سعودي أو قطري مثل 00966512345678 أو 0097455123456.";
      return;
    }
    $("#phone").value = phoneNumber;
    $("#authMessage").textContent = "جارٍ التحقق وإرسال الرمز...";
    if (!window.recaptchaVerifier)
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha", {
        size: "invisible",
      });
        confirmation = await signInWithPhoneNumber(
      auth,
      phoneNumber,
      window.recaptchaVerifier,
    );
    $("#phoneForm").classList.add("hidden");
    $("#codeForm").classList.remove("hidden");
    $("#authMessage").textContent = "تم إرسال الرمز.";
    $("#loginDialog").showModal();
  } catch (err) {
    $("#loginDialog").showModal();
    $("#authMessage").textContent =
      "تعذر إرسال الرمز. تحقق من الرقم وإعدادات SMS.";
    window.recaptchaVerifier?.clear();
    window.recaptchaVerifier = null;
  }
};
$("#codeForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await confirmation.confirm($("#code").value);
    $("#loginDialog").close();
    $("#phoneForm").classList.remove("hidden");
    $("#codeForm").classList.add("hidden");
  } catch (err) {
    $("#authMessage").textContent = "الرمز غير صحيح.";
  }
};
onAuthStateChanged(auth, async (u) => {
  if (analytics) setUserId(analytics, u?.uid || null);
  if (!u) {
    currentRole = "user";
    userProfile = null;
    $("#loginBtn").classList.remove("hidden");
    $("#accountBtn").classList.add("hidden");
    $("#reviewBtn")?.classList.add("hidden");
    $("#adminTopBtn")?.classList.add("hidden");
    $("#analyticsSummary")?.classList.add("hidden");
    $("#reviewerManagement")?.classList.add("hidden");
    adminTools.hide();
    return;
  }
  currentRole = await resolveCurrentRole(u);
  $("#loginBtn").classList.add("hidden");
  $("#accountInitial").textContent = "ع";
  const ps = await getDoc(doc(db, "profiles", u.uid));
  if (ps.exists()) userProfile = ps.data();
  else if (!isOwner()) {
    $("#profileSetupDialog").showModal();
  } else userProfile = { name: "مدير الشجرة", relation: "المدير" };
  $("#accountName").textContent = userProfile?.name || "حسابي";
  $("#accountBtn").classList.toggle("hidden", canReview());
  if (canReview()) {
    await u.getIdToken(true);
    $("#reviewBtn")?.classList.add("hidden");
    $("#adminTopBtn")?.classList.remove("hidden");
    $("#adminTopBtn").textContent = isOwner() ? "الإدارة" : "المراجعة";
    $("#analyticsSummary").classList.toggle("hidden", !isOwner());
    $("#reviewerManagement").classList.toggle("hidden", !isOwner());
    $("#seedBtn").classList.toggle("hidden", !isOwner() || remoteLoaded);
    adminTools.show();
    if (isOwner()) await loadReviewers();
    await updatePendingBadge();
    ensureSnapshot();
    if (new URLSearchParams(location.search).get("review") === "1")
      switchView("review");
  } else {
    $("#adminTopBtn")?.classList.add("hidden");
    adminTools.hide();
  }
});
$("#profileSetupForm").onsubmit = async (e) => {
  e.preventDefault();
  userProfile = {
    name: cleanText($("#contributorName").value, 80),
    relation: cleanText($("#contributorRelation").value, 80),
    phone: auth.currentUser.phoneNumber,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, "profiles", auth.currentUser.uid), userProfile);
  $("#profileSetupDialog").close();
  $("#accountName").textContent = userProfile.name;
  toast("تم حفظ بياناتك");
};

$("#suggestBtn").onclick = () => openRequest("update");
$("#addChildBtn").onclick = () => openRequest("addChild");
function openRequest(type) {
  if (!auth.currentUser) {
    $("#personDialog").close();
    $("#loginDialog").showModal();
    return;
  }
  $("#personDialog").close();
  $("#requestType").value = type;
  $("#requestPersonId").value = currentPerson.id;
  $("#requestTitle").textContent =
    type === "addChild"
      ? `إضافة ابن لـ ${currentPerson.name}`
      : `اقتراح تعديل: ${currentPerson.name}`;
  $("#requestName").value = type === "addChild" ? "" : currentPerson.name;
  $("#metadataFields").classList.toggle("hidden", type === "addChild");
  resetDuplicateWarning();
  $("#requestDialog").showModal();
}
function resetDuplicateWarning() {
  const warning = $("#duplicateWarning");
  if (warning) {
    warning.classList.add("hidden");
    warning.textContent = "";
  }
  $("#requestForm").dataset.confirmedName = "";
  const submit = $("#requestForm button.primary");
  if (submit) submit.textContent = "إرسال للمراجعة";
}
$("#requestName").addEventListener("input", () => {
  if ($("#requestForm").dataset.confirmedName) resetDuplicateWarning();
});
/** Returns true when it is OK to send (no duplicate, or the user confirmed). */
function checkDuplicateBeforeSend(type, name) {
  const parentId = type === "addChild" ? currentPerson.id : currentPerson.parent,
    ignoreId = type === "addChild" ? "" : currentPerson.id;
  if (type !== "addChild" && name === currentPerson.name) return true;
  const twins = sameNameSiblings(people, parentId, name, ignoreId);
  if (!twins.length) return true;
  const form = $("#requestForm");
  if (form.dataset.confirmedName === name) return true;
  const parent = byId().get(parentId),
    warning = $("#duplicateWarning");
  if (warning) {
    warning.textContent = `تنبيه: يوجد بالفعل ابن باسم «${twins[0].name}» لـ ${parent ? lineage(parent) : "نفس الأب"}. إذا كان شخصاً آخر بنفس الاسم اضغط «إرسال رغم ذلك»، وإلا أغلق النافذة.`;
    warning.classList.remove("hidden");
  }
  form.dataset.confirmedName = name;
  const submit = form.querySelector("button.primary");
  if (submit) submit.textContent = "إرسال رغم ذلك";
  return false;
}
$("#requestForm").onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target,
    submit = form.querySelector("button.primary");
  if (submit?.disabled) return;
  const type = $("#requestType").value === "addChild" ? "addChild" : "update",
    name = cleanText($("#requestName").value, 60);
  if (!name) {
    toast("اكتب الاسم أولاً");
    return;
  }
  if (!checkDuplicateBeforeSend(type, name)) return;
  const proposed =
    type === "addChild"
      ? { name, parent: currentPerson.id, note: "" }
      : cleanUpdate({
          name,
          birthDate: $("#birthDate").value,
          deathDate: $("#deathDate").value,
          position: $("#position").value,
          city: $("#city").value,
          note: $("#requestNote").value,
        });
  if (submit) submit.disabled = true;
  try {
    const user = auth.currentUser;
    if (!user) {
      $("#requestDialog").close();
      $("#loginDialog").showModal();
      return;
    }
    await setDoc(doc(collection(db, "changeRequests")), {
      type,
      personId: currentPerson.id,
      personName: cleanText(currentPerson.name, 60),
      personLineage: cleanText(lineage(currentPerson), 400),
      proposed,
      reason: cleanText($("#requestReason").value, 1000),
      submittedBy: user.uid,
      submittedPhone: user.phoneNumber,
      submittedName: cleanText(userProfile?.name || "", 80),
      submittedRelation: cleanText(userProfile?.relation || "", 80),
      status: "pending",
      createdAt: serverTimestamp(),
    });
    $("#requestDialog").close();
    form.reset();
    resetDuplicateWarning();
    toast("أُرسل الاقتراح للمراجعة");
  } catch (error) {
    console.warn("Request failed", error);
    toast("تعذر إرسال الاقتراح، حاول مرة أخرى.");
  } finally {
    if (submit) submit.disabled = false;
  }
};

async function updatePendingBadge() {
  if (!canReview()) return;
  const s = await getDocs(
    query(collection(db, "changeRequests"), where("status", "==", "pending")),
  );
  $("#pendingBadge").textContent = ar(s.size);
}
async function loadRequests() {
  if (!canReview()) return;
  const s = await getDocs(
      query(collection(db, "changeRequests"), where("status", "==", "pending")),
    ),
    list = $("#reviewList");
  if (s.empty) {
    list.innerHTML = '<p class="empty">لا توجد طلبات معلّقة.</p>';
    return;
  }
  const pending = s.docs.map((x) => ({ id: x.id, ...x.data() })),
    pendingKey = (r) => `${r.personId}|${norm(r.proposed?.name)}`,
    pendingCounts = new Map();
  pending
    .filter((r) => r.type === "addChild")
    .forEach((r) => pendingCounts.set(pendingKey(r), (pendingCounts.get(pendingKey(r)) || 0) + 1));
  list.innerHTML = pending
    .map((r) => {
      const target = byId().get(r.personId),
        fullName = r.personLineage || (target ? lineage(target) : r.personName),
        requestLabel =
          r.type === "addChild"
            ? `إضافة الابن: ${r.proposed?.name || "—"}`
            : "تعديل معلومات",
        shown =
          r.type === "addChild"
            ? { name: r.proposed?.name }
            : cleanUpdate(r.proposed || {}),
        flags = [];
      if (!target) flags.push("الشخص المستهدف غير موجود في الشجرة الحالية");
      if (r.type === "addChild") {
        const twins = sameNameSiblings(people, r.personId, r.proposed?.name || "");
        if (twins.length) flags.push(`يوجد بالفعل ابن بنفس الاسم لهذا الأب (${twins.length})`);
        if ((pendingCounts.get(pendingKey(r)) || 0) > 1) flags.push("يوجد طلب آخر معلّق بنفس الاسم لنفس الأب");
      } else if (target && shown.name && shown.name !== target.name) {
        if (sameNameSiblings(people, target.parent, shown.name, target.id).length)
          flags.push("الاسم الجديد مطابق لاسم أخ موجود");
      }
      return `<article class="review-card" data-request="${esc(r.id)}"><header><div><b>${esc(requestLabel)}</b><strong class="request-target">${r.type === "addChild" ? "اسم الأب الكامل" : "الاسم الكامل"}: ${esc(fullName)}</strong><small>${esc(r.submittedName || "مساهم")} · <span dir="ltr">${esc(r.submittedPhone)}</span> · ${esc(r.submittedRelation || "")}</small></div></header>${flags.map((f) => `<p class="dup-flag">⚠️ ${esc(f)}</p>`).join("")}<div class="diff">${Object.entries(
        shown,
      )
        .map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v || "—")}`)
        .join(
          "<br>",
        )}<hr><b>المصدر:</b> ${esc(r.reason)}</div><button class="primary" data-approve>اعتماد</button> <button class="danger" data-reject>رفض</button></article>`;
    })
    .join("");
}
/** Apply one approved request to the database. Only known fields are written. */
async function applyApprovedRequest(r) {
  const all = await loadAllPersons(db),
    base = all.length ? mergeRemotePeople(all) : normalizePeople(people),
    map = new Map(base.map((p) => [p.id, p])),
    target = map.get(r.personId);
  if (!target) throw new Error("الشخص المستهدف غير موجود");
  await ensureDailyBackup(db, base, auth.currentUser.uid);
  let next;
  if (r.type === "addChild") {
    const name = cleanText(r.proposed?.name, 60);
    if (!name) throw new Error("الاسم فارغ");
    const child = { id: newPersonId(new Set(map.keys())), name, parent: target.id, note: "" };
    await setDoc(doc(db, "persons", child.id), child);
    next = [...base, child];
  } else if (r.type === "update") {
    const changes = cleanUpdate(r.proposed || {}),
      updated = cleanPerson({ ...target, ...changes, id: target.id, parent: target.parent });
    await setDoc(doc(db, "persons", target.id), updated);
    next = base.map((p) => (p.id === target.id ? updated : p));
  } else throw new Error("نوع طلب غير معروف");
  try {
    await saveTreeSnapshot(db, next, auth.currentUser.uid);
  } catch (error) {
    console.warn("Snapshot update failed", error);
    toast("تم الاعتماد، لكن تعذر تحديث النسخة السريعة");
  }
}
async function ensureSnapshot() {
  try {
    await peopleReady;
    if (snapshotLoaded || !remoteLoaded || !canReview()) return;
    await saveTreeSnapshot(db, people, auth.currentUser?.uid);
    snapshotLoaded = true;
  } catch (error) {
    console.warn("Could not create tree snapshot", error);
  }
}
$("#reviewList").onclick = async (e) => {
  const card = e.target.closest("[data-request]");
  if (!card || !canReview()) return;
  const approve = e.target.matches("[data-approve]"),
    reject = e.target.matches("[data-reject]");
  if (!approve && !reject) return;
  card.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const ref = doc(db, "changeRequests", card.dataset.request),
      snap = await getDoc(ref),
      r = snap.data();
    if (!r || r.status !== "pending") throw new Error("الطلب لم يعد معلّقاً");
    if (approve) await applyApprovedRequest(r);
    await updateDoc(ref, {
      status: approve ? "approved" : "rejected",
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser.uid,
      reviewedByPhone: auth.currentUser.phoneNumber,
      reviewedByRole: isOwner() ? "owner" : "reviewer",
    });
    toast(approve ? "تم اعتماد التعديل" : "تم رفض الطلب");
  } catch (error) {
    console.error("Review action failed", error);
    toast(`تعذر تنفيذ الطلب: ${error?.message || error}`);
  }
  await loadPeople();
  await loadRequests();
  adminTools.renderBackups();
  await updatePendingBadge();
};
$("#seedBtn").onclick = async () => {
  if (!isOwner() || remoteLoaded) return;
  $("#seedBtn").disabled = true;
  $("#seedBtn").textContent = "جارٍ الاستيراد…";
  const clean = people.map((p) => cleanPerson(p));
  for (let i = 0; i < clean.length; i += 400) {
    const batch = writeBatch(db);
    clean.slice(i, i + 400).forEach((p) => batch.set(doc(db, "persons", p.id), p));
    await batch.commit();
  }
  await saveTreeSnapshot(db, clean, auth.currentUser.uid).catch((error) =>
    console.warn("Snapshot after seed failed", error),
  );
  remoteLoaded = true;
  snapshotLoaded = true;
  $("#seedBtn").classList.add("hidden");
  $("#dataStatus").textContent = "متصل بالنسخة المعتمدة";
  toast(`تم استيراد ${ar(people.length)} شخصًا`);
};
const adminTools = initAdminTools({
  db,
  auth,
  title: SITE_TITLE,
  filePrefix: FILE_PREFIX,
  toast,
  getPeople: () => people,
  canReview,
  isOwner,
  merge: mergeRemotePeople,
  onTreeReplaced(list) {
    people = mergeRemotePeople(list);
    snapshotLoaded = true;
    renderAll();
  },
});

peopleReady = loadPeople();
if (new URLSearchParams(location.search).get("login") === "1")
  $("#loginDialog").showModal();
