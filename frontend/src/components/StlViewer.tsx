"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { useApp } from "./Providers";

/** Beyond this the GPU upload and per-frame cost stop being worth a preview. */
const MAX_VERTICES = 1_500_000;

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
 * Renders the user's own uploaded mesh, auto-framed and slowly turning.
 *
 * The context is built once per file. Theme changes recolour in place; the loop sleeps while the
 * viewer is off-screen or the tab is hidden; under prefers-reduced-motion nothing spins and frames
 * are drawn on demand (initial frame, resize, drag), so the model can still be turned by hand.
 */
export function StlViewer({ buffer, className = "" }: { buffer: ArrayBuffer | null; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { theme, t } = useApp();
  const themeRef = useRef(theme);
  const applyTheme = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !buffer) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // A binary STL states its triangle count up front: refuse oversized files before allocating them.
    if (buffer.byteLength > 84) {
      const tris = new DataView(buffer).getUint32(80, true);
      if (84 + tris * 50 === buffer.byteLength && tris * 3 > MAX_VERTICES) return;
    }

    let geometry: THREE.BufferGeometry;
    try {
      geometry = new STLLoader().parse(buffer);
    } catch {
      return;
    }
    if (geometry.attributes.position.count > MAX_VERTICES) {
      geometry.dispose();
      return;
    }
    geometry.computeVertexNormals();
    geometry.center();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: window.devicePixelRatio < 2, // MSAA adds little at 2x and costs a lot on phones
        alpha: true,
      });
    } catch {
      geometry.dispose();
      return;
    }
    const canvas = renderer.domElement;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "pan-y"; // horizontal drags rotate; vertical swipes still scroll the page past it
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x00e5c0, roughness: 0.42, metalness: 0.35, flatShading: false })
    );
    scene.add(mesh);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 });
    scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 42), edgeMat));

    const ambient = new THREE.AmbientLight(0xffffff);
    scene.add(ambient);
    const l1 = new THREE.DirectionalLight(0xffffff, 2.4); l1.position.set(1, 2, 3); scene.add(l1);
    const l2 = new THREE.DirectionalLight(0x7c5cff, 1.4); l2.position.set(-2, -1, -2); scene.add(l2);

    const sphere = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin((camera.fov * Math.PI) / 360) * 1.25;
    camera.position.set(0, sphere.radius * 0.45, dist);
    camera.lookAt(0, 0, 0);

    // ── Frame control: one place decides whether we loop, draw once, or sleep ──
    let raf = 0;
    let looping = false;
    let inView = false; // IntersectionObserver reports the real state right after observe()
    let lost = false;
    let disposed = false;
    let last = 0;

    const draw = () => renderer.render(scene, camera);
    // One on-demand frame, used whenever the loop is not running (static, paused, resize, drag, recolour).
    const request = () => {
      if (raf || lost || disposed) return;
      raf = requestAnimationFrame(() => { raf = 0; draw(); });
    };

    // Direct manipulation: the mesh stays glued to the pointer while dragging.
    let dragging = false, lastX = 0, lastY = 0, vy = reduce ? 0 : 0.004, vx = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (!dragging) {
        // Release hands velocity to the idle spin, then it decays — no seam. (Per-frame at 60 Hz, scaled by dt.)
        const f = dt * 60;
        vy = 0.004 + (vy - 0.004) * Math.pow(0.94, f);
        vx *= Math.pow(0.9, f);
        mesh.rotation.y += vy * f;
        mesh.rotation.x += vx * f;
      }
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
      edgeMat.color.set(dark ? 0xffffff : 0x10131f);
      ambient.intensity = dark ? 0.7 : 1.1;
      request();
    };
    applyTheme.current = recolour;
    recolour();

    const down = (e: PointerEvent) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      vy = (e.clientX - lastX) * 0.006;
      vx = (e.clientY - lastY) * 0.006;
      mesh.rotation.y += vy; mesh.rotation.x += vx;
      lastX = e.clientX; lastY = e.clientY;
      request(); // no-op while the loop is running; draws the drag when it isn't
    };
    const up = () => {
      dragging = false;
      canvas.style.cursor = "grab";
      if (reduce) { vy = 0; vx = 0; } // no coasting without motion
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      request();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);

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
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      disposeScene(scene); // covers the mesh geometry/material and the edges geometry
      renderer.dispose();
      renderer.forceContextLoss(); // hand the GPU context back now; browsers cap live contexts
      canvas.remove();
    };
  }, [buffer]);

  useEffect(() => {
    themeRef.current = theme;
    applyTheme.current?.();
  }, [theme]);

  return <div ref={host} className={className} role="img" aria-label={t.a11y.viewer} />;
}
