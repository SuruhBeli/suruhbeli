/* ================= GLOBAL LOTTIE STORAGE ================= */
let lottieInstances = [];
/* ================= INIT HOME ================= */
window.initHome = function () {

  function initHome() {
    const heroImage = document.getElementById("heroImage");
    const bannerCarousel = document.getElementById("bannerCarousel");
    const bannerDots = document.getElementById("bannerDots");
    const scrollHeader = document.getElementById("scrollHeader");
    const logoTop = document.querySelector(".logo-top");
    const lottieContainer = document.getElementById("lottieAnimation");
    const viewHome = document.getElementById("view-home");
    viewHome.addEventListener("scroll", () => {
      logoTop.classList.toggle("scrolled", viewHome.scrollTop > 10);
      scrollHeader.style.opacity = Math.min(viewHome.scrollTop / 50, 1);
    });

    loadHero(heroImage);
    loadBanners(bannerCarousel, bannerDots);
    initScrollEffect(scrollHeader, logoTop);
    initLotties(lottieContainer);
    toggleHomeHeader(true);
  }

  /* ================= HERO ================= */
  async function loadHero(heroImage) {

    const skeleton = document.getElementById("heroSkeleton");
    if (!heroImage) return;

    try {
      const doc = await firebase.firestore()
        .collection("stockfoto")
        .doc("foto")
        .get();

      const url = doc.exists ? doc.data().headerhome : null;
      heroImage.src = url || "default.png";

      heroImage.onload = () => {
        heroImage.style.opacity = 1;
        skeleton && skeleton.classList.remove("skeleton");
      };

      heroImage.onerror = () => {
        heroImage.src = "default.png";
        skeleton && skeleton.classList.remove("skeleton");
      };

    } catch (err) {
      heroImage.src = "default.png";
      skeleton && skeleton.classList.remove("skeleton");
    }
  }

  /* ================= BANNERS ================= */
  async function loadBanners(container, dots) {

    if (!container || !dots) return;

    try {
      const doc = await firebase.firestore()
        .collection("stockfoto")
        .doc("foto")
        .get();

      const banners = doc.exists && Array.isArray(doc.data().bannerhome)
        ? doc.data().bannerhome
        : [];

      renderCarousel(container, dots, banners);

    } catch (err) {
      console.error("Banner error:", err);
      container.innerHTML = "";
    }
  }

  function renderCarousel(container, dots, banners) {

    container.innerHTML = "";
    dots.innerHTML = "";

    if (!banners.length) {
      container.innerHTML =
        `<div style="height:150px;border-radius:10px;background:#eee;"></div>`;
      return;
    }

    let currentIndex = 0;
    let interval;

    banners.forEach((url, i) => {

      const img = document.createElement("img");
      img.src = url || "default.png";
      img.onerror = () => img.src = "default.png";

      if (i === 0) img.classList.add("active");

      container.appendChild(img);

      const dot = document.createElement("span");
      dot.className = "dot" + (i === 0 ? " active" : "");
      dot.onclick = () => showBanner(i);
      dots.appendChild(dot);
    });

    function showBanner(index) {
      const width = container.children[0]?.offsetWidth || 0;
      container.scrollTo({ left: width * index, behavior: "smooth" });
      currentIndex = index;
      updateDots();
    }

    function updateDots() {
      [...dots.children].forEach((d, i) =>
        d.classList.toggle("active", i === currentIndex)
      );
    }

    function startAuto() {
      if (banners.length < 2) return;
      interval = setInterval(() => {
        currentIndex = (currentIndex + 1) % banners.length;
        showBanner(currentIndex);
      }, 3500);
    }

    startAuto();
  }

  /* ================= LOTTIE ================= */
  function initLotties(mainContainer) {

    if (typeof lottie === "undefined") return;

    // Destroy lama (SPA safe)
    lottieInstances.forEach(anim => anim.destroy());
    lottieInstances = [];

    const names = ["makanan", "belanja", "barang", "lainnya"];

    names.forEach(name => {
      const container = document.getElementById(`lottie-${name}`);
      if (!container) return;

      const anim = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: true,
        autoplay: true,
        path: `${name}.json`
      });

      anim.addEventListener("DOMLoaded", () => {
        container.classList.remove("skeleton");
      });

      lottieInstances.push(anim);
    });

    if (mainContainer) {
      const mainAnim = lottie.loadAnimation({
        container: mainContainer,
        renderer: "svg",
        loop: true,
        autoplay: true,
        path: "ikon-1.json"
      });

      mainAnim.addEventListener("DOMLoaded", () => {
        mainContainer.classList.remove("skeleton");
      });

      lottieInstances.push(mainAnim);
    }
  }

  /* ================= SCROLL EFFECT ================= */
function initScrollEffect(scrollHeader, logoTop) {
  const viewHome = document.getElementById("view-home");
  if (!viewHome) return;

  function handleScroll() {
    const scrollTop = viewHome.scrollTop; // scroll dari view-home
    if (logoTop) {
      logoTop.classList.toggle("scrolled", scrollTop > 10);
    }
    if (scrollHeader) {
      scrollHeader.style.opacity = Math.min(scrollTop / 50, 1);
    }
  }

  viewHome.addEventListener("scroll", handleScroll);
}
  initHome();
};

/* ================= GO ORDER ================= */
window.goOrder = function(type) {
  // Sembunyikan semua view lain
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active", "zoom-in", "zoom-out"));

  // Tampilkan view order
  const viewOrder = document.getElementById("view-order");
  if (viewOrder) {
    viewOrder.classList.add("active", "zoom-in");
    viewOrder.style.zIndex = 2;
    viewOrder.dataset.type = type;
  }

  // Toggle header (home header) sesuai kebutuhan
  toggleHomeHeader(false);

  // 🔹 Sembunyikan navbar dan navCircle
  toggleNavbarForOrder(true);

  console.log("SPA Order type:", type);
};