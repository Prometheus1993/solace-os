import { useEffect, useRef, useState } from 'react';
import { loadStoryArt, type StoryArt } from './city-story-art.ts';
import { nextTrain, startTrain, trainAt, trainGap, type TrainSchedule } from './city-story-motion.ts';
import { drawBuildingLayer, drawCityRoofs } from './city-building-render.ts';
import '../../styles/components/city-stories.css';

// Development preview: `?train=fast` in the page URL sends a train every 5 seconds instead of every 3-6 minutes.
const fastTrain = import.meta.env.DEV && new URLSearchParams(window.location.search).get('train') === 'fast';
const trainWait = () => fastTrain ? 5 : trainGap(Math.random);

function drawCityStories(context: CanvasRenderingContext2D, art: StoryArt, train: TrainSchedule, time: number, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  drawBuildingLayer(context, art, 'far', width, height, time);
  drawCityRoofs(context, art, width, height, time, 'far');
  drawBuildingLayer(context, art, 'mid', width, height, time);
  drawCityRoofs(context, art, width, height, time, 'near');
  const flight = trainAt(train, time);
  const trainArt = flight?.view === 'rear' ? art.trainRear : art.train;
  if (flight && trainArt) {
    const rect = trainArt.frames[0], drawWidth = width * (flight.view === 'rear' ? .09 : .44) * flight.scale;
    const drawHeight = drawWidth * rect.height / rect.width;
    context.save(); context.translate(flight.x * width, flight.y * height); context.rotate(flight.angle);
    context.globalAlpha = flight.alpha; context.scale(flight.foreshorten, 1);
    context.drawImage(trainArt.image, rect.x, rect.y, rect.width, rect.height, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
  }
  drawBuildingLayer(context, art, 'front', width, height, time);
}

/** One pausable scene clock drives the train and the building animations. */
export function CityStories({ moving, onError }: { moving: boolean; onError: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const train = useRef<TrainSchedule | null>(null);
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
    let schedule = train.current ??= startTrain(trainWait(), Math.random);
    const draw = () => drawCityStories(context, art, schedule, clock.current, width, height);
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
      schedule = train.current = nextTrain(schedule, clock.current, trainWait);
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
