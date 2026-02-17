'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function TechBloomBanner() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const currentMount = mountRef.current;

    if (!currentMount) {
      return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('hsl(30, 25%, 96%)');
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 20;
    camera.position.y = 3;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // TechBloom Colors
    const primaryColor = new THREE.Color('hsl(4, 69%, 62%)');
    const secondaryColor = new THREE.Color('hsl(4, 69%, 50%)');
    const accentColor = new THREE.Color('hsl(30, 45%, 75%)');

    // ============================================
    // 1. FLOATING PARTICLES WITH CONNECTIONS
    // ============================================
    const particleCount = 150;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      particlePositions[i3] = (Math.random() - 0.5) * 40;
      particlePositions[i3 + 1] = (Math.random() - 0.5) * 30;
      particlePositions[i3 + 2] = (Math.random() - 0.5) * 30;

      particleVelocities.push({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02,
      });
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
      color: primaryColor,
      size: 0.3,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
    particlesRef.current = particleSystem;

    // Connection lines between nearby particles
    const maxDistance = 8;
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.15,
    });
    const lineSystem = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lineSystem);

    // ============================================
    // 2. FLOATING SPHERES
    // ============================================
    const spheresGroup = new THREE.Group();
    const sphereCount = 8;

    for (let i = 0; i < sphereCount; i++) {
      const sphereGeometry = new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 32, 32);
      const sphereMaterial = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? primaryColor : i % 3 === 1 ? secondaryColor : accentColor,
        transparent: true,
        opacity: 0.6,
        wireframe: false,
      });

      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      const angle = (i / sphereCount) * Math.PI * 2;
      const radius = 10 + Math.random() * 5;

      sphere.position.set(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 8,
        Math.sin(angle) * radius - 5
      );

      sphere.userData = {
        angle: angle,
        radius: radius,
        speed: 0.1 + Math.random() * 0.2,
        floatSpeed: 0.5 + Math.random() * 0.5,
        floatOffset: Math.random() * Math.PI * 2,
      };

      spheresGroup.add(sphere);
    }

    scene.add(spheresGroup);

    // ============================================
    // MOUSE INTERACTION
    // ============================================
    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // ============================================
    // ANIMATION LOOP
    // ============================================
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Animate particles with boundaries
      const positions = particleGeometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const velocity = particleVelocities[i];

        positions[i3] += velocity.x;
        positions[i3 + 1] += velocity.y;
        positions[i3 + 2] += velocity.z;

        // Boundary check and reverse direction
        if (Math.abs(positions[i3]) > 20) {
          velocity.x *= -1;
        }
        if (Math.abs(positions[i3 + 1]) > 15) {
          velocity.y *= -1;
        }
        if (Math.abs(positions[i3 + 2]) > 15) {
          velocity.z *= -1;
        }
      }
      particleGeometry.attributes.position.needsUpdate = true;

      // Update particle connections
      const linePositions: number[] = [];
      for (let i = 0; i < particleCount; i++) {
        for (let j = i + 1; j < particleCount; j++) {
          const dx = positions[i * 3] - positions[j * 3];
          const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
          const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (distance < maxDistance) {
            linePositions.push(
              positions[i * 3],
              positions[i * 3 + 1],
              positions[i * 3 + 2],
              positions[j * 3],
              positions[j * 3 + 1],
              positions[j * 3 + 2]
            );
          }
        }
      }
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

      // Animate floating spheres
      spheresGroup.children.forEach(sphere => {
        const mesh = sphere as THREE.Mesh;
        const { angle, radius, speed, floatSpeed, floatOffset } = mesh.userData as {
          angle: number;
          radius: number;
          speed: number;
          floatSpeed: number;
          floatOffset: number;
        };
        const newAngle = elapsedTime * speed + angle;

        mesh.position.x = Math.cos(newAngle) * radius;
        mesh.position.z = Math.sin(newAngle) * radius - 5;
        mesh.position.y += Math.sin(elapsedTime * floatSpeed + floatOffset) * 0.01;

        // Gentle rotation
        mesh.rotation.x += 0.01;
        mesh.rotation.y += 0.015;
      });

      // Camera follows mouse smoothly
      camera.position.x += (mouseRef.current.x * 2 - camera.position.x) * 0.03;
      camera.position.y += (mouseRef.current.y + 3 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    // Handle resize
    const handleResize = () => {
      if (!currentMount) {
        return;
      }

      camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener('resize', handleResize);

    animate();

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);

      if (currentMount && renderer.domElement) {
        currentMount.removeChild(renderer.domElement);
      }

      renderer.dispose();

      // Dispose all geometries and materials
      particleGeometry.dispose();
      particleMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      spheresGroup.children.forEach(child => {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
    };
  }, []);

  return (
    <section className='relative w-full h-20 overflow-hidden bg-[hsl(30,25%,96%)] border-y border-[hsl(4,69%,62%)]/20'>
      {/* Three.js Canvas */}
      <div ref={mountRef} className='absolute inset-0' />

      {/* Content Overlay */}
      <div className='relative z-10 h-full flex items-center justify-center'>
        <div className='text-center'>
          <p
            className='text-lg md:text-xl tracking-wide'
            style={{
              color: 'hsl(4, 69%, 62%)',
              fontFamily: '"Questrial", sans-serif',
            }}
          >
            A product by
            <a href='https://www.techbloom.com.br' target='_blank' rel='noopener noreferrer'>
              <span className='font-semibold'> TechBloom</span>
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
