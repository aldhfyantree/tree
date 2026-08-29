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
  setDoc,
  increment,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const config = {
  apiKey: "AIzaSyCw0GNrUYIvwPYY5LpCgnuFYi7a903qAuE",
  authDomain: "aldhfyantree-f3273.firebaseapp.com",
  projectId: "aldhfyantree-f3273",
  appId: "1:436236972378:web:e57101eeb8c3b41a2b8363",
};
const app =
  getApps().find((item) => item.name === "[DEFAULT]") || initializeApp(config);
const button =
  document.querySelector("#headerAuthBtn") ||
  document.querySelector(".topbar > .primary.nav-link");
const admins = ["+966552806075", "+16505553434"];
if (location.pathname.endsWith("numbers.html"))
  setDoc(
    doc(getFirestore(app), "analyticsPages", "family_numbers"),
    { count: increment(1), lastEventAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});
onAuthStateChanged(getAuth(app), (user) => {
  if (!button) return;
  document.querySelector("#adminNav")?.classList.add("hidden");
  if (!user) {
    button.textContent = "تسجيل دخول";
    button.href = "index.html?login=1";
    return;
  }
  if (admins.includes(user.phoneNumber)) {
    button.textContent = "حسابي";
    button.href = "index.html";
    document.querySelector("#adminNav")?.classList.remove("hidden");
  } else {
    button.textContent = "حسابي";
    button.href = "index.html";
  }
});
