import { LoggerNames, getLogger } from './logger';

const log = getLogger(LoggerNames.ProcessorWrapper);

// One timer per request, never an interval: the next tick is only armed once the previous frame
// has been rendered, so slow hardware simply lowers the frame rate instead of queueing up work
// the main thread can never catch up with.
const TICKER_WORKER_SOURCE = 'onmessage = (e) => { setTimeout(() => postMessage(0), e.data); };';

export interface FrameTicker {
  stop(): void;
}

function createAnimationFrameTicker(onTick: () => void): FrameTicker {
  let frameId = requestAnimationFrame(function tick() {
    frameId = requestAnimationFrame(tick);
    onTick();
  });

  return {
    stop() {
      cancelAnimationFrame(frameId);
    },
  };
}

/**
 * Drives the fallback render loop from a worker timer, so it keeps running while the document is
 * hidden.
 *
 * A minimised or occluded window gets no `requestAnimationFrame` callbacks and has its window
 * timers throttled to roughly one per second, which would leave the canvas — and therefore the
 * processed track every remote participant receives — frozen on its last frame. Worker timers are
 * exempt from that throttling, and `canvas.captureStream()` keeps emitting for as long as
 * something paints the canvas.
 *
 * Where a blob worker is not available (for example a Content-Security-Policy without
 * `worker-src blob:`), falls back to `requestAnimationFrame`, which stalls while hidden.
 */
export function createFrameTicker(intervalMs: number, onTick: () => void): FrameTicker {
  let worker: Worker;

  try {
    const workerUrl = URL.createObjectURL(
      new Blob([TICKER_WORKER_SOURCE], { type: 'text/javascript' }),
    );
    worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
  } catch (e) {
    log.warn('Frame ticker worker could not be created, falling back to requestAnimationFrame', e);
    return createAnimationFrameTicker(onTick);
  }

  let fallback: FrameTicker | undefined;

  worker.onmessage = () => {
    try {
      onTick();
    } finally {
      worker.postMessage(intervalMs);
    }
  };

  worker.onerror = (e) => {
    worker.terminate();

    if (!fallback) {
      log.warn('Frame ticker worker failed, falling back to requestAnimationFrame', e);
      fallback = createAnimationFrameTicker(onTick);
    }
  };

  worker.postMessage(intervalMs);

  return {
    stop() {
      worker.terminate();
      fallback?.stop();
    },
  };
}
