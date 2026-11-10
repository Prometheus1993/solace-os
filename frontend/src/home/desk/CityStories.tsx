import { useEffect, useRef, useState } from 'react';
import { drawActor, loadStoryArt, type StoryArt } from './city-story-art.ts';
import {
  activeShots,
  actorPosition,
  chaseAt,
  chaseScale,
  CHASE_DURATION,
  firingPose,
  projectChasePoint,
  sandevistanIntensity,
  trainAt,
  type Actor
} from './city-story-motion.ts';
import { drawBuildingLayer, drawCityRoofs } from './city-building-render.ts';
import '../../styles/components/city-stories.css';

function drawEncounter(
  context: CanvasRenderingContext2D,
  art: StoryArt,
  time: number,
  width: number,
  height: number,
  chase: NonNullable<ReturnType<typeof chaseAt>>
) {
  if (!art.run) return;
  const scale = chaseScale(chase.depth);
  const opacity = Math.min(1, chase.progress / .04, (1 - chase.progress) / .04) * (chase.depth === 'far' ? .78 : 1);
  context.save(); context.globalAlpha = opacity;
  const entrance = projectChasePoint({ x: 0, y: 0 }, chase.depth), exit = projectChasePoint({ x: 1, y: 1 }, chase.depth);
  context.beginPath(); context.rect(entrance.x * width, 0, (exit.x - entrance.x) * width, height); context.clip();
  for (const actor of ['david', 'smasher'] as Actor[]) {
    const position = actorPosition(chase.pattern, actor, chase.progress);
    const point = projectChasePoint(position, chase.depth);
    const firing = position.airborne ? null : firingPose(chase.pattern, actor, chase.progress);
    const burst = actor === 'david' ? sandevistanIntensity(chase.progress) : 0;
    const frame = position.airborne ? 3 : Math.floor(time * (burst > 0 ? 22 : 10)) % 8;
    const spriteHeight = height * (actor === 'david' ? .13 : .17) * scale;
    if (burst > 0 && !firing) {
      for (let i = 6; i >= 1; i--) {
        const age = i * .004, previous = actorPosition(chase.pattern, actor, Math.max(0, chase.progress - age));
        const echo = projectChasePoint(previous, chase.depth);
        context.save(); context.globalAlpha = opacity * burst * (.5 - i * .055);
        context.filter = i % 2 ? 'brightness(1.5) sepia(1) saturate(6) hue-rotate(100deg)' : 'brightness(1.6) sepia(1) saturate(6) hue-rotate(140deg)';
        drawActor(
          context,
          art.run,
          actor,
          previous.airborne ? 3 : Math.floor((time - age * CHASE_DURATION) * 22) % 8,
          echo.x * width,
          echo.y * height,
          spriteHeight,
          previous.facing
        );
        context.restore();
      }
    }
    if (!position.airborne) {
      context.fillStyle = '#060b16aa';
      context.fillRect(point.x * width - spriteHeight * .14, point.y * height - scale, spriteHeight * .28, 2 * scale);
    }
    context.save();
    if (burst > 0) { context.shadowColor = '#75ffe2'; context.shadowBlur = 5 * scale * burst; }
    drawActor(
      context,
      firing && art.fire ? art.fire : art.run,
      actor,
      firing && art.fire ? firing.frame : frame,
      point.x * width,
      point.y * height,
      spriteHeight,
      firing?.facing ?? position.facing
    );
    context.restore();
  }
  for (const shot of activeShots(chase.pattern, chase.progress)) {
    const point = projectChasePoint(shot.point, chase.depth), tail = projectChasePoint(shot.tail, chase.depth);
    const origin = projectChasePoint(shot.origin, chase.depth), target = projectChasePoint(shot.target, chase.depth);
    const color = shot.from === 'david' ? '#9bf7c9' : '#ffc381';
    context.strokeStyle = color; context.fillStyle = color; context.lineWidth = Math.max(.75, 1.5 * scale);
    context.beginPath(); context.moveTo(tail.x * width, tail.y * height); context.lineTo(point.x * width, point.y * height); context.stroke();
    if (shot.age < .07) {
      const x = origin.x * width, y = origin.y * height;
      context.fillRect(x - 3 * scale, y - scale, 6 * scale, 2 * scale); context.fillRect(x - scale, y - 3 * scale, 2 * scale, 6 * scale);
    }
    if (shot.flight > .85) {
      const x = target.x * width, y = target.y * height;
      context.globalAlpha = opacity * (1 - shot.flight) * 5;
      context.fillRect(x - 2 * scale, y - 2 * scale, 2 * scale, 2 * scale); context.fillRect(x + 2 * scale, y + scale, 2 * scale, 2 * scale);
      context.globalAlpha = opacity;
    }
  }
  context.restore();
}

function drawCityStories(context: CanvasRenderingContext2D, art: StoryArt, time: number, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  const chase = chaseAt(time);
  drawBuildingLayer(context, art, 'far', width, height, time);
  drawCityRoofs(context, art, width, height, time, 'far');
  if (chase?.depth === 'far') drawEncounter(context, art, time, width, height, chase);
  drawBuildingLayer(context, art, 'mid', width, height, time);
  drawCityRoofs(context, art, width, height, time, 'near');
  const flight = trainAt(time);
  const trainArt = flight?.view === 'rear' ? art.trainRear : art.train;
  if (flight && trainArt) {
    const rect = trainArt.frames[0], drawWidth = width * (flight.view === 'rear' ? .09 : .44) * flight.scale;
    const drawHeight = drawWidth * rect.height / rect.width;
    context.save(); context.translate(flight.x * width, flight.y * height); context.rotate(flight.angle);
    context.globalAlpha = flight.alpha; context.scale(flight.foreshorten, 1);
    context.drawImage(trainArt.image, rect.x, rect.y, rect.width, rect.height, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
  }
  if (chase?.depth === 'near') drawEncounter(context, art, time, width, height, chase);
  drawBuildingLayer(context, art, 'front', width, height, time);
}

/** One pausable scene clock keeps independent routes, aiming and projectiles synchronized. */
export function CityStories({ moving, onError }: { moving: boolean; onError: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const error = useRef(onError); error.current = onError;
  const [art, setArt] = useState<StoryArt | null>(null);
  useEffect(() => {
    let disposed = false;
    void loadStoryArt().then(value => { if (!disposed) { setArt(value); if (value.missing) error.current(); } });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context || !art) return;
    let request = 0, previous = 0, lastDraw = 0, width = 0, height = 0;
    const draw = () => drawCityStories(context, art, clock.current, width, height);
    const resize = () => {
      width = element.clientWidth; height = element.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(width * ratio)); element.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.imageSmoothingEnabled = false;
      draw();
    };
    const tick = (now: number) => {
      if (previous) clock.current += Math.min((now - previous) / 1000, .1);
      previous = now;
      if (now - lastDraw >= 1000 / 30) { draw(); lastDraw = now; }
      request = requestAnimationFrame(tick);
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(element);
    if (moving) request = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(request); observer.disconnect(); };
  }, [art, moving]);
  return <canvas ref={canvas} className="desk-city-stories" aria-hidden="true" />;
}
