import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAnalytics,
  isSupported,
  logEvent,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";
import {
  getFirestore,
  doc,
  setDoc,
  increment,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const firebaseConfig = {
    apiKey: "AIzaSyCw0GNrUYIvwPYY5LpCgnuFYi7a903qAuE",
    authDomain: "aldhfyantree-f3273.firebaseapp.com",
    projectId: "aldhfyantree-f3273",
    storageBucket: "aldhfyantree-f3273.firebasestorage.app",
    messagingSenderId: "436236972378",
    appId: "1:436236972378:web:e57101eeb8c3b41a2b8363",
  },
  firebaseApp = initializeApp(firebaseConfig, "pdf-page");
isSupported()
  .then((ok) => {
    if (ok)
      logEvent(getAnalytics(firebaseApp), "page_view", {
        page_name: "first_edition",
      });
  })
  .catch(() => {});
setDoc(
  doc(getFirestore(firebaseApp), "analyticsPages", "first_edition"),
  { count: increment(1), lastEventAt: serverTimestamp() },
  { merge: true },
).catch(() => {});

async function renderPdf() {
  const viewer = document.querySelector("#pdfViewer"),
    canvas = document.querySelector("#pdfCanvas"),
    loading = document.querySelector("#pdfLoading");
  try {
    const pdf = await pdfjsLib.getDocument("shajarat-aldhfyan-original.pdf")
        .promise,
      page = await pdf.getPage(1),
      base = page.getViewport({ scale: 1 });
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1),
      cssScale = Math.max(0.5, (viewer.clientWidth - 20) / base.width),
      viewport = page.getViewport({ scale: cssScale * pixelRatio }),
      ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / pixelRatio}px`;
    canvas.hidden = false;
    loading.remove();
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch (error) {
    loading.textContent =
      "تعذر فتح الملف داخل الصفحة. حدّث الصفحة وحاول مرة أخرى.";
    console.error(error);
  }
}
renderPdf();
