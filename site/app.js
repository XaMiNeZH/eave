(() => {
  document.documentElement.classList.add("js-ready");

  const island = document.getElementById("island");
  const hint = document.getElementById("island-hint");
  const hintCopy = hint?.querySelector(".hint-copy");
  const desktop = island?.closest(".desktop");
  const nav = document.querySelector(".nav");
  const wallpaper = document.getElementById("demo-wallpaper");
  const stage = document.getElementById("demo-stage");
  const muteBtn = document.getElementById("demo-mute");
  const clockEl = document.getElementById("panel-clock");
  const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduce = () => reduceMq.matches;

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad = n => String(n).padStart(2, "0");
  const tickClock = () => {
    if (!clockEl)
      return;
    const now = new Date();
    clockEl.innerHTML = `${days[now.getDay()]} ${now.getDate()}&ensp;${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };
  tickClock();
  window.setInterval(tickClock, 15000);

  const reveal = () => {
    const nodes = document.querySelectorAll("[data-reveal]");
    if (reduce()) {
      nodes.forEach(node => node.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting)
          continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    }, {threshold: 0.14, rootMargin: "0px 0px -8% 0px"});
    nodes.forEach(node => io.observe(node));
  };
  reveal();

  const onScroll = () => {
    if (nav)
      nav.classList.toggle("is-stuck", window.scrollY > 12);
    if (wallpaper && !reduce()) {
      const y = Math.min(Math.max(window.scrollY, 0), 720);
      wallpaper.style.transform = `translate3d(0, ${y * 0.16}px, 0) scale(1.06)`;
    }
  };
  onScroll();
  window.addEventListener("scroll", onScroll, {passive: true});

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
  const mediaStates = new Set(["media", "expanded"]);

  let i = 0;
  let timer = 0;
  let inView = true;
  let muted = false;
  let heard = false;
  const bed = createDemoBed();

  const hintFor = (state, playing) => {
    if (playing && mediaStates.has(state.id))
      return "Media · quiet demo loop.";
    if (state.id === "media")
      return "Media · compact. Click to expand (plays a demo loop).";
    return `${state.label}. Click to morph.`;
  };

  const syncMute = () => {
    if (!muteBtn)
      return;
    muteBtn.hidden = !heard;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "Unmute demo" : "Mute demo");
    const label = muteBtn.querySelector(".mute-label");
    if (label)
      label.textContent = muted ? "Unmute" : "Mute";
  };

  const show = (next, {fromUser = false} = {}) => {
    i = (next + states.length) % states.length;
    const state = states[i];
    island.dataset.state = state.id;
    if (desktop)
      desktop.dataset.island = state.id;
    island.setAttribute("aria-label", `Eave preview: ${state.label}. Click to morph.`);

    if (mediaStates.has(state.id)) {
      if (fromUser && !muted) {
        heard = true;
        bed.start();
      }
    } else {
      bed.stop();
    }

    island.dataset.audio = bed.playing() ? "on" : (muted ? "muted" : "off");
    if (hintCopy)
      hintCopy.textContent = hintFor(state, bed.playing());
    syncMute();
  };

  const arm = () => {
    if (reduce())
      return;
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      if (!inView || document.hidden)
        return;
      show(i + 1);
    }, 5200);
  };

  const step = fromUser => {
    show(i + 1, {fromUser});
    arm();
  };

  island.addEventListener("click", () => step(true));
  island.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      step(true);
    }
  });

  island.addEventListener("pointermove", event => {
    if (reduce())
      return;
    const box = island.getBoundingClientRect();
    island.style.setProperty("--gx", `${event.clientX - box.left}px`);
    island.style.setProperty("--gy", `${event.clientY - box.top}px`);
  });

  if (muteBtn) {
    muteBtn.addEventListener("click", event => {
      event.preventDefault();
      muted = !muted;
      if (muted)
        bed.stop();
      else if (mediaStates.has(states[i].id))
        bed.start();
      island.dataset.audio = bed.playing() ? "on" : "muted";
      if (hintCopy)
        hintCopy.textContent = hintFor(states[i], bed.playing());
      syncMute();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden)
      bed.stop();
    island.dataset.audio = bed.playing() ? "on" : (muted ? "muted" : "off");
    syncMute();
  });

  if (stage && "IntersectionObserver" in window) {
    const stageIo = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0.2);
      if (!inView)
        bed.stop();
    }, {threshold: [0, 0.2, 0.5]});
    stageIo.observe(stage);
  }

  if (!reduce())
    arm();

  reduceMq.addEventListener("change", () => {
    if (reduce()) {
      window.clearInterval(timer);
      document.querySelectorAll("[data-reveal]").forEach(node => node.classList.add("is-in"));
      if (wallpaper)
        wallpaper.style.transform = "";
    } else {
      arm();
    }
  });

  function createDemoBed() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let master = null;
    let filter = null;
    let active = false;
    let stepIndex = 0;
    let clock = 0;
    const voices = [];

    const bpm = 76;
    const stepSec = 60 / bpm / 2;
    const melody = [220, 261.63, 329.63, 392, 329.63, 293.66, 261.63, 196];

    const ensure = () => {
      if (!AudioCtx)
        return null;
      if (ctx)
        return ctx;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0;
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;
      filter.Q.value = 0.7;
      filter.connect(master);
      master.connect(ctx.destination);
      return ctx;
    };

    const envGain = (peak, attack, hold, release, at) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + attack);
      g.gain.setValueAtTime(peak, at + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
      return g;
    };

    const tone = (freq, type, peak, attack, hold, release, at, dest) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, at);
      const g = envGain(peak, attack, hold, release, at);
      osc.connect(g);
      g.connect(dest);
      osc.start(at);
      osc.stop(at + attack + hold + release + 0.02);
    };

    const kick = at => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(92, at);
      osc.frequency.exponentialRampToValueAtTime(38, at + 0.18);
      const g = envGain(0.22, 0.004, 0.04, 0.2, at);
      osc.connect(g);
      g.connect(master);
      osc.start(at);
      osc.stop(at + 0.28);
    };

    const hat = at => {
      const bufferSize = Math.floor(ctx.sampleRate * 0.05);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let n = 0; n < bufferSize; n++)
        data[n] = (Math.random() * 2 - 1) * (1 - n / bufferSize);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 6000;
      const g = envGain(0.035, 0.001, 0.01, 0.04, at);
      src.connect(hp);
      hp.connect(g);
      g.connect(master);
      src.start(at);
    };

    const startPads = () => {
      const freqs = [110, 164.81, 220];
      freqs.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        osc.type = index === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.08 + index * 0.03;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 4 + index;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        const g = ctx.createGain();
        g.gain.value = index === 0 ? 0.07 : 0.028;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        lfo.start();
        voices.push(osc, lfo);
      });
    };

    const schedule = () => {
      if (!active || !ctx)
        return;
      const horizon = ctx.currentTime + 0.35;
      while (clock < horizon) {
        const at = clock;
        if (stepIndex % 8 === 0)
          kick(at);
        if (stepIndex % 2 === 0)
          hat(at);
        const freq = melody[stepIndex % melody.length];
        tone(freq, "triangle", 0.055, 0.01, 0.08, 0.28, at, filter);
        tone(freq * 2, "sine", 0.018, 0.01, 0.05, 0.22, at, filter);
        clock += stepSec;
        stepIndex += 1;
      }
      timerId();
    };

    const timerId = () => {
      window.clearTimeout(schedule.id);
      schedule.id = window.setTimeout(schedule, 180);
    };

    return {
      playing: () => active,
      start() {
        if (active)
          return;
        if (!ensure())
          return;
        active = true;
        stepIndex = 0;
        clock = ctx.currentTime + 0.05;
        startPads();
        const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
        resume.then(() => {
          if (!active)
            return;
          const now = ctx.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(0.0001, now);
          master.gain.exponentialRampToValueAtTime(0.16, now + 0.35);
          schedule();
        }).catch(() => {
          active = false;
        });
      },
      stop() {
        if (!active)
          return;
        active = false;
        window.clearTimeout(schedule.id);
        if (!ctx || !master)
          return;
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        voices.splice(0).forEach(node => {
          try {
            node.stop(now + 0.2);
          } catch {
            /* already stopped */
          }
        });
      },
    };
  }
})();
