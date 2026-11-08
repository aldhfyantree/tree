// family-tools.js — shared by every family site (same file in each project).
// Safety helpers, fast tree snapshot, automatic backups, text/Excel export,
// and duplicate-name checks.
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs";

/* ---------------------------------------------------------------- text --- */

export const PERSON_FIELDS = [
  "id",
  "name",
  "parent",
  "note",
  "birthDate",
  "deathDate",
  "position",
  "city",
];
export const EDITABLE_FIELDS = ["name", "birthDate", "deathDate", "position", "city", "note"];
const MAX_LEN = { id: 40, name: 60, parent: 40, birthDate: 30, deathDate: 30, position: 100, city: 60, note: 500 };

export function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
export function cleanText(value, max = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
export function norm(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/\s*«.*?»\s*/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/عبد\s+/g, "عبد")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Keep only the person fields we know, as clean strings. */
export function cleanPerson(p) {
  const out = {};
  PERSON_FIELDS.forEach((key) => {
    const value = cleanText(p?.[key], MAX_LEN[key] || 200);
    if (value || ["id", "name", "parent", "note"].includes(key)) out[key] = value;
  });
  return out;
}
/** Only the editable fields from a change request — never id or parent. */
export function cleanUpdate(proposed) {
  const out = {};
  EDITABLE_FIELDS.forEach((key) => {
    if (proposed && key in proposed) out[key] = cleanText(proposed[key], MAX_LEN[key]);
  });
  if ("name" in out && !out.name) delete out.name;
  return out;
}
export function newPersonId(existingIds) {
  let id;
  do {
    id = `N${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  } while (existingIds.has(id));
  return id;
}
/** Sons of `parentId` whose name matches `name` (ignoring hamza, spaces, etc.). */
export function sameNameSiblings(people, parentId, name, ignoreId = "") {
  const key = norm(name);
  if (!key) return [];
  return people.filter((p) => p.parent === parentId && p.id !== ignoreId && norm(p.name) === key);
}

/* ------------------------------------------------------------ tree data --- */

function treeOrder(people) {
  const kids = new Map();
  people.forEach((p) => {
    const key = p.parent || "";
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(p);
  });
  const ids = new Set(people.map((p) => p.id));
  const roots = people.filter((p) => !p.parent || !ids.has(p.parent));
  const out = [];
  const seen = new Set();
  const walk = (p, depth, branch) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    out.push({ person: p, depth, branch });
    (kids.get(p.id) || []).forEach((c) => walk(c, depth + 1, depth === 0 ? c : branch));
  };
  roots.forEach((r) => walk(r, 0, null));
  return { rows: out, kids };
}
function lineageOf(p, map) {
  const names = [];
  let x = p;
  const guard = new Set();
  while (x && !guard.has(x.id)) {
    guard.add(x.id);
    names.push(x.name);
    x = map.get(x.parent);
  }
  return names.join(" بن ");
}

/* ------------------------------------------------------------- snapshot --- */
// The whole tree is kept in ONE document (meta/tree) so a visit costs 1 read
// instead of one read per person.

const SNAPSHOT_LIMIT = 950000; // Firestore documents must stay under 1 MB.

function packPeople(people) {
  return people.map(cleanPerson).filter((p) => p.id && p.name);
}
function assertSize(people) {
  const size = new Blob([JSON.stringify(people)]).size;
  if (size > SNAPSHOT_LIMIT)
    throw new Error(`حجم الشجرة (${Math.round(size / 1024)} KB) تجاوز حد المستند الواحد`);
}
export async function loadTreeSnapshot(db) {
  const snap = await getDoc(doc(db, "meta", "tree"));
  if (!snap.exists()) return null;
  const data = snap.data();
  return Array.isArray(data.people) && data.people.length ? data.people : null;
}
export async function loadAllPersons(db) {
  const snap = await getDocs(collection(db, "persons"));
  return snap.docs.map((d) => d.data());
}
export async function saveTreeSnapshot(db, people, uid = "") {
  const packed = packPeople(people);
  assertSize(packed);
  await setDoc(doc(db, "meta", "tree"), {
    people: packed,
    count: packed.length,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  return packed;
}

/* -------------------------------------------------------------- backups --- */

export function riyadhDay(date = new Date()) {
  return new Date(date.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
async function writeBackup(db, id, people, kind, uid) {
  const packed = packPeople(people);
  assertSize(packed);
  await setDoc(doc(db, "backups", id), {
    people: packed,
    count: packed.length,
    kind,
    createdAt: serverTimestamp(),
    createdBy: uid || "",
  });
  return id;
}
/** First change of the day saves a copy of the tree as it was before. */
export async function ensureDailyBackup(db, people, uid) {
  const id = `auto-${riyadhDay()}`;
  try {
    const existing = await getDoc(doc(db, "backups", id));
    if (existing.exists()) return null;
    return await writeBackup(db, id, people, "auto", uid);
  } catch (error) {
    console.warn("Daily backup failed", error);
    return null;
  }
}
export function manualBackup(db, people, uid, kind = "manual") {
  const stamp = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return writeBackup(db, `${kind}-${stamp}`, people, kind, uid);
}
export async function listBackups(db) {
  const snap = await getDocs(collection(db, "backups"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}
/** Make the persons collection match a backup exactly, then refresh the snapshot. */
export async function restoreBackup(db, backupPeople, uid) {
  const target = packPeople(backupPeople),
    current = await loadAllPersons(db);
  await manualBackup(db, current.length ? current : target, uid, "pre-restore");
  const keep = new Set(target.map((p) => p.id));
  const ops = [
    ...target.map((p) => ["set", p]),
    ...current.filter((p) => p.id && !keep.has(p.id)).map((p) => ["delete", p]),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(([op, p]) => {
      const ref = doc(db, "persons", p.id);
      op === "set" ? batch.set(ref, p) : batch.delete(ref);
    });
    await batch.commit();
  }
  await saveTreeSnapshot(db, target, uid);
  return target;
}

/* --------------------------------------------------------------- export --- */

function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function extraInfo(p) {
  return [
    p.birthDate && `الميلاد: ${p.birthDate}`,
    p.deathDate && `الوفاة: ${p.deathDate}`,
    p.position && `العمل: ${p.position}`,
    p.city && `المدينة: ${p.city}`,
    p.note && `ملاحظة: ${p.note}`,
  ].filter(Boolean);
}

function sonsLabel(n) {
  return n === 1 ? "ابن واحد" : n === 2 ? "ابنان" : n <= 10 ? `${n} أبناء` : `${n} ابناً`;
}
/** Plain text: summary, indented tree, then one full name per line. */
export function buildText(people, title) {
  const map = new Map(people.map((p) => [p.id, p])),
    { rows, kids } = treeOrder(people),
    today = riyadhDay(),
    depthMax = rows.reduce((m, r) => Math.max(m, r.depth + 1), 0),
    line = "=".repeat(60);
  const out = [
    title,
    line,
    `تاريخ التنزيل: ${today}`,
    `عدد الأشخاص: ${people.length}`,
    `عدد الأجيال: ${depthMax}`,
    "",
    line,
    "أولاً: الشجرة (كل سطر ابن للسطر الأعلى منه بمسافة أقل)",
    line,
  ];
  rows.forEach(({ person, depth }) => {
    const count = (kids.get(person.id) || []).length,
      info = extraInfo(person);
    out.push(
      `${"    ".repeat(depth)}${depth ? "└─ " : ""}${person.name}${count ? `  (${sonsLabel(count)})` : ""}${info.length ? `  [${info.join(" · ")}]` : ""}`,
    );
  });
  out.push("", line, "ثانياً: الأسماء الكاملة", line);
  rows.forEach(({ person }, i) => out.push(`${i + 1}. ${lineageOf(person, map)}`));
  out.push("");
  return out.join("\r\n");
}
export function downloadText(people, title, filePrefix) {
  const blob = new Blob(["﻿" + buildText(people, title)], { type: "text/plain;charset=utf-8" });
  download(blob, `${filePrefix}-${riyadhDay()}.txt`);
}

/** Rows for the Excel sheet, in tree order. */
export function buildRows(people) {
  const map = new Map(people.map((p) => [p.id, p])),
    { rows, kids } = treeOrder(people);
  return rows.map(({ person: p, depth, branch }, i) => ({
    "م": i + 1,
    "الرقم": p.id,
    "الاسم": p.name,
    "الاسم الكامل": lineageOf(p, map),
    "رقم الأب": p.parent || "",
    "اسم الأب": map.get(p.parent)?.name || "",
    "الجيل": depth + 1,
    "الفرع": branch?.name || "",
    "عدد الأبناء": (kids.get(p.id) || []).length,
    "تاريخ الميلاد": p.birthDate || "",
    "تاريخ الوفاة": p.deathDate || "",
    "المدينة": p.city || "",
    "المنصب أو العمل": p.position || "",
    "ملاحظة": p.note || "",
  }));
}
export async function buildWorkbook(XLSX, people, title) {
  const rows = buildRows(people),
    ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [5, 10, 14, 48, 10, 14, 6, 14, 10, 12, 12, 12, 18, 30].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: ws["!ref"] };
  const branchCounts = new Map();
  rows.forEach((r) => r["الفرع"] && branchCounts.set(r["الفرع"], (branchCounts.get(r["الفرع"]) || 0) + 1));
  const summary = XLSX.utils.aoa_to_sheet([
    [title],
    ["تاريخ التنزيل", riyadhDay()],
    ["عدد الأشخاص", rows.length],
    ["عدد الأجيال", rows.reduce((m, r) => Math.max(m, r["الجيل"]), 0)],
    [],
    ["الفرع", "عدد الأشخاص"],
    ...[...branchCounts.entries()].map(([name, n]) => [name, n]),
  ]);
  summary["!cols"] = [{ wch: 22 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الأسماء");
  XLSX.utils.book_append_sheet(wb, summary, "ملخص");
  return wb;
}
export async function downloadExcel(people, title, filePrefix) {
  const XLSX = await import(XLSX_URL);
  const wb = await buildWorkbook(XLSX, people, title);
  XLSX.writeFile(wb, `${filePrefix}-${riyadhDay()}.xlsx`, { compression: true });
}

/* ----------------------------------------------------------- admin UI --- */
// opts: { db, auth, title, filePrefix, toast, getPeople, canReview, isOwner, onTreeReplaced }

export function initAdminTools(opts) {
  const $ = (s) => document.querySelector(s);
  const uid = () => opts.auth.currentUser?.uid || "";
  const busy = async (button, label, fn) => {
    if (!button || button.disabled) return;
    const old = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try {
      await fn();
    } catch (error) {
      console.error(error);
      opts.toast(`تعذر إكمال العملية: ${error?.message || error}`);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  };

  $("#exportExcelBtn")?.addEventListener("click", (e) =>
    busy(e.currentTarget, "جارٍ التجهيز…", () => downloadExcel(opts.getPeople(), opts.title, opts.filePrefix)),
  );
  $("#exportTextBtn")?.addEventListener("click", () => downloadText(opts.getPeople(), opts.title, opts.filePrefix));
  $("#backupNowBtn")?.addEventListener("click", (e) =>
    busy(e.currentTarget, "جارٍ الحفظ…", async () => {
      await manualBackup(opts.db, await loadAllPersonsOrCurrent(), uid());
      opts.toast("تم حفظ نسخة احتياطية");
      await renderBackups();
    }),
  );
  $("#rebuildSnapshotBtn")?.addEventListener("click", (e) =>
    busy(e.currentTarget, "جارٍ التحديث…", async () => {
      const all = await loadAllPersons(opts.db);
      if (!all.length) throw new Error("قاعدة البيانات فارغة");
      const saved = await saveTreeSnapshot(opts.db, opts.merge ? opts.merge(all) : all, uid());
      opts.onTreeReplaced(saved);
      opts.toast(`تم تحديث النسخة السريعة (${saved.length} شخصاً)`);
    }),
  );

  async function loadAllPersonsOrCurrent() {
    const all = await loadAllPersons(opts.db);
    return all.length ? all : opts.getPeople();
  }

  const kindLabel = { auto: "تلقائية", manual: "يدوية", "pre-restore": "قبل الاستعادة" };
  let backups = [];
  async function renderBackups() {
    const list = $("#backupList");
    if (!list || !opts.isOwner()) return;
    try {
      backups = await listBackups(opts.db);
      list.innerHTML = backups.length
        ? backups
            .slice(0, 60)
            .map(
              (b) =>
                `<article data-backup="${esc(b.id)}"><div><b>${esc(formatDate(b.createdAt) || b.id)}</b><small>${esc(kindLabel[b.kind] || b.kind || "")} · ${esc(b.count ?? b.people?.length ?? 0)} شخصاً</small></div><div class="backup-actions"><button type="button" class="secondary" data-backup-excel>Excel</button><button type="button" class="secondary" data-backup-text>نص</button><button type="button" class="danger" data-backup-restore>استعادة</button></div></article>`,
            )
            .join("")
        : '<p class="empty">لا توجد نسخ بعد. ستُحفظ أول نسخة تلقائياً عند أول اعتماد اليوم.</p>';
    } catch (error) {
      console.warn("Backups unavailable", error);
      list.innerHTML = '<p class="empty">تعذر تحميل النسخ الاحتياطية. تأكد من نشر قواعد Firestore الجديدة.</p>';
    }
  }
  $("#backupList")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-backup]"),
      backup = card && backups.find((b) => b.id === card.dataset.backup);
    if (!backup || !opts.isOwner()) return;
    const label = `${opts.title} - نسخة ${backup.id}`,
      prefix = `${opts.filePrefix}-backup-${backup.id}`;
    if (e.target.matches("[data-backup-excel]"))
      busy(e.target, "…", async () => {
        const XLSX = await import(XLSX_URL);
        XLSX.writeFile(await buildWorkbook(XLSX, backup.people || [], label), `${prefix}.xlsx`, { compression: true });
      });
    if (e.target.matches("[data-backup-text]"))
      download(new Blob(["﻿" + buildText(backup.people || [], label)], { type: "text/plain;charset=utf-8" }), `${prefix}.txt`);
    if (e.target.matches("[data-backup-restore]")) {
      const button = e.target;
      if (button.dataset.armed !== "1") {
        button.dataset.armed = "1";
        button.textContent = "اضغط مرة أخرى للتأكيد";
        setTimeout(() => {
          button.dataset.armed = "";
          button.textContent = "استعادة";
        }, 5000);
        return;
      }
      button.dataset.armed = "";
      busy(button, "جارٍ الاستعادة…", async () => {
        const restored = await restoreBackup(opts.db, backup.people || [], uid());
        opts.onTreeReplaced(restored);
        opts.toast(`تمت الاستعادة (${restored.length} شخصاً). حُفظت نسخة من الوضع السابق.`);
        await renderBackups();
      });
    }
  });

  return {
    show() {
      $("#adminTools")?.classList.toggle("hidden", !opts.canReview());
      $("#backupSection")?.classList.toggle("hidden", !opts.isOwner());
      if (opts.isOwner()) renderBackups();
    },
    hide() {
      $("#adminTools")?.classList.add("hidden");
      $("#backupSection")?.classList.add("hidden");
    },
    renderBackups,
  };
}
function formatDate(value) {
  const date = value?.toDate?.();
  if (!date) return "";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date);
}
