import { Logger } from '@nestjs/common';

import type { ArmClient, AzureMaintenanceClients, BlobLease } from './azure';
import { createAzureMaintenanceClientsFromEnv } from './azure';

export const FIREWALL_STATE_BLOB = 'firewall/state.json';
export const FIREWALL_LEASE_BLOB = 'firewall/lease';
export const CONTAINER_APP_API_VERSION = '2025-01-01';
export const CONTAINER_APP_JOB_API_VERSION = '2026-07-01';
export const POSTGRES_FIREWALL_API_VERSION = '2022-12-01';
export const DEFAULT_AUTOMATIC_RULE_PREFIX = 'ciri-auto-';
export const FIREWALL_RETIREMENT_GRACE_MS = 60 * 60 * 1000;
export const FIREWALL_OPERATION_TIMEOUT_MS = 45_000;
export const FIREWALL_LEASE_SECONDS = 60;

const MAX_SOURCE_IPS = 100;
const MAX_TOTAL_IPS = 300;
const MAX_FAILURES_TO_LOG = 20;
const MAX_FAILURE_TEXT_LENGTH = 160;
const MAX_CLEANUP_TIMEOUT_MS = 5_000;

interface ArmResource {
    properties?: {
        outboundIpAddresses?: unknown;
    };
}

interface FirewallRuleList {
    value?: unknown;
}

export interface FirewallRuleState {
    name: string;
    firstSeenAt: string;
    retiredAt?: string;
}

export interface FirewallState {
    version: 1;
    rules: Record<string, FirewallRuleState>;
}

export interface FirewallReconciliationOptions {
    sourceResourceIds: string[];
    postgresServerResourceId: string;
    clients: AzureMaintenanceClients;
    now?: () => Date;
    automaticRulePrefix?: string;
    operationTimeoutMs?: number;
}

export interface FirewallReconciliationResult {
    discoveredIps: string[];
    addedRules: string[];
    retiredRules: string[];
    failedDeletions: string[];
}

interface NormalizedRule {
    name: string;
    ip: string;
}

const asError = (error: unknown, message: string): Error =>
    error instanceof Error ? error : new Error(message, { cause: error });

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function sourceApiVersion(resourceId: string): string {
    const normalized = resourceId.toLowerCase();
    if (normalized.includes('/providers/microsoft.app/containerapps/')) {
        return CONTAINER_APP_API_VERSION;
    }
    if (normalized.includes('/providers/microsoft.app/jobs/')) {
        return CONTAINER_APP_JOB_API_VERSION;
    }
    throw new Error(
        'Firewall source must be an Azure Container App or Container Apps Job: ' +
            resourceId,
    );
}

function ruleId(serverId: string, name: string): string {
    return serverId.replace(/\/+$/, '') + '/firewallRules/' + name;
}

function parseIpv4(value: string): string {
    const trimmed = value.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
        throw new Error('Invalid outbound IPv4 address: ' + value);
    }
    const octets = parts.map(Number);
    if (octets.some((octet) => octet > 255)) {
        throw new Error('Invalid outbound IPv4 address: ' + value);
    }

    const [first, second, third] = octets;
    const privateAddress =
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168);
    const reservedAddress =
        first === 0 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 192 && second === 0 && third === 0) ||
        (first === 192 && second === 0 && third === 2) ||
        (first === 198 && (second === 18 || second === 19)) ||
        (first === 198 && second === 51 && third === 100) ||
        (first === 203 && second === 0 && third === 113) ||
        first >= 224;

    if (privateAddress || reservedAddress) {
        throw new Error('Outbound IPv4 address is not public: ' + value);
    }
    return octets.join('.');
}

function parseOutboundIps(resourceId: string, response: unknown): string[] {
    if (!isObject(response) || !isObject(response.properties)) {
        throw new Error('Missing outbound IP discovery for ' + resourceId);
    }
    const raw = response.properties.outboundIpAddresses;
    const values =
        typeof raw === 'string'
            ? raw.split(',').map((value) => value.trim())
            : Array.isArray(raw)
              ? raw
              : [];
    if (
        values.length === 0 ||
        values.length > MAX_SOURCE_IPS ||
        !values.every(
            (value): value is string =>
                typeof value === 'string' && value.trim().length > 0,
        )
    ) {
        throw new Error(
            'Invalid outbound IP discovery for ' +
                resourceId +
                '; expected 1-' +
                MAX_SOURCE_IPS +
                ' addresses',
        );
    }
    return values.map((value) => parseIpv4(value));
}

function emptyState(): FirewallState {
    return { version: 1, rules: {} };
}

