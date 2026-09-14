(() => {
  const island = document.getElementById("island");
  const hint = document.getElementById("island-hint");
  const nav = document.querySelector(".nav");
  if (!island)
    return;

  const states = [
    {id: "idle", label: "Idle notch"},
    {id: "media", label: "Media · compact"},
    {id: "expanded", label: "Media · expanded"},
    {id: "charging", label: "Charging pill"},
    {id: "volume", label: "Volume HUD"},
    {id: "bluetooth", label: "Bluetooth"},
    {id: "privacy", label: "Privacy"},
  ];

  let i = 0;
  let timer = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const show = next => {
    i = (next + states.length) % states.length;
    island.dataset.state = states[i].id;
    island.setAttribute("aria-label", `Eave preview: ${states[i].label}. Click to morph.`);
    if (hint)
      hint.lastChild.textContent = ` ${states[i].label} — click to morph.`;
  };

  const arm = () => {
    if (reduce)
      return;
    window.clearInterval(timer);
    timer = window.setInterval(() => show(i + 1), 4200);
  };

  island.addEventListener("click", () => {
    show(i + 1);
    arm();
  });

  island.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show(i + 1);
      arm();
    }
  });

  if (!reduce)
    arm();

  const onScroll = () => {
    if (!nav)
      return;
    nav.classList.toggle("is-stuck", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, {passive: true});
})();
