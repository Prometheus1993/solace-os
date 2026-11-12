import { useEffect, useRef } from 'react';
import type { WeatherMood } from '@solace/core';
import { spawnParticles, stepParticles, type Particle } from './desk-weather.ts';

/** Rain streaks and snow flakes, one canvas over the window glass. Clear and fog draw nothing here (fog is CSS haze). */
function drawWeather(context: CanvasRenderingContext2D, mood: WeatherMood, particles: Particle[], width: number, height: number) {
  context.clearRect(0, 0, width, height);
  if (mood === 'rain') {
    context.strokeStyle = '#b5def5'; context.lineWidth = 1.2; context.globalAlpha = .6; context.beginPath();
    for (const drop of particles) {
      const x = drop.x * width, y = drop.y * height, length = (6 + drop.size * 10) * (height / 834);
      context.moveTo(x, y); context.lineTo(x - length * .12, y + length);
    }
    context.stroke();
  } else if (mood === 'snow') {
    context.fillStyle = '#f2f7ff'; context.globalAlpha = .7;
    for (const flake of particles) {
      const radius = (.8 + flake.size * 1.8) * (height / 834);
      context.beginPath(); context.arc(flake.x * width + Math.sin(flake.sway) * 12 * (height / 834), flake.y * height, radius, 0, Math.PI * 2); context.fill();
    }
  }
  context.globalAlpha = 1;
}

/**
 * Falls on its own pausable clock, capped at 30 fps. Not `moving` (hidden tab, editor, MOTION OFF, reduced motion) it stays
 * as one still frame with a quarter of the particles. It never takes pointer events and the glass clips it.
 */
export function WeatherFx({ mood, moving, still }: { mood: WeatherMood; moving: boolean; still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    let request = 0, lastDraw = 0, width = 0, height = 0;
    particles.current = spawnParticles(mood, still, Math.random);
    const draw = () => drawWeather(context, mood, particles.current, width, height);
    const resize = () => {
      width = element.clientWidth; height = element.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(width * ratio)); element.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const tick = (now: number) => {
      if (now - lastDraw >= 1000 / 30) {
        particles.current = stepParticles(particles.current, lastDraw ? Math.min((now - lastDraw) / 1000, .1) : 0, Math.random);
        draw(); lastDraw = now;
      }
      request = requestAnimationFrame(tick);
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(element);
    if (moving && particles.current.length) request = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(request); observer.disconnect(); };
  }, [mood, moving, still]);
  return <canvas ref={canvas} className="desk-weather-fx" aria-hidden="true" />;
}
