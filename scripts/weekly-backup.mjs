// نسخة احتياطية أسبوعية لأسماء شجرة الضفيان من Firestore إلى هذا المستودع.
// تقرأ مجموعة persons العامة (القراءة مسموحة للجميع في القواعد) فلا تحتاج أي مفتاح سري.
// المخرجات: backups/persons.json و backups/persons.csv (يفتح في Excel) و backups/last-backup.txt
import { writeFileSync, mkdirSync } from "node:fs";

const PROJECT = process.env.FIREBASE_PROJECT || "aldhfyan-family";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const val = (v) => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)]));
  return null;
};

async function listAll(col) {
  const out = []; let token = "";
  do {
    const url = `${BASE}/${col}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${col}: HTTP ${res.status} ${await res.text()}`);
    const j = await res.json();
    for (const d of j.documents || []) {
      const id = d.name.split("/").pop();
      out.push({ id, ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)])) });
    }
    token = j.nextPageToken || "";
  } while (token);
  return out;
}

const persons = (await listAll("persons")).filter((p) => p.id && p.name);
if (persons.length < 50) throw new Error(`عدد الأسماء قليل بشكل غير طبيعي (${persons.length}) — لن تُستبدل النسخة السابقة`);
persons.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

const byId = new Map(persons.map((p) => [p.id, p]));
const lineage = (p) => { const a = []; const seen = new Set(); while (p && !seen.has(p.id)) { seen.add(p.id); a.push(p.name); p = byId.get(p.parent); } return a.join(" بن "); };
const depth = (p) => { let d = 0; const seen = new Set(); while (p && byId.get(p.parent) && !seen.has(p.id)) { seen.add(p.id); d++; p = byId.get(p.parent); } return d + 1; };

mkdirSync("backups", { recursive: true });
writeFileSync("backups/persons.json", JSON.stringify(persons, null, 1) + "\n");

const keys = [...new Set(persons.flatMap((p) => Object.keys(p)))].filter((k) => !["id", "name", "parent"].includes(k)).sort();
const cols = ["id", "name", "parent", "الجيل", "النسب الكامل", ...keys];
const cell = (x) => { const s = x == null ? "" : typeof x === "object" ? JSON.stringify(x) : String(x); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const rows = persons.map((p) => cols.map((c) => cell(c === "الجيل" ? depth(p) : c === "النسب الكامل" ? lineage(p) : p[c])).join(","));
writeFileSync("backups/persons.csv", "﻿" + [cols.join(","), ...rows].join("\r\n") + "\r\n");

// يتغير كل أسبوع حتى يبقى المستودع نشطاً ولا يوقف GitHub الجدولة التلقائية
writeFileSync("backups/last-backup.txt", `آخر نسخة: ${new Date().toISOString()}\nعدد الأسماء: ${persons.length}\n`);
console.log(`تم حفظ ${persons.length} اسماً`);
