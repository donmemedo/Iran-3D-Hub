"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useApp } from "./Providers";

/**
 * The hero object. A layered polyhedron that breathes, plus a particle field.
 * Pointer input steers it 1:1 through a lightweight spring, so it feels grabbed
 * rather than scripted.
 */
export function Hero3D({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { theme } = useApp();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // no WebGL — the page still reads fine without the object
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const dark = theme === "dark";
    const group = new THREE.Group();
    scene.add(group);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.75, 1),
      new THREE.MeshStandardMaterial({
        color: dark ? 0x0d1220 : 0xf2f4fb,
        roughness: 0.28, metalness: 0.65, flatShading: true,
      })
    );
    group.add(core);

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.05, 1)),
      new THREE.LineBasicMaterial({ color: 0x00e5c0, transparent: true, opacity: dark ? 0.85 : 0.6 })
    );
    group.add(wire);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.45, 0),
      new THREE.MeshBasicMaterial({ color: 0x7c5cff, wireframe: true, transparent: true, opacity: dark ? 0.3 : 0.22 })
    );
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
    const dots = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color: dark ? 0x9fb0ff : 0x5b62a8, size: 0.035, transparent: true, opacity: 0.7 })
    );
    scene.add(dots);

    scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.45 : 0.9));
    const key = new THREE.DirectionalLight(0x00e5c0, dark ? 3.4 : 2.2);
    key.position.set(4, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff9d4d, dark ? 2.2 : 1.3);
    rim.position.set(-5, -2, 2);
    scene.add(rim);

    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = ((e.clientY - r.top) / r.height - 0.5) * 0.9;
      target.y = ((e.clientX - r.left) / r.width - 0.5) * 1.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      // Chase the pointer from the *current* value — interruptible at any frame.
      cur.x += (target.x - cur.x) * 0.075;
      cur.y += (target.y - cur.y) * 0.075;
      group.rotation.x = cur.x + (reduce ? 0 : Math.sin(t * 0.25) * 0.12);
      group.rotation.y = cur.y + (reduce ? 0 : t * 0.16);
      shell.rotation.y = -t * 0.1;
      shell.rotation.z = t * 0.05;
      const breathe = 1 + Math.sin(t * 0.9) * 0.02;
      core.scale.setScalar(reduce ? 1 : breathe);
      dots.rotation.y = t * 0.03;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [theme]);

  return <div ref={host} className={className} aria-hidden />;
}