function parseState(value: unknown): FirewallState {
    if (value === undefined) {
        return emptyState();
    }
    if (!isObject(value) || value.version !== 1 || !isObject(value.rules)) {
        throw new Error('Invalid firewall control state');
    }

    const rules: Record<string, FirewallRuleState> = {};
    for (const [ip, rawRule] of Object.entries(value.rules)) {
        if (
            !isObject(rawRule) ||
            typeof rawRule.name !== 'string' ||
            typeof rawRule.firstSeenAt !== 'string' ||
            (rawRule.retiredAt !== undefined &&
                typeof rawRule.retiredAt !== 'string')
        ) {
            throw new Error('Invalid firewall state entry for ' + ip);
        }
        rules[ip] = {
            name: rawRule.name,
            firstSeenAt: rawRule.firstSeenAt,
            ...(rawRule.retiredAt === undefined
                ? {}
                : { retiredAt: rawRule.retiredAt }),
        };
    }
    return { version: 1, rules };
}

function parseRules(value: unknown, prefix: string): NormalizedRule[] {
    if (!isObject(value) || !Array.isArray(value.value)) {
        throw new Error('Invalid PostgreSQL firewall rule discovery');
    }
    const rules: NormalizedRule[] = [];
    for (const rawRule of value.value as unknown[]) {
        if (!isObject(rawRule) || typeof rawRule.name !== 'string') {
            continue;
        }
        if (!rawRule.name.startsWith(prefix) || !isObject(rawRule.properties)) {
            continue;
        }
        const start = rawRule.properties.startIpAddress;
        const end = rawRule.properties.endIpAddress;
        if (
            typeof start !== 'string' ||
            typeof end !== 'string' ||
            start !== end
        ) {
            continue;
        }
        try {
            rules.push({ name: rawRule.name, ip: parseIpv4(start) });
        } catch {
            // A malformed automatic rule is left untouched and never broadened.
        }
    }
    return rules;
}

function isNotFound(error: unknown): boolean {
    if (!isObject(error)) {
        return false;
    }
    return error.statusCode === 404 || error.status === 404;
}

function validDate(value: string): number {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
        throw new Error('Invalid firewall state timestamp: ' + value);
    }
    return timestamp;
}

function automaticName(prefix: string, ip: string): string {
    return prefix + ip;
}

function setRuleState(
    state: FirewallState,
    ip: string,
    name: string,
    now: string,
): boolean {
    const existing = state.rules[ip];
    if (!existing) {
        state.rules[ip] = { name, firstSeenAt: now };
        return true;
    }
    let changed = false;
    if (existing.name !== name) {
        existing.name = name;
        changed = true;
    }
    if (existing.retiredAt !== undefined) {
        delete existing.retiredAt;
        changed = true;
    }
    return changed;
}

function markRetired(
    state: FirewallState,
    ip: string,
    name: string,
    now: string,
): boolean {
    const existing = state.rules[ip];
    if (!existing) {
        state.rules[ip] = {
            name,
            firstSeenAt: now,
            retiredAt: now,
        };
        return true;
    }
    let changed = false;
    if (existing.name !== name) {
        existing.name = name;
        changed = true;
    }
    if (existing.retiredAt === undefined) {
        existing.retiredAt = now;
        changed = true;
    }
    return changed;
}

function isReadyToPrune(retiredAt: string | undefined, now: number): boolean {
    return (
        retiredAt !== undefined &&
        now - validDate(retiredAt) >= FIREWALL_RETIREMENT_GRACE_MS
    );
}

function createDeadline(timeoutMs: number): {
    signal: AbortSignal;
    dispose: () => void;
} {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        dispose: () => clearTimeout(timer),
    };
}

function ensureActive(signal: AbortSignal): void {
    if (signal.aborted) {
        throw new Error('Firewall reconciliation exceeded its bounded timeout');
    }
}

function deletionFailure(ip: string, error: unknown): string {
    if (isObject(error)) {
        const status = error.statusCode ?? error.status;
        if (typeof status === 'number') {
            return `${ip}: status ${status}`;
        }
    }
    return `${ip}: delete failed`;
}

