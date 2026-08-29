import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
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

const firebaseConfig = {
  apiKey: "AIzaSyCw0GNrUYIvwPYY5LpCgnuFYi7a903qAuE",
  authDomain: "aldhfyantree-f3273.firebaseapp.com",
  projectId: "aldhfyantree-f3273",
  storageBucket: "aldhfyantree-f3273.firebasestorage.app",
  messagingSenderId: "436236972378",
  appId: "1:436236972378:web:e57101eeb8c3b41a2b8363",
};
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
recordCounter("analyticsPages", "interactive_tree");
auth.languageCode = "ar";
const ADMIN_PHONES = ["+966552806075", "+16505553434"];
let people = window.SEED_PEOPLE || [],
  remoteLoaded = false,
  currentPerson = null,
  userProfile = null,
  confirmation = null,
  zoom = 1,
  radialState = null,
  classicState = null,
  selectedId = null,
  treeMode = "radial",
  expandedIds = new Set(),
  zoomBehavior = null;
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
const isAdmin = () => ADMIN_PHONES.includes(auth.currentUser?.phoneNumber);
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

async function loadPeople() {
  try {
    const snap = await getDocs(collection(db, "persons"));
    if (!snap.empty) {
      people = snap.docs.map((x) => x.data());
      remoteLoaded = true;
      $("#dataStatus").textContent = "متصل بالنسخة المعتمدة";
    }
  } catch (e) {
    console.warn(e);
  }
  renderAll();
}
function renderAll() {
  $("#peopleCount").textContent = ar(people.length);
  $("#generationCount").textContent = ar(generations());
  const kids = childrenMap(),
    roots = kids.get("") || [];
  if (roots[0] && !expandedIds.size) expandedIds.add(roots[0].id);
  renderTree();
  const root = roots[0],
    branches = root ? kids.get(root.id) || [] : [];
  $("#branchCount").textContent = ar(branches.length);
  renderNameFrequency();
  $("#branches").innerHTML = branches
    .map(
      (p, i) =>
        `<button class="branch-btn branch-${i + 1}" data-branch="${p.id}"><span class="branch-dot"></span><b>${p.name}</b><small>${ar(countDesc(p.id, kids) + 1)} شخصًا</small></button>`,
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
    .slice(0, 5);
  const least = [...values]
    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, "ar"))
    .slice(0, 5);
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
    step = 60,
    size = Math.max(760, maxDepth * step * 2 + 180),
    center = size / 2;
  const placed = nodes.map((p) => {
    const r = p.depth * step,
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
    .force("collide", d3.forceCollide(55).strength(1).iterations(3))
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
function renderRadialTree() {
  radialState = buildRadialData();
  if (!radialState) return;
  const { root, nodes, nodeMap } = radialState;
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
        displayName = rootNode ? "ضفي" : n.name,
        hasKids = (radialState.kids.get(n.id) || []).length,
        open = expandedIds.has(n.id),
        w = rootNode ? 104 : main ? 116 : 96;
      return `<g class="radial-person depth-${n.depth}${main ? " main-branch" : ""}${rootNode ? " root-person" : ""}${open ? " is-open" : ""}" data-node="${n.id}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})"><rect class="person-card-bg" x="${-w / 2}" y="-21" width="${w}" height="42" rx="14"/><text class="node-name" y="5" text-anchor="middle">${esc(displayName)}</text>${hasKids ? `<circle class="branch-state" cx="${w / 2 - 7}" cy="-15" r="9"/><text class="branch-state-mark" x="${w / 2 - 7}" y="-11" text-anchor="middle">${open ? "−" : "+"}</text>` : ""}</g>`;
    })
    .join("");
  $("#treeCanvas").classList.remove("classic-canvas");
  $("#tree").innerHTML =
    `<svg id="familySvg" viewBox="0 0 ${radialState.size} ${radialState.size}" role="img"><defs><filter id="soft"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity=".14"/></filter></defs><g id="radialGraph"><g class="links-layer">${links}</g><g class="nodes-layer">${dots}</g></g></svg>`;
  zoom = 1;
  updateRadialVisibility();
  bindRadialGestures();
  $("#zoomLabel").textContent = "١٠٠٪";
}
function renderClassicTree() {
  const { root, kids } = visibleTree();
  if (!root) return;
  const hierarchy = d3.hierarchy(root, (p) =>
    expandedIds.has(p.id) ? kids.get(p.id) || [] : [],
  );
  d3.tree().nodeSize([52, 142])(hierarchy);
  const nodes = hierarchy.descendants(),
    minX = Math.min(...nodes.map((n) => n.x)),
    maxX = Math.max(...nodes.map((n) => n.x));
  const width = Math.max(720, hierarchy.height * 142 + 220),
    height = Math.max(560, maxX - minX + 150);
  nodes.forEach((n) => {
    n.px = width - 90 - n.depth * 142;
    n.py = n.x - minX + 72;
  });
  classicState = {
    width,
    height,
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
      return `<g class="classic-person${rootNode ? " root-person" : ""}${open ? " is-open" : ""}" data-node="${p.id}" transform="translate(${n.px} ${n.py})"><rect class="classic-card-bg" x="-55" y="-18" width="110" height="36" rx="11"/><text class="classic-node-name" y="5" text-anchor="middle">${rootNode ? "ضفي" : esc(p.name)}</text>${hasKids ? `<circle class="branch-state" cx="47" cy="-13" r="8"/><text class="branch-state-mark" x="47" y="-9" text-anchor="middle">${open ? "−" : "+"}</text>` : ""}</g>`;
    })
    .join("");
  $("#treeCanvas").classList.add("classic-canvas");
  $("#tree").innerHTML =
    `<svg id="classicSvg" viewBox="0 0 ${width} ${height}" role="img"><g id="classicGraph"><g>${links}</g><g>${cards}</g></g></svg>`;
  $("#zoomLabel").textContent = "١٠٠٪";
  bindClassicGestures();
  applyPathHighlight();
  if (selectedId) requestAnimationFrame(() => focusClassic(selectedId));
}
function renderTree() {
  treeMode === "radial" ? renderRadialTree() : renderClassicTree();
}
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
  $$("[data-node]").forEach((n) => {
    n.classList.toggle("selected", n.dataset.node === selectedId);
    n.classList.toggle("path-node", path.has(n.dataset.node));
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
  if (focus) treeMode === "radial" ? zoomToPerson(id) : focusClassic(id);
}
function zoomToPerson(id) {
  const n = radialState?.nodeMap.get(id),
    svg = $("#familySvg");
  if (!n || !svg) return;
  const size = Math.min(radialState.size, 620),
    x = Math.max(0, Math.min(radialState.size - size, n.x - size / 2)),
    y = Math.max(0, Math.min(radialState.size - size, n.y - size / 2));
  svg.setAttribute("viewBox", `${x} ${y} ${size} ${size}`);
  zoom = radialState.size / size;
  updateRadialVisibility();
  $("#zoomLabel").textContent = `${ar(Math.round(zoom * 100))}٪`;
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
  showPersonMenu(p);
  const hasKids = (childrenMap().get(p.id) || []).length;
  if (hasKids) {
    if (expandedIds.has(p.id)) expandedIds.delete(p.id);
    else expandedIds = new Set([...ancestorIds(p.id), p.id]);
    renderTree();
    showPersonMenu(p);
    requestAnimationFrame(() =>
      treeMode === "radial" ? zoomToPerson(p.id) : focusClassic(p.id),
    );
  }
};
function bindRadialGestures() {
  const svg = $("#familySvg");
  if (!svg || !window.d3) return;
  zoomBehavior = d3
    .zoom()
    .scaleExtent([0.45, 4])
    .clickDistance(8)
    .on("zoom", (event) => {
      d3.select("#radialGraph").attr("transform", event.transform);
      zoom = event.transform.k;
      updateRadialVisibility();
      $("#zoomLabel").textContent = `${ar(Math.round(zoom * 100))}٪`;
    });
  d3.select(svg).call(zoomBehavior).on("dblclick.zoom", null);
}
function bindClassicGestures() {
  const svg = $("#classicSvg");
  if (!svg || !window.d3) return;
  zoomBehavior = d3
    .zoom()
    .scaleExtent([0.45, 2.5])
    .clickDistance(8)
    .on("zoom", (event) => {
      d3.select("#classicGraph").attr("transform", event.transform);
      zoom = event.transform.k;
      $("#zoomLabel").textContent = `${ar(Math.round(zoom * 100))}٪`;
    });
  d3.select(svg).call(zoomBehavior).on("dblclick.zoom", null);
}
function focusClassic(id) {
  const svg = $("#classicSvg"),
    n = classicState?.nodeMap.get(id);
  if (!svg || !n || !zoomBehavior) return;
  d3.select(svg)
    .transition()
    .duration(260)
    .call(zoomBehavior.translateTo, n.px, n.py);
}
function fitTree() {
  if (treeMode === "radial") {
    const svg = $("#familySvg");
    if (!svg || !zoomBehavior) return;
    svg.setAttribute("viewBox", `0 0 ${radialState.size} ${radialState.size}`);
    d3.select(svg)
      .transition()
      .duration(220)
      .call(zoomBehavior.transform, d3.zoomIdentity);
  } else {
    const svg = $("#classicSvg");
    if (svg && zoomBehavior)
      d3.select(svg)
        .transition()
        .duration(220)
        .call(zoomBehavior.transform, d3.zoomIdentity);
  }
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
    ? fields.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")
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
}
$$("[data-view]").forEach(
  (b) => (b.onclick = () => switchView(b.dataset.view)),
);
$$("[data-close]").forEach(
  (b) => (b.onclick = () => document.getElementById(b.dataset.close).close()),
);
function resetTree() {
  const root = people.find((x) => !x.parent);
  expandedIds = new Set(root ? [root.id] : []);
  zoom = 1;
  selectedId = null;
  $("#personMenu").classList.add("hidden");
  $("#dataStatus").textContent = "الفروع الرئيسية";
  renderTree();
}
$("#rootBtn").onclick = resetTree;
$("#rootBtnMobile").onclick = resetTree;
$("#expandAllBtn").onclick = () => {
  const kids = childrenMap();
  expandedIds = new Set(
    people.filter((p) => (kids.get(p.id) || []).length).map((p) => p.id),
  );
  $("#dataStatus").textContent = "الشجرة كاملة";
  renderTree();
};
$("#expandAllTop").onclick = () => $("#expandAllBtn").click();
$("#fitTreeBtn").onclick = fitTree;
$("#zoomIn").onclick = () => buttonZoom(1.3);
$("#zoomOut").onclick = () => buttonZoom(1 / 1.3);
function buttonZoom(f) {
  const svg = treeMode === "radial" ? $("#familySvg") : $("#classicSvg");
  if (!svg || !zoomBehavior) return;
  d3.select(svg).transition().duration(160).call(zoomBehavior.scaleBy, f);
}
$("#branches").onclick = (e) => {
  const b = e.target.closest("[data-branch]");
  if (!b) return;
  expandedIds.add(b.dataset.branch);
  renderTree();
  selectPerson(b.dataset.branch, true);
};
$("#search").oninput = (e) => {
  const q = norm(e.target.value),
    box = $("#searchResults");
  if (q.length < 2) {
    box.classList.add("hidden");
    return;
  }
  const hits = people
    .filter((p) => norm(p.name).includes(q) || norm(lineage(p)).includes(q))
    .slice(0, 30);
  box.innerHTML =
    hits
      .map(
        (p) =>
          `<div class="result" data-result="${p.id}"><b>${p.name}</b><small>${lineage(p)}</small></div>`,
      )
      .join("") || '<p class="empty">لا توجد نتائج.</p>';
  box.classList.remove("hidden");
};
$("#searchResults").onclick = (e) => {
  const r = e.target.closest("[data-result]");
  if (!r) return;
  ancestorIds(r.dataset.result).forEach((id) => expandedIds.add(id));
  renderTree();
  if (treeMode === "radial") selectPerson(r.dataset.result, true);
  else
    document
      .querySelector(`[data-node="${r.dataset.result}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  $("#searchResults").classList.add("hidden");
  $("#search").value = "";
};

$$("[data-tree-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      treeMode = b.dataset.treeMode;
      $$("[data-tree-mode]").forEach((x) =>
        x.classList.toggle("active", x === b),
      );
      renderTree();
      if (selectedId)
        requestAnimationFrame(() =>
          treeMode === "radial"
            ? zoomToPerson(selectedId)
            : focusClassic(selectedId),
        );
    }),
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

async function loadAnalytics() {
  if (!isAdmin()) return;
  try {
    const [pages, names] = await Promise.all([
        getDocs(collection(db, "analyticsPages")),
        getDocs(collection(db, "analyticsNames")),
      ]),
      pageMap = new Map(pages.docs.map((x) => [x.id, x.data().count || 0])),
      map = byId(),
      top = names.docs
        .map((x) => ({ id: x.id, count: x.data().count || 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    $("#analyticsSummary").innerHTML =
      `<div class="analytics-cards"><article><b>${ar(pageMap.get("interactive_tree") || 0)}</b><span>زيارة للشجرة التفاعلية</span></article><article><b>${ar(pageMap.get("first_edition") || 0)}</b><span>زيارة للإصدار الأول</span></article></div><h2>أكثر الأسماء نسخًا</h2>${top.length ? `<div class="analytics-list">${top.map((x, i) => `<div><span>${ar(i + 1)}. ${esc(map.has(x.id) ? lineage(map.get(x.id)) : x.id)}</span><b>${ar(x.count)}</b></div>`).join("")}</div>` : '<p class="empty">لا توجد عمليات نسخ مسجلة بعد.</p>'}`;
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
    `${userProfile?.name || "مساهم"}<br><span dir="ltr">${auth.currentUser?.phoneNumber || ""}</span>`;
  $("#accountDialog").showModal();
};
$("#logoutBtn").onclick = async () => {
  await signOut(auth);
  $("#accountDialog").close();
  toast("تم تسجيل الخروج");
};
$("#phoneForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    $("#authMessage").textContent = "";
    if (!window.recaptchaVerifier)
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha", {
        size: "invisible",
      });
    confirmation = await signInWithPhoneNumber(
      auth,
      $("#phone").value.trim(),
      window.recaptchaVerifier,
    );
    $("#phoneForm").classList.add("hidden");
    $("#codeForm").classList.remove("hidden");
  } catch (err) {
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
    userProfile = null;
    $("#loginBtn").classList.remove("hidden");
    $("#accountBtn").classList.add("hidden");
    $("#reviewBtn")?.classList.add("hidden");
    return;
  }
  $("#loginBtn").classList.add("hidden");
  $("#accountBtn").classList.remove("hidden");
  $("#accountInitial").textContent = "ع";
  const ps = await getDoc(doc(db, "profiles", u.uid));
  if (ps.exists()) userProfile = ps.data();
  else if (!isAdmin()) {
    $("#profileSetupDialog").showModal();
  } else userProfile = { name: "مدير الشجرة", relation: "المدير" };
  $("#accountName").textContent = userProfile?.name || "حسابي";
  if (isAdmin()) {
    $("#reviewBtn")?.classList.remove("hidden");
    $("#seedBtn").classList.toggle("hidden", remoteLoaded);
    await updatePendingBadge();
  }
});
$("#profileSetupForm").onsubmit = async (e) => {
  e.preventDefault();
  userProfile = {
    name: $("#contributorName").value.trim(),
    relation: $("#contributorRelation").value.trim(),
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
  $("#requestDialog").showModal();
}
$("#requestForm").onsubmit = async (e) => {
  e.preventDefault();
  const type = $("#requestType").value,
    proposed =
      type === "addChild"
        ? {
            id: `N${Date.now().toString(36)}`,
            name: $("#requestName").value.trim(),
            parent: currentPerson.id,
            note: "",
          }
        : {
            name: $("#requestName").value.trim(),
            birthDate: $("#birthDate").value,
            deathDate: $("#deathDate").value,
            position: $("#position").value.trim(),
            city: $("#city").value.trim(),
            note: $("#requestNote").value.trim(),
          };
  await setDoc(doc(collection(db, "changeRequests")), {
    type,
    personId: currentPerson.id,
    personName: currentPerson.name,
    proposed,
    reason: $("#requestReason").value.trim(),
    submittedBy: auth.currentUser.uid,
    submittedPhone: auth.currentUser.phoneNumber,
    submittedName: userProfile?.name || "",
    submittedRelation: userProfile?.relation || "",
    status: "pending",
    createdAt: serverTimestamp(),
  });
  $("#requestDialog").close();
  e.target.reset();
  toast("أُرسل الاقتراح للمراجعة");
};

async function updatePendingBadge() {
  if (!isAdmin()) return;
  const s = await getDocs(
    query(collection(db, "changeRequests"), where("status", "==", "pending")),
  );
  $("#pendingBadge").textContent = ar(s.size);
}
async function loadRequests() {
  if (!isAdmin()) return;
  const s = await getDocs(
      query(collection(db, "changeRequests"), where("status", "==", "pending")),
    ),
    list = $("#reviewList");
  if (s.empty) {
    list.innerHTML = '<p class="empty">لا توجد طلبات معلّقة.</p>';
    return;
  }
  list.innerHTML = s.docs
    .map((x) => {
      const r = x.data();
      return `<article class="review-card" data-request="${x.id}"><header><div><b>${r.type === "addChild" ? "إضافة ابن" : "تعديل معلومات"} — ${r.personName}</b><small>${r.submittedName || "مساهم"} · <span dir="ltr">${r.submittedPhone}</span> · ${r.submittedRelation || ""}</small></div></header><div class="diff">${Object.entries(
        r.proposed || {},
      )
        .filter(([k]) => !["id", "parent"].includes(k))
        .map(([k, v]) => `<b>${k}:</b> ${v || "—"}`)
        .join(
          "<br>",
        )}<hr><b>المصدر:</b> ${r.reason}</div><button class="primary" data-approve>اعتماد</button> <button class="danger" data-reject>رفض</button></article>`;
    })
    .join("");
}
$("#reviewList").onclick = async (e) => {
  const card = e.target.closest("[data-request]");
  if (!card) return;
  const ref = doc(db, "changeRequests", card.dataset.request),
    snap = await getDoc(ref),
    r = snap.data();
  if (e.target.matches("[data-approve]")) {
    if (r.type === "addChild")
      await setDoc(doc(db, "persons", r.proposed.id), r.proposed);
    else await updateDoc(doc(db, "persons", r.personId), r.proposed);
    await updateDoc(ref, {
      status: "approved",
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser.uid,
    });
    toast("تم اعتماد التعديل");
  } else if (e.target.matches("[data-reject]")) {
    await updateDoc(ref, {
      status: "rejected",
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser.uid,
    });
    toast("تم رفض الطلب");
  } else return;
  await loadPeople();
  await loadRequests();
  await updatePendingBadge();
};
$("#seedBtn").onclick = async () => {
  if (!isAdmin() || remoteLoaded) return;
  $("#seedBtn").disabled = true;
  $("#seedBtn").textContent = "جارٍ الاستيراد…";
  for (let i = 0; i < people.length; i += 400) {
    const batch = writeBatch(db);
    people.slice(i, i + 400).forEach((p) =>
      batch.set(doc(db, "persons", p.id), {
        ...p,
        birthDate: "",
        deathDate: "",
        position: "",
        city: "",
      }),
    );
    await batch.commit();
  }
  remoteLoaded = true;
  $("#seedBtn").classList.add("hidden");
  $("#dataStatus").textContent = "متصل بالنسخة المعتمدة";
  toast(`تم استيراد ${ar(people.length)} شخصًا`);
};

loadPeople();
if (new URLSearchParams(location.search).get("login") === "1")
  $("#loginDialog").showModal();
