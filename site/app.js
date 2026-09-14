(() => {
  const island = document.getElementById("island");
  const hint = document.getElementById("island-hint");
  const desktop = island?.closest(".desktop");
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
  const mediaStates = new Set(["media", "expanded"]);

  let i = 0;
  let timer = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const bed = createDemoBed();

  const hintFor = (state, playing) => {
    if (playing && mediaStates.has(state.id))
      return ` ${state.label}. Quiet demo loop.`;
    if (state.id === "media")
      return ` ${state.label}. Click to expand (plays a demo loop).`;
    return ` ${state.label}. Click to morph.`;
  };

  const show = (next, {fromUser = false} = {}) => {
    i = (next + states.length) % states.length;
    const state = states[i];
    island.dataset.state = state.id;
    if (desktop)
      desktop.dataset.island = state.id;
    island.setAttribute("aria-label", `Eave preview: ${state.label}. Click to morph.`);

    if (mediaStates.has(state.id)) {
      if (fromUser)
        bed.start();
    } else {
      bed.stop();
    }

    island.dataset.audio = bed.playing() ? "on" : "off";
    if (hint)
      hint.lastChild.textContent = hintFor(state, bed.playing());
  };

  const arm = () => {
    if (reduce)
      return;
    window.clearInterval(timer);
    timer = window.setInterval(() => show(i + 1), 4200);
  };

  island.addEventListener("click", () => {
    show(i + 1, {fromUser: true});
    arm();
  });

  island.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show(i + 1, {fromUser: true});
      arm();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden)
      bed.stop();
    island.dataset.audio = bed.playing() ? "on" : "off";
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

  function createDemoBed() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let master = null;
    let filter = null;
    let active = false;
    let step = 0;
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
        if (step % 8 === 0)
          kick(at);
        if (step % 2 === 0)
          hat(at);
        const freq = melody[step % melody.length];
        tone(freq, "triangle", 0.055, 0.01, 0.08, 0.28, at, filter);
        tone(freq * 2, "sine", 0.018, 0.01, 0.05, 0.22, at, filter);
        clock += stepSec;
        step += 1;
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
        step = 0;
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