async function discoverAll(
    arm: ArmClient,
    sourceResourceIds: string[],
    signal: AbortSignal,
): Promise<string[]> {
    if (sourceResourceIds.length === 0) {
        throw new Error('At least one firewall source resource is required');
    }
    const responses: Array<{
        id: string;
        response?: unknown;
        error?: unknown;
    }> = [];
    for (const resourceId of sourceResourceIds) {
        ensureActive(signal);
        const apiVersion = sourceApiVersion(resourceId);
        try {
            responses.push({
                id: resourceId,
                response: await arm.getJson<ArmResource>(
                    resourceId,
                    apiVersion,
                    signal,
                ),
            });
        } catch (error) {
            responses.push({ id: resourceId, error });
        }
    }
    const firstError = responses.find((entry) => entry.error)?.error;
    if (firstError !== undefined) {
        throw firstError instanceof Error
            ? firstError
            : new Error('Firewall source discovery failed');
    }

    const discovered = new Set<string>();
    for (const entry of responses) {
        for (const ip of parseOutboundIps(entry.id, entry.response)) {
            discovered.add(ip);
            if (discovered.size > MAX_TOTAL_IPS) {
                throw new Error(
                    'Outbound IP discovery exceeds the maximum of ' +
                        MAX_TOTAL_IPS +
                        ' addresses',
                );
            }
        }
    }
    if (discovered.size === 0) {
        throw new Error('Outbound IP discovery returned no public addresses');
    }
    return [...discovered].sort();
}

export async function reconcileFirewall(
    options: FirewallReconciliationOptions,
): Promise<FirewallReconciliationResult> {
    const prefix = options.automaticRulePrefix ?? DEFAULT_AUTOMATIC_RULE_PREFIX;
    if (!/^[a-z0-9-]+$/i.test(prefix) || !prefix.endsWith('-')) {
        throw new Error(
            'Automatic firewall rule prefix must end with a hyphen',
        );
    }
    const nowDate = options.now?.() ?? new Date();
    const nowIso = nowDate.toISOString();
    const nowMs = nowDate.getTime();
    const { arm, control } = options.clients;
    const timeoutMs =
        options.operationTimeoutMs ?? FIREWALL_OPERATION_TIMEOUT_MS;
    if (timeoutMs <= 0 || timeoutMs >= FIREWALL_LEASE_SECONDS * 1000) {
        throw new Error(
            'Firewall operation timeout must be shorter than its metadata lease',
        );
    }
    const deadline = createDeadline(timeoutMs);
    let lease: BlobLease | undefined;
    let leaseAcquiredAt: number | undefined;
    let operationSucceeded = false;
    let result: FirewallReconciliationResult | undefined;
    let releaseError: unknown;

    try {
        lease = await control.acquireLease(
            FIREWALL_STATE_BLOB,
            FIREWALL_LEASE_SECONDS,
            deadline.signal,
            emptyState(),
        );
        leaseAcquiredAt = Date.now();
        const loadedState = await control.loadJson<unknown>(
            FIREWALL_STATE_BLOB,
            lease.leaseId,
            deadline.signal,
        );
        const state = parseState(loadedState);
        ensureActive(deadline.signal);
        const discoveredIps = await discoverAll(
            arm,
            options.sourceResourceIds,
            deadline.signal,
        );

        const ruleListResourceId =
            options.postgresServerResourceId.replace(/\/+$/, '') +
            '/firewallRules';
        const rawRules =
            lease.created === true || loadedState === undefined
                ? undefined
                : await arm.getJson<FirewallRuleList>(
                      ruleListResourceId,
                      POSTGRES_FIREWALL_API_VERSION,
                      deadline.signal,
                  );
        const existingRules =
            rawRules === undefined ? [] : parseRules(rawRules, prefix);
        const existingByIp = new Map(
            existingRules.map((rule) => [rule.ip, rule] as const),
        );
        const discoveredSet = new Set(discoveredIps);
        const addedRules: string[] = [];
        const retiredRules: string[] = [];
        const failedDeletions: string[] = [];
        let stateChanged = false;

        for (const ip of discoveredIps) {
            const name = automaticName(prefix, ip);
            stateChanged =
                setRuleState(state, ip, name, nowIso) || stateChanged;
            if (!existingByIp.has(ip)) {
                ensureActive(deadline.signal);
                await arm.putJson(
                    ruleId(options.postgresServerResourceId, name),
                    POSTGRES_FIREWALL_API_VERSION,
                    {
                        properties: {
                            startIpAddress: ip,
                            endIpAddress: ip,
                        },
                    },
                    deadline.signal,
                );
                addedRules.push(name);
            }
        }

        for (const existing of existingRules) {
            if (!discoveredSet.has(existing.ip)) {
                if (
                    markRetired(
                        state,
                        existing.ip,
                        automaticName(prefix, existing.ip),
                        nowIso,
                    )
                ) {
                    stateChanged = true;
                    retiredRules.push(existing.name);
                }
            }
        }

        for (const [ip, existing] of Object.entries(state.rules)) {
            if (!discoveredSet.has(ip) && !existingByIp.has(ip)) {
                if (isReadyToPrune(existing.retiredAt, nowMs)) {
                    delete state.rules[ip];
                    stateChanged = true;
                }
            }
        }

        if (stateChanged) {
            ensureActive(deadline.signal);
            await control.saveJson(
                FIREWALL_STATE_BLOB,
                state,
                lease.leaseId,
                deadline.signal,
            );
        }

        for (const existing of existingRules) {
            const stateEntry = state.rules[existing.ip];
            if (
                discoveredSet.has(existing.ip) ||
                !stateEntry ||
                !isReadyToPrune(stateEntry.retiredAt, nowMs)
            ) {
                continue;
            }
            try {
                ensureActive(deadline.signal);
                await arm.delete(
                    ruleId(
                        options.postgresServerResourceId,
                        automaticName(prefix, existing.ip),
                    ),
                    POSTGRES_FIREWALL_API_VERSION,
                    deadline.signal,
                );
                delete state.rules[existing.ip];
                stateChanged = true;
            } catch (error) {
                if (isNotFound(error)) {
                    delete state.rules[existing.ip];
                    stateChanged = true;
                } else {
                    failedDeletions.push(deletionFailure(existing.ip, error));
                }
            }
        }

        if (stateChanged && failedDeletions.length === 0) {
            ensureActive(deadline.signal);
            await control.saveJson(
                FIREWALL_STATE_BLOB,
                state,
                lease.leaseId,
                deadline.signal,
            );
        }
        operationSucceeded = true;
        result = {
            discoveredIps,
            addedRules,
            retiredRules,
            failedDeletions,
        };
    } finally {
        try {
            if (lease) {
                const cleanupBudget = Math.max(
                    1,
                    Math.min(
                        MAX_CLEANUP_TIMEOUT_MS,
                        (leaseAcquiredAt ?? Date.now()) +
                            FIREWALL_LEASE_SECONDS * 1000 -
                            Date.now(),
                    ),
                );
                const cleanup = createDeadline(cleanupBudget);
                try {
                    await lease.release(cleanup.signal);
                } catch (error) {
                    releaseError = error;
                } finally {
                    cleanup.dispose();
                }
            }
        } finally {
            deadline.dispose();
        }
    }

    if (operationSucceeded && releaseError !== undefined) {
        throw asError(releaseError, 'Firewall lease release failed');
    }
    if (!result) {
        throw new Error('Firewall reconciliation did not produce a result');
    }
    return result;
}

