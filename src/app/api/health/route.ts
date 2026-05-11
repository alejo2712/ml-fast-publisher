/**
 * GET /api/health
 *
 * Public health check endpoint — no auth required.
 * Returns app status, subsystem diagnostics, and environment warnings.
 *
 * Safe for monitoring tools, uptime checkers, and /settings/system UI.
 * Never exposes secrets, tokens, or raw env values.
 */
import { NextResponse } from 'next/server';
import { runDiagnostics } from '@/lib/diagnostics';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const diagnostics = await runDiagnostics();
    logger.health.check(diagnostics.status);

    // Collect all warnings for top-level summary
    const allWarnings = [
      ...diagnostics.env.checks.filter((c) => c.status === 'warning').map((c) => c.detail),
      ...diagnostics.mercadolibre.checks.filter((c) => c.status === 'warning').map((c) => c.detail),
      ...diagnostics.imageHosting.checks.filter((c) => c.status === 'warning').map((c) => c.detail),
      ...diagnostics.uploads.checks.filter((c) => c.status === 'warning').map((c) => c.detail),
    ];

    const httpStatus = diagnostics.database.status === 'error' ? 503 : 200;

    return NextResponse.json(
      {
        status: diagnostics.status,
        timestamp: diagnostics.timestamp,
        version: diagnostics.version,
        environment: diagnostics.environment,
        subsystems: {
          env: { status: diagnostics.env.status },
          database: { status: diagnostics.database.status },
          auth: { status: diagnostics.auth.status },
          mercadolibre: { status: diagnostics.mercadolibre.status },
          imageHosting: { status: diagnostics.imageHosting.status },
          uploads: { status: diagnostics.uploads.status },
        },
        warnings: allWarnings,
        // Full diagnostics only for explicit detail request or system page
        details: diagnostics,
      },
      { status: httpStatus }
    );
  } catch (err) {
    logger.error('health', 'Health check failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString(), error: 'Health check failed' },
      { status: 503 }
    );
  }
}
