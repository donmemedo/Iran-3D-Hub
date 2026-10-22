"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useApp } from "./Providers";

/** Free every geometry and material in a scene (no textures are used here). */
function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
  });
}

/**
 * The hero object. A layered polyhedron that breathes, plus a particle field.
 * Pointer input steers it 1:1 through a lightweight smoothing step, so it feels grabbed
 * rather than scripted.
 *
 * The WebGL context is created once. Theme changes only recolour existing materials and lights,
 * the loop sleeps while the hero is off-screen or the tab is hidden, and under
 * prefers-reduced-motion a single static frame is drawn instead of a loop.
 */
export function Hero3D({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { theme } = useApp();
  const themeRef = useRef(theme);
  const applyTheme = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: window.devicePixelRatio < 2, // MSAA adds little at 2x and costs a lot on phones
        alpha: true,
      });
    } catch {
      return; // no WebGL — the page still reads fine without the object
    }
    const canvas = renderer.domElement;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const group = new THREE.Group();
    scene.add(group);

    const coreMat = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.65, flatShading: true });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 1), coreMat);
    group.add(core);

    const wireMat = new THREE.LineBasicMaterial({ color: 0x00e5c0, transparent: true });
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.05, 1)), wireMat));

    const shellMat = new THREE.MeshBasicMaterial({ color: 0x7c5cff, wireframe: true, transparent: true });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.45, 0), shellMat);
    group.add(shell);

    // Particle field: the idle capacity waiting to be used.
    const count = 420;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3.1 + Math.random() * 2.6;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3);
    }
    const dotsMat = new THREE.PointsMaterial({ size: 0.035, transparent: true, opacity: 0.7 });
    const dots = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
      dotsMat
    );
    scene.add(dots);

    const ambient = new THREE.AmbientLight(0xffffff);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0x00e5c0);
    key.position.set(4, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff9d4d);
    rim.position.set(-5, -2, 2);
    scene.add(rim);

    // ── Frame control: one place decides whether we loop, draw once, or sleep ──
    let raf = 0;
    let looping = false;
    let inView = false; // IntersectionObserver reports the real state right after observe()
    let lost = false;
    let disposed = false;
    let last = 0;
    let t = 0;

    const draw = () => renderer.render(scene, camera);
    // One on-demand frame, used whenever the loop is not running (static, paused, resize, recolour).
    const request = () => {
      if (raf || lost || disposed) return;
      raf = requestAnimationFrame(() => { raf = 0; draw(); });
    };

    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0, active: false };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      t += dt;
      if (pointer.active) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height) {
          target.x = ((pointer.y - r.top) / r.height - 0.5) * 0.9;
          target.y = ((pointer.x - r.left) / r.width - 0.5) * 1.5;
        }
      }
      // Chase the pointer from the *current* value — interruptible at any frame, frame-rate independent.
      const k = 1 - Math.pow(1 - 0.075, dt * 60);
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      group.rotation.x = cur.x + Math.sin(t * 0.25) * 0.12;
      group.rotation.y = cur.y + t * 0.16;
      shell.rotation.y = -t * 0.1;
      shell.rotation.z = t * 0.05;
      core.scale.setScalar(1 + Math.sin(t * 0.9) * 0.02);
      dots.rotation.y = t * 0.03;
      draw();
    };

    const sync = () => {
      const run = !reduce && inView && !document.hidden && !lost;
      if (run && !looping) {
        looping = true;
        last = 0; // restart the clock so the pause doesn't turn into a rotation jump
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      } else if (!run && looping) {
        looping = false;
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // ── Theme: recolour in place, never rebuild the context ──
    const recolour = () => {
      const dark = themeRef.current === "dark";
      coreMat.color.set(dark ? 0x0d1220 : 0xf2f4fb);
      wireMat.opacity = dark ? 0.85 : 0.6;
      shellMat.opacity = dark ? 0.3 : 0.22;
      dotsMat.color.set(dark ? 0x9fb0ff : 0x5b62a8);
      ambient.intensity = dark ? 0.45 : 0.9;
      key.intensity = dark ? 3.4 : 2.2;
      rim.intensity = dark ? 2.2 : 1.3;
      request();
    };
    applyTheme.current = recolour;
    recolour();

    if (reduce) group.rotation.set(0.25, 0.6, 0); // a considered still pose instead of motion

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);

    // Pointer steering is scoped to the hero's own box, not the whole window.
    const scope = el.parentElement ?? el;
    const onMove = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; };
    const onLeave = () => { pointer.active = false; target.x = 0; target.y = 0; };
    if (!reduce) {
      scope.addEventListener("pointermove", onMove, { passive: true });
      scope.addEventListener("pointerleave", onLeave);
    }

    const onLost = (e: Event) => { e.preventDefault(); lost = true; sync(); };
    const onRestored = () => { lost = false; sync(); request(); };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      disposed = true;
      looping = false;
      cancelAnimationFrame(raf);
      applyTheme.current = null;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", sync);
      scope.removeEventListener("pointermove", onMove);
      scope.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss(); // hand the GPU context back now; browsers cap live contexts
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    themeRef.current = theme;
    applyTheme.current?.();
  }, [theme]);

  return <div ref={host} className={className} aria-hidden />;
}