function requiredEnvironment(env: NodeJS.ProcessEnv, name: string): string {
    const value = env[name]?.trim();
    if (!value) {
        throw new Error(name + ' is required');
    }
    return value;
}

function parseSourceResourceIds(env: NodeJS.ProcessEnv): string[] {
    const raw = requiredEnvironment(env, 'FIREWALL_SOURCE_RESOURCE_IDS');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch (error) {
        throw new Error('FIREWALL_SOURCE_RESOURCE_IDS must be a JSON array', {
            cause: error,
        });
    }
    if (
        !Array.isArray(parsed) ||
        parsed.length === 0 ||
        parsed.some(
            (resourceId) =>
                typeof resourceId !== 'string' ||
                resourceId.trim().length === 0,
        )
    ) {
        throw new Error(
            'FIREWALL_SOURCE_RESOURCE_IDS must be a nonempty JSON string array',
        );
    }
    return (parsed as unknown[]).map((resourceId) =>
        (resourceId as string).trim(),
    );
}

function reportFailedDeletions(logger: Logger, failures: string[]): void {
    const summary = failures
        .slice(0, MAX_FAILURES_TO_LOG)
        .map((failure) => failure.slice(0, MAX_FAILURE_TEXT_LENGTH))
        .join(', ');
    const omitted = failures.length - MAX_FAILURES_TO_LOG;
    logger.error(
        `Firewall automatic rule deletion failures (${failures.length}): ${summary}` +
            (omitted > 0 ? `; ${omitted} more omitted` : ''),
    );
}

export async function runFirewallCommand(
    env: NodeJS.ProcessEnv = process.env,
    logger = new Logger('FirewallMaintenance'),
): Promise<number> {
    const clients = createAzureMaintenanceClientsFromEnv(env);
    const result = await reconcileFirewall({
        sourceResourceIds: parseSourceResourceIds(env),
        postgresServerResourceId: requiredEnvironment(
            env,
            'POSTGRES_SERVER_RESOURCE_ID',
        ),
        clients,
    });
    if (result.failedDeletions.length > 0) {
        reportFailedDeletions(logger, result.failedDeletions);
        return 1;
    }
    return 0;
}

if (require.main === module) {
    const logger = new Logger('FirewallMaintenance');
    void runFirewallCommand()
        .then((exitCode) => {
            process.exitCode = exitCode;
        })
        .catch((error: unknown) => {
            logger.error(
                error instanceof Error
                    ? error.message
                    : 'Firewall reconciliation failed',
            );
            process.exitCode = 1;
        });
}
