"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { useApp } from "./Providers";

/** Renders the user's own uploaded mesh, auto-framed and slowly turning. */
export function StlViewer({ buffer, className = "" }: { buffer: ArrayBuffer | null; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { theme } = useApp();

  useEffect(() => {
    const el = host.current;
    if (!el || !buffer) return;

    let geometry: THREE.BufferGeometry;
    try {
      geometry = new STLLoader().parse(buffer.slice(0));
    } catch {
      return;
    }
    geometry.computeVertexNormals();
    geometry.center();

    const dark = theme === "dark";
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "grab";

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x00e5c0, roughness: 0.42, metalness: 0.35, flatShading: false })
    );
    scene.add(mesh);
    scene.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 42),
      new THREE.LineBasicMaterial({ color: dark ? 0xffffff : 0x10131f, transparent: true, opacity: 0.16 })
    ));

    scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.7 : 1.1));
    const l1 = new THREE.DirectionalLight(0xffffff, 2.4); l1.position.set(1, 2, 3); scene.add(l1);
    const l2 = new THREE.DirectionalLight(0x7c5cff, 1.4); l2.position.set(-2, -1, -2); scene.add(l2);

    const sphere = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin((camera.fov * Math.PI) / 360) * 1.25;
    camera.position.set(0, sphere.radius * 0.45, dist);
    camera.lookAt(0, 0, 0);

    // Direct manipulation: the mesh stays glued to the pointer while dragging.
    let dragging = false, lastX = 0, lastY = 0, vy = 0.004, vx = 0;
    const down = (e: PointerEvent) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      vy = (e.clientX - lastX) * 0.006;
      vx = (e.clientY - lastY) * 0.006;
      mesh.rotation.y += vy; mesh.rotation.x += vx;
      lastX = e.clientX; lastY = e.clientY;
    };
    const up = () => { dragging = false; renderer.domElement.style.cursor = "grab"; };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", up);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!dragging) {
        // Release hands velocity to the idle spin, then it decays — no seam.
        vy = vy * 0.94 + 0.004 * 0.06;
        vx *= 0.9;
        mesh.rotation.y += vy;
        mesh.rotation.x += vx;
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      geometry.dispose(); renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [buffer, theme]);

  return <div ref={host} className={className} />;
}
