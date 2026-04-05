import http from 'node:http';

type ProbeFn = () => Promise<void>;

type HealthServerOptions = {
  port: number;
  probeIntervalMs: number;
  probeTimeoutMs: number;
  startupGraceMs: number;
  eventLoopStaleMs: number;
  probeStaleMs: number;
  probeFn: ProbeFn;
};

const createTimeoutPromise = (timeoutMs: number): Promise<never> =>
  new Promise((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Health probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref();
  });

export const startHealthServer = (options: HealthServerOptions) => {
  const startedAt = Date.now();
  let lastHeartbeatAt = startedAt;
  let lastProbeSuccessAt = startedAt;
  let lastProbeError: string | undefined;
  let probeInFlight = false;

  const heartbeatTimer = setInterval(() => {
    lastHeartbeatAt = Date.now();
  }, 1000);
  heartbeatTimer.unref();

  const runProbe = async () => {
    if (probeInFlight) {
      return;
    }

    probeInFlight = true;
    try {
      await Promise.race([options.probeFn(), createTimeoutPromise(options.probeTimeoutMs)]);
      lastProbeSuccessAt = Date.now();
      lastProbeError = undefined;
    } catch (error) {
      lastProbeError = error instanceof Error ? error.message : String(error);
      console.warn(`[health] Probe failed: ${lastProbeError}`);
    } finally {
      probeInFlight = false;
    }
  };

  const probeTimer = setInterval(() => {
    void runProbe();
  }, options.probeIntervalMs);
  probeTimer.unref();
  void runProbe();

  const server = http.createServer((request, response) => {
    if (request.url !== '/healthz') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'not_found' }));
      return;
    }

    const now = Date.now();
    const withinStartupGrace = now - startedAt <= options.startupGraceMs;
    const eventLoopHealthy = now - lastHeartbeatAt <= options.eventLoopStaleMs;
    const probeHealthy = withinStartupGrace || now - lastProbeSuccessAt <= options.probeStaleMs;
    const ok = eventLoopHealthy && probeHealthy;

    response.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      ok,
      uptimeMs: now - startedAt,
      eventLoopHealthy,
      probeHealthy,
      lastHeartbeatAgeMs: now - lastHeartbeatAt,
      lastProbeAgeMs: now - lastProbeSuccessAt,
      lastProbeError,
    }));
  });

  server.listen(options.port, '0.0.0.0', () => {
    console.log(`[health] Listening on port ${options.port}`);
  });

  return server;
};
