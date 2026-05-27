import { type Request, type Response, type NextFunction } from 'express';
import { supabase } from '../services/supabase';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    company_id?: string;
    role?: string;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return;
  }

  req.user = {
    id: data.user.id,
    email: data.user.email,
    company_id: data.user.user_metadata?.company_id as string,
    role: data.user.user_metadata?.role as string,
  };

  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      res.status(403).json({ error: `Se requiere rol: ${roles.join(' o ')}` });
      return;
    }
    next();
  };
}
