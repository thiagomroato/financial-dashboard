/**
 * Pull-to-refresh simples (mobile)
 * - Detecta gesto de puxar para baixo quando está no topo da página
 * - Chama window.refreshApp() (definida no app.js) ou fallback para reload
 *
 * Não usa libs e evita disparar quando a pessoa está scrollando dentro da tabela/sidebar.
 */

(function () {
  const THRESHOLD_PX = 70;     // quanto precisa puxar para disparar
  const MAX_PULL_PX = 120;     // limite visual (se você quiser adicionar UI depois)
  const COOLDOWN_MS = 1200;    // evita múltiplos disparos seguidos

  let startY = 0;
  let pulling = false;
  let lastFire = 0;

  function now() {
    return Date.now();
  }

  function atTop() {
    // top real da página
    return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  }

  // Se o dedo começou dentro de um elemento com scroll interno, não intercepta
  function isInsideScrollable(el) {
    const scrollable = el?.closest?.(".table-wrap, .sidebar, .dd-menu, .modal-content");
    if (!scrollable) return false;
    return scrollable.scrollHeight > scrollable.clientHeight || scrollable.scrollWidth > scrollable.clientWidth;
  }

  async function fireRefresh() {
    if (now() - lastFire < COOLDOWN_MS) return;
    lastFire = now();

    try {
      if (typeof window.refreshApp === "function") {
        await window.refreshApp();
      } else {
        // fallback
        location.reload();
      }
    } catch (e) {
      console.warn("refreshApp failed:", e);
      location.reload();
    }
  }

  window.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) return;

    const target = e.target;
    if (isInsideScrollable(target)) return;

    // só começa se estiver no topo da página
    if (!atTop()) return;

    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    if (!e.touches || e.touches.length !== 1) return;

    const dy = e.touches[0].clientY - startY;

    // se começou a "empurrar" pra cima, cancela
    if (dy < 0) {
      pulling = false;
      return;
    }

    // Se quiser, aqui daria para aplicar um efeito visual (translateY)
    // const pull = Math.min(dy, MAX_PULL_PX);
    // document.body.style.transform = `translateY(${pull * 0.25}px)`;
  }, { passive: true });

  window.addEventListener("touchend", async (e) => {
    if (!pulling) return;
    pulling = false;

    // document.body.style.transform = ""; // se usar efeito visual

    const touch = e.changedTouches?.[0];
    if (!touch) return;

    const dy = touch.clientY - startY;
    if (dy >= THRESHOLD_PX && atTop()) {
      await fireRefresh();
    }
  }, { passive: true });
})();
