interface RateEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateEntry>();

const WINDOW_MS = 60 * 1000;

const PLAN_LIMITS = {
  basic: 10,
  complete: 60,
};

export function getPlanRateLimit(plan: string): number {
  return PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.basic;
}

export function checkCompanyRateLimit(companyId: string, maxRequests: number): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const entry = store.get(companyId);

  if (!entry || now > entry.resetAt) {
    store.set(companyId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: maxRequests - 1, resetInSeconds: 60 };
  }

  if (entry.count >= maxRequests) {
    const resetInSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetInSeconds: Math.ceil((entry.resetAt - now) / 1000) };
}
