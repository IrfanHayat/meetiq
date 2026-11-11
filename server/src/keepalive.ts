const TEN_MINUTES = 10 * 60 * 1000;

export function startKeepAlive(): void {
  const base = process.env.RENDER_EXTERNAL_URL?.trim();
  if (!base) return;

  const url = `${base.replace(/\/$/, '')}/health`;
  const ping = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) console.warn(`Keep-alive ping returned ${res.status}`);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Keep-alive ping failed:', message);
      })
      .finally(() => clearTimeout(timer));
  };

  const first = setTimeout(ping, 30_000);
  const interval = setInterval(ping, TEN_MINUTES);
  first.unref?.();
  interval.unref?.();
}
