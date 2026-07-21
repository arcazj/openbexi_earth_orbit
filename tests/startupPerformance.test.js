import assert from 'assert';
import {
  createRoundRobinFrameProcessor,
  createStartupPerformanceTracker,
  processInChunks,
  scheduleDeferredWork
} from '../js/startupPerformance.js';

async function run() {
  let now = 100;
  const marks = [];
  const performanceObj = {
    now: () => {
      now += 5;
      return now;
    },
    mark: (name) => marks.push(name),
    measure: () => {}
  };
  const documentListeners = {};
  const windowListeners = {};
  const windowObj = {
    addEventListener: (type, cb) => {
      windowListeners[type] = cb;
    }
  };
  const documentObj = {
    addEventListener: (type, cb) => {
      documentListeners[type] = cb;
    }
  };

  const tracker = createStartupPerformanceTracker({
    label: 'test-startup',
    performanceObj,
    windowObj,
    documentObj
  });

  assert.strictEqual(windowObj.openbexiStartupPerformance, tracker, 'tracker is exposed on the browser window');
  tracker.markOnce('scene-ready');
  tracker.markOnce('scene-ready');
  documentListeners.DOMContentLoaded();
  windowListeners.load();

  const summary = tracker.summary();
  assert.deepStrictEqual(
    summary.map(entry => entry.name),
    ['scene-ready', 'dom-content-loaded', 'window-load'],
    'markOnce and browser lifecycle marks are recorded once'
  );
  assert(summary.every(entry => entry.durationMs >= 0), 'all timing entries have non-negative durations');
  assert(marks.includes('test-startup:scene-ready'), 'Performance.mark receives namespaced marks');

  let idleCalled = false;
  let cancelled = false;
  const cancelIdle = scheduleDeferredWork(
    () => {
      idleCalled = true;
    },
    {
      timeout: 123,
      windowObj: {
        requestIdleCallback: (cb, opts) => {
          assert.strictEqual(opts.timeout, 123);
          cb({ didTimeout: false, timeRemaining: () => 10 });
          return 42;
        },
        cancelIdleCallback: (id) => {
          cancelled = id === 42;
        }
      }
    }
  );
  cancelIdle();
  assert(idleCalled, 'requestIdleCallback path schedules deferred work');
  assert(cancelled, 'deferred idle work can be cancelled');

  const processed = [];
  const chunkProgress = [];
  await processInChunks(
    [1, 2, 3, 4, 5],
    (item) => {
      processed.push(item);
    },
    {
      chunkSize: 2,
      afterChunk: ({ processed: count, total }) => chunkProgress.push(`${count}/${total}`),
      schedulerOptions: {
        windowObj: null,
        setTimeoutFn: (cb) => {
          cb();
          return 1;
        },
        clearTimeoutFn: () => {}
      }
    }
  );

  assert.deepStrictEqual(processed, [1, 2, 3, 4, 5], 'all items are processed in order');
  assert.deepStrictEqual(chunkProgress, ['2/5', '4/5', '5/5'], 'chunk progress is reported after each batch');

  let frameNow = 0;
  const frameVisits = [];
  const frameProcessor = createRoundRobinFrameProcessor({
    budgetMs: 2,
    maxItemsPerRun: 4,
    performanceObj: { now: () => frameNow }
  });
  const processFrameItem = item => {
    frameVisits.push(item);
    frameNow += 1;
  };
  assert.deepStrictEqual(
    frameProcessor.run(['a', 'b', 'c', 'd'], processFrameItem),
    { processed: 2, next_index: 2 },
    'frame work stops at its time budget'
  );
  assert.deepStrictEqual(
    frameProcessor.run(['a', 'b', 'c', 'd'], processFrameItem),
    { processed: 2, next_index: 0 },
    'the next frame resumes at the saved cursor'
  );
  assert.deepStrictEqual(frameVisits, ['a', 'b', 'c', 'd'], 'round-robin work does not starve later items');
  frameProcessor.reset();
  assert.strictEqual(frameProcessor.nextIndex(), 0);

  console.log('startupPerformance tests passed');
}

await run();
