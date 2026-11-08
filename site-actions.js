(function () {
  document.querySelectorAll("[data-share-page]").forEach((button) => {
    button.addEventListener("click", async () => {
      const data = {
        title: document.title,
        text: "شجرة الضفيان — إرثٌ يُحفظ، وصلةٌ لا تنقطع",
        url: location.href,
      };
      if (navigator.share) {
        try {
          await navigator.share(data);
          return;
        } catch (error) {
          if (error && error.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(data.url);
      const toast = document.querySelector("#toast");
      if (toast) {
        toast.textContent = "تم نسخ رابط الصفحة";
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2600);
      } else {
        button.classList.add("share-done");
        setTimeout(() => button.classList.remove("share-done"), 1600);
      }
    });
  });
})();

// Slim the header once the page is scrolled.
(function () {
  let ticking = false;
  const update = () => {
    document.body.classList.toggle("scrolled", window.scrollY > 24);
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
})();
