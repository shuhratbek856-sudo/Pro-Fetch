import { boundedEnv } from './bounded-env.js';

interface Waiter {
  resolve: (release: () => void) => void;
}
class Semaphore {
  private active = 0;
  private readonly queue: Waiter[] = [];
  constructor(private readonly capacity: number) {}
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.active < this.capacity) {
        this.active++;
        resolve(this.releaseFactory());
      } else this.queue.push({ resolve });
    });
  }
  private releaseFactory(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.queue.shift();
      if (next) next.resolve(this.releaseFactory());
      else this.active = Math.max(0, this.active - 1);
    };
  }
}

const totalGate = new Semaphore(boundedEnv('PRO_FETCH_MAX_NETWORK_CONCURRENCY', 64, 1, 4096));
const hostGates = new Map<string, Semaphore>();
const activeHosts = new Map<string, number>();
function hostGate(host: string): Semaphore {
  let gate = hostGates.get(host);
  if (!gate) {
    gate = new Semaphore(boundedEnv('PRO_FETCH_MAX_PER_HOST_CONCURRENCY', 8, 1, 512));
    hostGates.set(host, gate);
  }
  return gate;
}

/** Applies a process-wide and per-host limit to every network hop, including redirects. */
export async function withNetworkConcurrency<T>(hostname: string, operation: () => Promise<T>): Promise<T> {
  const host = hostname.toLowerCase();
  const releaseHost = await hostGate(host).acquire();
  let releaseTotal: (() => void) | undefined;
  try {
    releaseTotal = await totalGate.acquire();
    activeHosts.set(host, (activeHosts.get(host) ?? 0) + 1);
    return await operation();
  } finally {
    const count = Math.max(0, (activeHosts.get(host) ?? 1) - 1);
    if (count) activeHosts.set(host, count);
    else activeHosts.delete(host);
    releaseTotal?.();
    releaseHost();
  }
}

export function networkConcurrencyStats(): { activeTotal: number; activeByHost: Record<string, number> } {
  return {
    activeTotal: Object.values(Object.fromEntries(activeHosts)).reduce((sum, count) => sum + count, 0),
    activeByHost: Object.fromEntries(activeHosts),
  };
}
