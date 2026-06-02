import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publicClient } from '@/lib/web3';
import { metrics } from '@/lib/diagnostics';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function GET(req: Request) {
    if (!verifyAdminSecret(req)) {
        return handleAdminUnauthorized();
    }

    const results: any = {
        timestamp: new Date().toISOString(),
        database: { status: 'UNKNOWN', latencyMs: null, error: null },
        environment: { status: 'UNKNOWN', missing: [] as string[] },
        rpc: { status: 'UNKNOWN', latencyMs: null, blockNumber: null, error: null },
        chain: { status: 'UNKNOWN', configuredChainId: 84532, actualChainId: null, error: null },
        indexer: {
            mode: metrics.pollingFallbackActive ? 'POLLING_FALLBACK' : 'WEBSOCKET',
            metrics: { ...metrics }
        },
        health: 'UNKNOWN'
    };

    let overallSuccess = true;

    // 1. Database Check
    try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        results.database.status = 'HEALTHY';
        results.database.latencyMs = Date.now() - start;
    } catch (err: any) {
        overallSuccess = false;
        results.database.status = 'UNHEALTHY';
        results.database.error = err.message || String(err);
    }

    // 2. Environment Validation
    const requiredEnv = [
        'DATABASE_URL',
        'NEXT_PUBLIC_PRIVY_APP_ID',
        'PRIVY_APP_SECRET'
    ];
    const optionalEnvWithFallback = [
        'NEXT_PUBLIC_RPC_URL',
        'NEXT_PUBLIC_CONTRACT_ADDRESS',
        'NEXT_PUBLIC_MARKETPLACE_ADDRESS'
    ];

    for (const envVar of requiredEnv) {
        if (!process.env[envVar]) {
            results.environment.missing.push(`${envVar} (REQUIRED)`);
        }
    }
    for (const envVar of optionalEnvWithFallback) {
        if (!process.env[envVar]) {
            results.environment.missing.push(`${envVar} (OPTIONAL - using static deployment fallback)`);
        }
    }

    const hasMissingRequired = requiredEnv.some(envVar => !process.env[envVar]);

    if (!hasMissingRequired) {
        results.environment.status = 'HEALTHY';
    } else {
        overallSuccess = false;
        results.environment.status = 'UNHEALTHY';
    }

    // 3. RPC Network Diagnostic
    try {
        const start = Date.now();
        const blockNumber = await publicClient.getBlockNumber();
        results.rpc.status = 'HEALTHY';
        results.rpc.latencyMs = Date.now() - start;
        results.rpc.blockNumber = blockNumber.toString();
    } catch (err: any) {
        overallSuccess = false;
        results.rpc.status = 'UNHEALTHY';
        results.rpc.error = err.message || String(err);
    }

    // 4. Chain ID Mismatch Check
    try {
        const actualChainId = await publicClient.getChainId();
        results.chain.actualChainId = actualChainId;
        if (actualChainId === 84532) {
            results.chain.status = 'HEALTHY';
        } else {
            overallSuccess = false;
            results.chain.status = 'MISMATCH';
            results.chain.error = `Chain ID mismatch: Configured for Base Sepolia (84532) but RPC reported chain ID ${actualChainId}`;
        }
    } catch (err: any) {
        overallSuccess = false;
        results.chain.status = 'UNHEALTHY';
        results.chain.error = err.message || String(err);
    }

    // 5. Final Health calculation
    results.health = overallSuccess ? 'HEALTHY' : 'UNHEALTHY';

    return NextResponse.json(results, { status: overallSuccess ? 200 : 500 });
}
