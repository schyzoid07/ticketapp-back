import { supabase } from './supabase';
import { PLAN_CONFIG, type PlanType } from './env';

export const PLAN_LIMITS = PLAN_CONFIG;

export async function getCompanyPlan(companyId: string): Promise<PlanType> {
  const { data } = await supabase
    .from('companies')
    .select('plan')
    .eq('id', companyId)
    .single();
  const plan = (data?.plan as string) || 'basic';
  if (plan !== 'basic' && plan !== 'complete') return 'basic';
  return plan;
}

export async function getCompanyMonthlyTokenUsage(companyId: string, plan: PlanType): Promise<{ used: number; limit: number }> {
  const limit = PLAN_LIMITS[plan].monthlyTokenLimit;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data } = await supabase
    .from('tickets')
    .select('ai_token_usage')
    .eq('company_id', companyId)
    .gte('created_at', monthStart)
    .not('ai_token_usage', 'is', null);

  if (!data || data.length === 0) {
    return { used: 0, limit };
  }

  const used = data.reduce((sum, t) => {
    const u = t.ai_token_usage as { total?: { totalTokens?: number } } | null;
    return sum + (u?.total?.totalTokens ?? 0);
  }, 0);

  return { used, limit };
}
