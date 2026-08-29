const people = window.SEED_PEOPLE || [];
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
const children = new Map();
people.forEach((p) => {
  const key = p.parent || "";
  if (!children.has(key)) children.set(key, []);
  children.get(key).push(p);
});
const depth = (p, map = new Map(people.map((x) => [x.id, x]))) =>
  p.parent ? 1 + depth(map.get(p.parent), map) : 1;
const root = (children.get("") || [])[0];
const counts = new Map();
people.forEach((p) => {
  const clean = String(p.name || "")
    .replace(/\s*«.*?»\s*/g, "")
    .trim();
  let key = norm(clean);
  if (["ابراهيم", "برايهم", "ابرايهم", "ابراهم"].includes(key)) key = "ابراهيم";
  const item = counts.get(key) || {
    name: key === "ابراهيم" ? "إبراهيم" : clean,
    count: 0,
  };
  item.count++;
  counts.set(key, item);
});
document.querySelector("#peopleCount").textContent = ar(people.length);
document.querySelector("#generationCount").textContent = ar(
  Math.max(...people.map((p) => depth(p))),
);
document.querySelector("#branchCount").textContent = ar(
  root ? (children.get(root.id) || []).length : 0,
);
document.querySelector("#uniqueCount").textContent = ar(counts.size);
const countDesc = (id) =>
  (children.get(id) || []).reduce(
    (total, child) => total + 1 + countDesc(child.id),
    0,
  );
const branches = root ? children.get(root.id) || [] : [];
document.querySelector("#branchBreakdown").innerHTML = branches
  .map(
    (branch) =>
      `<article><b>${branch.name}</b><span>${ar(countDesc(branch.id) + 1)} شخصاً</span></article>`,
  )
  .join("");
const values = [...counts.values()];
const draw = (id, list) =>
  (document.querySelector(id).innerHTML = list
    .map(
      (x, i) =>
        `<div><i>${ar(i + 1)}</i><b>${x.name}</b><span>${ar(x.count)} شخصاً</span></div>`,
    )
    .join(""));
draw(
  "#mostNames",
  [...values]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"))
    .slice(0, 5),
);
draw(
  "#leastNames",
  [...values]
    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, "ar"))
    .slice(0, 5),
);
