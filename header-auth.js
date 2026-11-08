import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  increment,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig, ADMIN_PHONES } from "./site-config.js";

const app =
  getApps().find((item) => item.name === "[DEFAULT]") || initializeApp(firebaseConfig);
const db = getFirestore(app);
const button =
  document.querySelector("#headerAuthBtn") ||
  document.querySelector(".topbar > .primary.nav-link");
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
if (location.pathname.endsWith("numbers.html")) {
  const weekStart = weekStartKey();
  setDoc(
    doc(db, "analyticsPages", "family_numbers"),
    { count: increment(1), lastEventAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});
  setDoc(
    doc(db, "analyticsPageWeeks", `${weekStart}_family_numbers`),
    {
      page: "family_numbers",
      weekStart,
      count: increment(1),
      lastEventAt: serverTimestamp(),
    },
    { merge: true },
  ).catch(() => {});
}
onAuthStateChanged(getAuth(app), async (user) => {
  if (!button) return;
  if (!user || user.isAnonymous) {
    button.textContent = "تسجيل دخول";
    button.href = "index.html?login=1";
    return;
  }
  if (ADMIN_PHONES.includes(user.phoneNumber)) {
    button.textContent = "الإدارة";
    button.href = "index.html?review=1";
    return;
  }
  try {
    const reviewer = await getDoc(doc(db, "reviewers", user.phoneNumber));
    if (reviewer.exists() && reviewer.data().active === true) {
      button.textContent = "المراجعة";
      button.href = "index.html?review=1";
      return;
    }
  } catch (_) {}
  button.textContent = "حسابي";
  button.href = "index.html";
});
