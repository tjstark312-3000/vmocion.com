(function initParticleField() {
  const canvas = document.getElementById("particleField");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5,
    active: false
  };
  const state = {
    width: 0,
    height: 0,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    spacing: 34,
    dots: [],
    waves: [],
    rafId: 0,
    lastWaveAt: 0
  };

  function buildDots() {
    state.spacing = window.innerWidth < 768 ? 28 : 34;
    state.dots = [];

    for (let y = state.spacing * 0.5; y < state.height; y += state.spacing) {
      for (let x = state.spacing * 0.5; x < state.width; x += state.spacing) {
        state.dots.push({
          x,
          y,
          phase: Math.random() * Math.PI * 2,
          twinkle: 0.6 + Math.random() * 1.4,
          weight: 0.35 + Math.random() * 0.85
        });
      }
    }
  }

  function resizeCanvas() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = state.width + "px";
    canvas.style.height = state.height + "px";

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    buildDots();
  }

  function addWave(x, y, power) {
    state.waves.push({
      x,
      y,
      radius: 10,
      life: 0,
      power,
      spin: Math.random() > 0.5 ? 1 : -1
    });

    if (state.waves.length > 9) {
      state.waves.shift();
    }
  }

  function handlePointerMove(clientX, clientY, force) {
    pointer.x = clientX;
    pointer.y = clientY;
    pointer.active = true;

    const now = performance.now();
    if (now - state.lastWaveAt > 58) {
      addWave(clientX, clientY, force);
      state.lastWaveAt = now;
    }
  }

  function animate(now) {
    ctx.clearRect(0, 0, state.width, state.height);

    const idleX = state.width * 0.5 + Math.cos(now * 0.00022) * state.width * 0.14;
    const idleY = state.height * 0.46 + Math.sin(now * 0.00017) * state.height * 0.1;
    const anchorX = pointer.active ? pointer.x : idleX;
    const anchorY = pointer.active ? pointer.y : idleY;

    state.waves = state.waves.filter((wave) => wave.life < 1.18);

    for (const wave of state.waves) {
      wave.life += 0.018;
      wave.radius += 6.4 + wave.power * 2.2;
    }

    for (const dot of state.dots) {
      const dx = anchorX - dot.x;
      const dy = anchorY - dot.y;
      const distance = Math.hypot(dx, dy);
      const cursorInfluence = Math.max(0, 1 - distance / 210);

      let offsetX = 0;
      let offsetY = 0;
      let glow = cursorInfluence * 0.85;

      if (cursorInfluence > 0) {
        const angle = Math.atan2(dy, dx) + Math.PI * 0.5;
        offsetX += Math.cos(angle) * cursorInfluence * 11 * dot.weight;
        offsetY += Math.sin(angle) * cursorInfluence * 11 * dot.weight;
      }

      for (const wave of state.waves) {
        const wx = dot.x - wave.x;
        const wy = dot.y - wave.y;
        const waveDistance = Math.hypot(wx, wy);
        const band = Math.abs(waveDistance - wave.radius);

        if (band < 50) {
          const pulse = (1 - band / 50) * (1 - wave.life / 1.18) * wave.power;
          const nx = waveDistance ? wx / waveDistance : 0;
          const ny = waveDistance ? wy / waveDistance : 0;
          const tangentX = -ny * wave.spin;
          const tangentY = nx * wave.spin;

          glow += pulse * 1.4;
          offsetX += nx * pulse * 16 + tangentX * pulse * 5;
          offsetY += ny * pulse * 16 + tangentY * pulse * 5;
        }
      }

      const driftX = Math.sin(now * 0.0012 * dot.twinkle + dot.phase) * 0.9;
      const driftY = Math.cos(now * 0.001 * dot.twinkle + dot.phase) * 0.9;
      const drawX = dot.x + offsetX + driftX;
      const drawY = dot.y + offsetY + driftY;
      const radius = 0.7 + dot.weight * 0.45 + glow * 2.2;
      const alpha = Math.min(0.95, 0.12 + glow * 0.48);

      ctx.beginPath();
      ctx.fillStyle = "rgba(133, 82, 255, " + alpha + ")";
      ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    state.rafId = requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("pointermove", (event) => handlePointerMove(event.clientX, event.clientY, 1));
  window.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
  window.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      handlePointerMove(touch.clientX, touch.clientY, 1.1);
    },
    { passive: true }
  );
  window.addEventListener("touchend", () => {
    pointer.active = false;
  });

  resizeCanvas();

  if (!reduceMotion) {
    state.rafId = requestAnimationFrame(animate);
    return;
  }

  for (const dot of state.dots) {
    ctx.beginPath();
    ctx.fillStyle = "rgba(133, 82, 255, 0.18)";
    ctx.arc(dot.x, dot.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
})();
