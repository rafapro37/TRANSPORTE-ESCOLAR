import { NextResponse } from 'next/server';
import { checkDatabase, isDatabaseEnabled } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/**
 * Verificação de saúde não autenticada usada pela hospedagem.
 * Retorna 200 quando o processo está atendendo; o estado do banco é informado à parte.
 */
export async function GET() {
  let database: 'ok' | 'error' | 'disabled' = 'disabled';

  if (isDatabaseEnabled()) {
    try {
      await checkDatabase();
      database = 'ok';
    } catch {
      database = 'error';
    }
  }

  return NextResponse.json(
    {
      status: 'ok',
      database,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
