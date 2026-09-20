import { randomUUID } from 'node:crypto';

import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Message } from 'amqplib';
import {
    Between,
    DataSource,
    EntityManager,
    LessThan,
    MoreThan,
} from 'typeorm';

import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { GameEnrichmentJob } from '../games/entities/game-enrichment-job.entity';
import { GameRequirement } from '../games/entities/game-requirement.entity';
import {
    assertGameEnrichmentTopology,
    GAME_ENRICHMENT_QUEUE,
    GAME_ENRICHMENT_RETRY_QUEUE,
} from '../games/game-lifecycle.contract';
import { Gpu } from '../gpu/entities/gpu.entity';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import {
    type CandidateValue,
    type CandidateValues,
    extractRawg,
    type FieldPath,
    mergeMissing,
    normalizeRequirements,
    summarizeMissing,
} from './enrichment-values';
import { GeminiRequirementsService } from './gemini-requirements.service';
import {
    type PcGamingWikiLookup,
    PcGamingWikiProviderError,
    PcGamingWikiService,
} from './pcgamingwiki.service';

const CLAIM_LEASE_MS = 2 * 60_000;
const QUEUED_RECOVERY_AGE_MS = 60_000;
const RECOVERY_INTERVAL_MS = 2 * 60_000;
const MAX_ATTEMPTS = 3;

type ClaimResult =
    | { kind: 'claimed'; game: Game; claimToken: string }
    | { kind: 'ack' }
    | { kind: 'dead' };

type RequirementSource = {
    text: string;
    tier: 'minimum' | 'recommended';
    source: 'rawg' | 'pcgamingwiki';
    sourceUrl: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const positiveGameId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const parseGameId = (message: Message): number | undefined => {
    try {
        const body: unknown = JSON.parse(message.content.toString('utf8'));
        if (
            !isRecord(body) ||
            Object.keys(body).length !== 1 ||
            !positiveGameId(body.gameId)
        ) {
            return undefined;
        }
        return body.gameId;
    } catch {
        return undefined;
    }
};

const sourceFrom = (source: unknown): CandidateValue['source'] =>
    source === 'admin' || source === 'pcgamingwiki' ? source : 'rawg';

const unique = (values: string[]): string[] => [...new Set(values)];

@Injectable()
export class GameEnrichmentWorker implements OnModuleInit, OnModuleDestroy {
    private channel: ChannelWrapper | undefined;
    private recoveryTimer: ReturnType<typeof setInterval> | undefined;

    constructor(
        @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
        private readonly rabbitMq: RabbitMqService,
        private readonly wiki: PcGamingWikiService,
        private readonly gemini: GeminiRequirementsService,
        private readonly logger: Logger,
    ) {}

    onModuleInit(): void {
        this.channel = this.rabbitMq.createConfirmChannel(async (channel) => {
            await assertGameEnrichmentTopology(channel);
            await channel.prefetch(1);
            const consumeHandler = (message: Message | null): Promise<void> =>
                this.handleMessage(message);
            await channel.consume(
                GAME_ENRICHMENT_QUEUE,
                consumeHandler as unknown as (message: Message | null) => void,
            );
        });

        setImmediate(() => void this.recoverStaleJobs());
        this.recoveryTimer = setInterval(
            () => void this.recoverStaleJobs(),
            RECOVERY_INTERVAL_MS,
        );
        this.recoveryTimer.unref?.();
    }

    onModuleDestroy(): void {
        if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    }

    private async handleMessage(message: Message | null): Promise<void> {
        if (!message || !this.channel) return;

        const gameId = parseGameId(message);
        if (!gameId) {
            this.channel.nack(message, false, false);
            return;
        }

        let claim: ClaimResult;
        try {
            claim = await this.claim(gameId);
        } catch {
            this.logger.error('Game enrichment claim failed');
            this.channel.nack(message, false, true);
            return;
        }

        if (claim.kind === 'ack') {
            this.channel.ack(message);
            return;
        }
        if (claim.kind === 'dead') {
            this.channel.nack(message, false, false);
            return;
        }

        try {
            const enrichment = await this.collect(claim.game);
            const committed = await this.complete(
                gameId,
                claim.claimToken,
                enrichment.candidates,
                enrichment.warnings,
            );
            if (committed) this.channel.ack(message);
            else this.channel.ack(message);
        } catch (error: unknown) {
            await this.retryOrDeadLetter(
                message,
                gameId,
                claim.claimToken,
                error,
            );
        }
    }

    private async claim(gameId: number): Promise<ClaimResult> {
        return this.dataSource.transaction(async (tx) => {
            const gameRepository = tx.getRepository(Game);
            const jobRepository = tx.getRepository(GameEnrichmentJob);
            const game = await gameRepository.findOne({
                where: { id: gameId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!game) return { kind: 'dead' };

            const job = await jobRepository.findOne({
                where: { game: { id: gameId } },
                lock: { mode: 'pessimistic_write' },
            });
            if (!job) return { kind: 'dead' };
            if (game.status !== 'pending_approval') return { kind: 'ack' };
            if (job.status === 'completed') return { kind: 'ack' };
            if (job.status === 'failed') return { kind: 'dead' };
            if (job.attempts >= MAX_ATTEMPTS) {
                job.status = 'failed';
                job.error = 'Enrichment attempts exhausted';
                job.claimToken = null;
                job.claimedAt = null;
                await jobRepository.save(job);
                return { kind: 'dead' };
            }

            if (
                job.status === 'processing' &&
                job.claimedAt &&
                Date.now() - job.claimedAt.getTime() < CLAIM_LEASE_MS
            ) {
                return { kind: 'ack' };
            }

            try {
                extractRawg(game.rawgPayload, game.rawgId ?? 0);
            } catch {
                job.status = 'failed';
                job.error = 'Invalid retained RAWG payload';
                job.claimToken = null;
                job.claimedAt = null;
                await jobRepository.save(job);
                return { kind: 'dead' };
            }

            const claimToken = randomUUID();
            job.status = 'processing';
            job.attempts += 1;
            job.claimToken = claimToken;
            job.claimedAt = new Date();
            await jobRepository.save(job);
            return { kind: 'claimed', game, claimToken };
        });
    }

    private async collect(
        game: Game,
    ): Promise<{ candidates: CandidateValues; warnings: string[] }> {
        let candidates = extractRawg(game.rawgPayload, game.rawgId ?? 0);
        const warnings: string[] = [];
        const sources = this.rawgRequirementSources(game.rawgPayload);
        const lookup = await this.wiki.findExact(game.name);

        if (lookup.kind === 'unmatched') {
            warnings.push(lookup.warning);
        } else {
            warnings.push(...lookup.warnings);
            candidates = mergeMissing(
                candidates,
                this.metadataCandidates(lookup),
            );
            for (const tier of ['minimum', 'recommended'] as const) {
                const text = lookup[tier];
                if (text) {
                    sources.push({
                        text,
                        tier,
                        source: 'pcgamingwiki',
                        sourceUrl: lookup.url,
                    });
                    candidates = mergeMissing(
                        candidates,
                        normalizeRequirements(
                            text,
                            tier,
                            'pcgamingwiki',
                            lookup.url,
                        ),
                    );
                }
            }
        }

        for (const source of sources) {
            const missing = summarizeMissing(candidates).filter(
                (path) =>
                    path === `requirements.${source.tier}.ramGb` ||
                    path.startsWith(`requirements.${source.tier}.`),
            );
            const requiredMissing = missing.filter((path) =>
                [
                    `requirements.${source.tier}.ramGb`,
                    `requirements.${source.tier}.cpu`,
                    `requirements.${source.tier}.gpu`,
                ].includes(path),
            );
            if (requiredMissing.length === 0) continue;
            const interpreted = await this.gemini.interpret(
                source.text,
                missing,
                source.source,
                source.sourceUrl,
            );
            if (Object.keys(interpreted).length === 0) {
                warnings.push('Gemini requirement interpretation incomplete');
            }
            candidates = mergeMissing(candidates, interpreted);
        }

        return { candidates, warnings: unique(warnings) };
    }

    private metadataCandidates(
        lookup: Extract<PcGamingWikiLookup, { kind: 'matched' }>,
    ): CandidateValues {
        const values: CandidateValues = {};
        for (const [path, value] of Object.entries(lookup.metadata)) {
            if (
                !value ||
                !['developer', 'publisher', 'releaseDate', 'genre'].includes(
                    path,
                )
            )
                continue;
            values[path as FieldPath] = {
                value,
                source: 'pcgamingwiki',
                sourceUrl: lookup.url,
                extractedBy: null,
            };
        }
        return values;
    }

    private rawgRequirementSources(
        payload: Record<string, unknown> | null,
    ): RequirementSource[] {
        if (!isRecord(payload) || !Array.isArray(payload.platforms)) return [];
        const platforms = payload.platforms as unknown[];
        const windows = platforms.find((entry) => {
            if (!isRecord(entry) || !isRecord(entry.platform)) return false;
            return [entry.platform.slug, entry.platform.name]
                .filter((value): value is string => typeof value === 'string')
                .some((value) => value.toLowerCase() === 'windows');
        });
        const requirements = isRecord(windows)
            ? windows.requirements
            : undefined;
        if (!isRecord(requirements)) return [];
        const sourceUrl =
            typeof payload.id === 'number'
                ? `https://rawg.io/games/${payload.id}`
                : null;
        return (['minimum', 'recommended'] as const).flatMap((tier) => {
            const text = requirements[tier];
            return typeof text === 'string' && text.trim()
                ? [{ text, tier, source: 'rawg' as const, sourceUrl }]
                : [];
        });
    }

    private async complete(
        gameId: number,
        claimToken: string,
        candidates: CandidateValues,
        warnings: string[],
    ): Promise<boolean> {
        return this.dataSource.transaction(async (tx) => {
            const gameRepository = tx.getRepository(Game);
            const jobRepository = tx.getRepository(GameEnrichmentJob);
            const game = await gameRepository.findOne({
                where: { id: gameId },
                lock: { mode: 'pessimistic_write' },
            });
            const job = await jobRepository.findOne({
                where: { game: { id: gameId } },
                lock: { mode: 'pessimistic_write' },
            });
            if (
                !game ||
                !job ||
                job.status !== 'processing' ||
                job.claimToken !== claimToken
            ) {
                return false;
            }
            if (game.status !== 'pending_approval') {
                job.status = 'failed';
                job.error = 'Game is no longer pending';
                job.claimToken = null;
                job.claimedAt = null;
                await jobRepository.save(job);
                return false;
            }

            job.warnings = unique(warnings);
            await this.mergeAndSaveAllowedValues(tx, game, job, candidates);
            return true;
        });
    }

    private async retryOrDeadLetter(
        message: Message,
        gameId: number,
        claimToken: string,
        error: unknown,
    ): Promise<void> {
        if (!this.channel) return;
        const messageText =
            error instanceof Error &&
            error.message === 'Game is no longer pending'
                ? error.message
                : this.sanitizedError(error);
        let attempts: number | undefined;
        try {
            attempts = await this.recordFailure(
                gameId,
                claimToken,
                messageText,
            );
        } catch {
            this.logger.error(
                'Game enrichment failure state could not be saved',
            );
            this.channel.nack(message, false, true);
            return;
        }

        if (attempts === undefined) {
            this.channel.ack(message);
            return;
        }
        if (attempts >= MAX_ATTEMPTS) {
            this.channel.nack(message, false, false);
            return;
        }

        try {
            await this.channel.sendToQueue(
                GAME_ENRICHMENT_RETRY_QUEUE,
                { gameId },
                { persistent: true },
            );
            this.channel.ack(message);
        } catch {
            this.logger.error('Game enrichment retry publication failed');
            this.channel.nack(message, false, true);
        }
    }

    private async recordFailure(
        gameId: number,
        claimToken: string,
        error: string,
    ): Promise<number | undefined> {
        return this.dataSource.transaction(async (tx) => {
            const gameRepository = tx.getRepository(Game);
            const jobRepository = tx.getRepository(GameEnrichmentJob);
            const game = await gameRepository.findOne({
                where: { id: gameId },
                lock: { mode: 'pessimistic_write' },
            });
            const job = await jobRepository.findOne({
                where: { game: { id: gameId } },
                lock: { mode: 'pessimistic_write' },
            });
            if (
                !job ||
                job.status !== 'processing' ||
                job.claimToken !== claimToken
            ) {
                return undefined;
            }
            if (game && game.status !== 'pending_approval') {
                job.status = 'failed';
                job.error = 'Game is no longer pending';
                job.claimToken = null;
                job.claimedAt = null;
                await jobRepository.save(job);
                return undefined;
            }
            job.error = error;
            job.claimToken = null;
            job.claimedAt = null;
            if (job.attempts >= MAX_ATTEMPTS) {
                job.status = 'failed';
            } else {
                job.status = 'queued';
            }
            await jobRepository.save(job);
            return job.attempts;
        });
    }

    private sanitizedError(error: unknown): string {
        if (
            error instanceof PcGamingWikiProviderError &&
            /^[\w .:-]{1,200}$/.test(error.message)
        ) {
            return error.message;
        }
        if (error instanceof Error && error.message.includes('timeout')) {
            return 'Provider request timeout';
        }
        return 'Provider failure';
    }

    private async recoverStaleJobs(): Promise<void> {
        if (!this.channel) return;
        try {
            const jobs = await this.dataSource
                .getRepository(GameEnrichmentJob)
                .find({
                    relations: ['game'],
                    take: 100,
                    where: [
                        {
                            status: 'processing',
                            attempts: MoreThan(0),
                            claimedAt: LessThan(
                                new Date(Date.now() - CLAIM_LEASE_MS),
                            ),
                            game: { status: 'pending_approval' },
                        },
                        {
                            status: 'queued',
                            attempts: Between(1, MAX_ATTEMPTS - 1),
                            updatedAt: LessThan(
                                new Date(Date.now() - QUEUED_RECOVERY_AGE_MS),
                            ),
                            game: { status: 'pending_approval' },
                        },
                    ],
                });

            for (const job of jobs) {
                const gameId = job.game?.id;
                const staleProcessing =
                    job.status === 'processing' &&
                    job.attempts > 0 &&
                    !!job.claimedAt &&
                    Date.now() - job.claimedAt.getTime() >= CLAIM_LEASE_MS;
                const staleQueued =
                    job.status === 'queued' &&
                    job.attempts > 0 &&
                    job.attempts < MAX_ATTEMPTS &&
                    !!job.updatedAt &&
                    Date.now() - job.updatedAt.getTime() >=
                        QUEUED_RECOVERY_AGE_MS;
                if (
                    !positiveGameId(gameId) ||
                    job.game?.status !== 'pending_approval' ||
                    (!staleProcessing && !staleQueued)
                ) {
                    continue;
                }
                await this.channel.sendToQueue(
                    GAME_ENRICHMENT_QUEUE,
                    { gameId },
                    { persistent: true },
                );
            }
        } catch {
            this.logger.warn('Game enrichment recovery scan failed');
        }
    }

    private async mergeAndSaveAllowedValues(
        tx: EntityManager,
        game: Game,
        job: GameEnrichmentJob,
        candidates: CandidateValues,
    ): Promise<void> {
        const requirementRepository = tx.getRepository(GameRequirement);
        const existingRequirements = await requirementRepository.find({
            where: { game: { id: game.id } },
            relations: ['cpu', 'gpu'],
        });
        const current = this.currentValues(game, existingRequirements);
        const merged = mergeMissing(current, candidates);

        const gameRepository = tx.getRepository(Game);
        let gameChanged = false;
        let provenanceChanged = false;
        const metadataProvenance = { ...(game.metadataProvenance ?? {}) };
        const scalarFields = [
            'publisher',
            'developer',
            'releaseDate',
            'genre',
            'description',
            'tags',
            'coverImageUrl',
            'supportsRayTracing',
            'supportsDlss',
            'supportsFsr',
            'supportsXeSS',
        ] as const;
        for (const path of scalarFields) {
            const entry = merged[path];
            if (!entry || !this.canFillGameField(game, path)) continue;
            const value = entry.value;
            if (path === 'releaseDate' && typeof value === 'string') {
                game.releaseDate = new Date(`${value}T00:00:00.000Z`);
            } else {
                (game as unknown as Record<string, unknown>)[path] = value;
            }
            metadataProvenance[path] = {
                source: entry.source,
                sourceUrl: entry.sourceUrl,
                extractedBy: entry.extractedBy,
            };
            gameChanged = true;
        }

        const persisted = mergeMissing(current, {});
        for (const field of scalarFields) {
            const value = (game as unknown as Record<string, unknown>)[field];
            if (field === 'releaseDate' && value instanceof Date) {
                persisted[field] = {
                    value: value.toISOString().slice(0, 10),
                    source: sourceFrom(metadataProvenance[field]?.source),
                    sourceUrl: metadataProvenance[field]?.sourceUrl ?? null,
                    extractedBy: metadataProvenance[field]?.extractedBy ?? null,
                };
            } else if (
                typeof value === 'string' ||
                Array.isArray(value) ||
                typeof value === 'boolean'
            ) {
                const provenance = metadataProvenance[field];
                if (value || (typeof value === 'boolean' && provenance)) {
                    persisted[field] = {
                        value: value as string | string[] | boolean,
                        source: sourceFrom(provenance?.source),
                        sourceUrl: provenance?.sourceUrl ?? null,
                        extractedBy: provenance?.extractedBy ?? null,
                    };
                }
            }
        }

        for (const tier of ['minimum', 'recommended'] as const) {
            const path = `requirements.${tier}.ramGb` as FieldPath;
            const existing = existingRequirements.find(
                (row) => row.tier === tier,
            );
            const ramValue = merged[path]?.value;
            const ramGb =
                existing?.ramGb ??
                (typeof ramValue === 'number' ? ramValue : undefined);
            if (!ramGb || !Number.isFinite(ramGb) || ramGb <= 0) continue;

            const row = existing ?? new GameRequirement();
            const requirementPathFor = (field: RequirementField): FieldPath =>
                `requirements.${tier}.${field}`;
            const recordCandidateProvenance = (
                field: RequirementField,
                accepted: boolean,
            ): void => {
                const fieldPath = requirementPathFor(field);
                const candidate = candidates[fieldPath];
                if (!accepted || !candidate) return;
                if (metadataProvenance[fieldPath]?.source === 'admin') return;
                metadataProvenance[fieldPath] = {
                    source: candidate.source,
                    sourceUrl: candidate.sourceUrl,
                    extractedBy: candidate.extractedBy,
                };
                provenanceChanged = true;
            };
            const cpu = await this.hardwareMatch(
                tx,
                Cpu,
                merged[`requirements.${tier}.cpu`],
                existing?.cpu ?? null,
            );
            const gpu = await this.hardwareMatch(
                tx,
                Gpu,
                merged[`requirements.${tier}.gpu`],
                existing?.gpu ?? null,
            );
            const notes = this.requirementNotes(
                existing?.notes ?? null,
                merged[`requirements.${tier}.notes`],
                candidates[`requirements.${tier}.cpu`],
                candidates[`requirements.${tier}.gpu`],
            );
            Object.assign(row, {
                game,
                tier,
                description: existing?.description ?? null,
                cpu,
                gpu,
                ramGb: Math.ceil(ramGb),
                vramGb: this.numberValue(
                    merged[`requirements.${tier}.vramGb`],
                    existing?.vramGb,
                ),
                storageGb: this.numberValue(
                    merged[`requirements.${tier}.storageGb`],
                    existing?.storageGb,
                ),
                requiresSsd:
                    this.booleanValue(
                        merged[`requirements.${tier}.requiresSsd`],
                    ) ??
                    existing?.requiresSsd ??
                    false,
                resolutionWidth: existing?.resolutionWidth ?? 1920,
                resolutionHeight: existing?.resolutionHeight ?? 1080,
                targetFps: existing?.targetFps ?? 30,
                notes,
            });
            await requirementRepository.save(row);
            recordCandidateProvenance(
                'ramGb',
                !existing && typeof ramValue === 'number',
            );
            recordCandidateProvenance(
                'vramGb',
                existing?.vramGb == null &&
                    typeof merged[`requirements.${tier}.vramGb`]?.value ===
                        'number',
            );
            recordCandidateProvenance(
                'storageGb',
                existing?.storageGb == null &&
                    typeof merged[`requirements.${tier}.storageGb`]?.value ===
                        'number',
            );
            recordCandidateProvenance('cpu', cpu !== null && !existing?.cpu);
            recordCandidateProvenance('gpu', gpu !== null && !existing?.gpu);
            recordCandidateProvenance(
                'requiresSsd',
                existing?.requiresSsd !== true && row.requiresSsd,
            );
            recordCandidateProvenance(
                'notes',
                !existing?.notes &&
                    typeof merged[`requirements.${tier}.notes`]?.value ===
                        'string',
            );

            const tierSource = (
                field: RequirementField,
            ): CandidateValue['source'] =>
                sourceFrom(
                    metadataProvenance[`requirements.${tier}.${field}`]?.source,
                );
            const tierUrl = (field: RequirementField): string | null =>
                metadataProvenance[`requirements.${tier}.${field}`]
                    ?.sourceUrl ?? null;
            persisted[path] = {
                value: Math.ceil(ramGb),
                source: tierSource('ramGb'),
                sourceUrl: tierUrl('ramGb'),
                extractedBy: metadataProvenance[path]?.extractedBy ?? null,
            };
            for (const field of ['vramGb', 'storageGb'] as const) {
                const value = this.numberValue(
                    merged[`requirements.${tier}.${field}`],
                    existing?.[field],
                );
                if (value !== null) {
                    persisted[`requirements.${tier}.${field}`] = {
                        value,
                        source: tierSource(field),
                        sourceUrl: tierUrl(field),
                        extractedBy:
                            metadataProvenance[`requirements.${tier}.${field}`]
                                ?.extractedBy ?? null,
                    };
                }
            }
            if (cpu) {
                persisted[`requirements.${tier}.cpu`] =
                    this.candidateForHardware(
                        cpu.name,
                        metadataProvenance[`requirements.${tier}.cpu`],
                    );
            }
            if (gpu) {
                persisted[`requirements.${tier}.gpu`] =
                    this.candidateForHardware(
                        gpu.name,
                        metadataProvenance[`requirements.${tier}.gpu`],
                    );
            }
            if (row.requiresSsd) {
                persisted[`requirements.${tier}.requiresSsd`] = {
                    value: true,
                    source: tierSource('requiresSsd'),
                    sourceUrl: tierUrl('requiresSsd'),
                    extractedBy:
                        metadataProvenance[`requirements.${tier}.requiresSsd`]
                            ?.extractedBy ?? null,
                };
            }
            if (row.notes) {
                persisted[`requirements.${tier}.notes`] = {
                    value: row.notes,
                    source: tierSource('notes'),
                    sourceUrl: tierUrl('notes'),
                    extractedBy:
                        metadataProvenance[`requirements.${tier}.notes`]
                            ?.extractedBy ?? null,
                };
            }
        }

        if (gameChanged || provenanceChanged) {
            game.metadataProvenance = metadataProvenance;
            await gameRepository.save(game);
        }

        job.missingFields = summarizeMissing(persisted);
        job.status = 'completed';
        job.error = null;
        job.claimToken = null;
        job.claimedAt = null;
        await tx.getRepository(GameEnrichmentJob).save(job);
    }

    private currentValues(
        game: Game,
        requirements: GameRequirement[],
    ): CandidateValues {
        const values: CandidateValues = {};
        const provenance = game.metadataProvenance ?? {};
        const fields = [
            'publisher',
            'developer',
            'releaseDate',
            'genre',
            'description',
            'tags',
            'coverImageUrl',
            'supportsRayTracing',
            'supportsDlss',
            'supportsFsr',
            'supportsXeSS',
        ] as const;
        for (const field of fields) {
            const value = (game as unknown as Record<string, unknown>)[field];
            if (
                value === null ||
                value === undefined ||
                value === '' ||
                (Array.isArray(value) && value.length === 0) ||
                (typeof value === 'boolean' &&
                    value === false &&
                    !provenance[field])
            ) {
                continue;
            }
            const entry = provenance[field];
            values[field] = {
                value:
                    value instanceof Date
                        ? value.toISOString().slice(0, 10)
                        : (value as string | string[] | boolean),
                source: sourceFrom(entry?.source),
                sourceUrl: entry?.sourceUrl ?? null,
                extractedBy: entry?.extractedBy ?? null,
            };
        }
        for (const row of requirements) {
            const tier = row.tier === 'recommended' ? 'recommended' : 'minimum';
            const prefix = `requirements.${tier}` as const;
            const entry = (field: string): CandidateValue => {
                const provenanceEntry = provenance[`${prefix}.${field}`];
                return {
                    value: '',
                    source: sourceFrom(provenanceEntry?.source),
                    sourceUrl: provenanceEntry?.sourceUrl ?? null,
                    extractedBy: provenanceEntry?.extractedBy ?? null,
                };
            };
            if (row.ramGb > 0)
                values[`${prefix}.ramGb`] = {
                    ...entry('ramGb'),
                    value: row.ramGb,
                };
            if (row.vramGb !== null)
                values[`${prefix}.vramGb`] = {
                    ...entry('vramGb'),
                    value: row.vramGb,
                };
            if (row.storageGb !== null)
                values[`${prefix}.storageGb`] = {
                    ...entry('storageGb'),
                    value: row.storageGb,
                };
            if (row.cpu)
                values[`${prefix}.cpu`] = {
                    ...entry('cpu'),
                    value: row.cpu.name,
                };
            if (row.gpu)
                values[`${prefix}.gpu`] = {
                    ...entry('gpu'),
                    value: row.gpu.name,
                };
            if (row.requiresSsd)
                values[`${prefix}.requiresSsd`] = {
                    ...entry('requiresSsd'),
                    value: true,
                };
            if (row.notes)
                values[`${prefix}.notes`] = {
                    ...entry('notes'),
                    value: row.notes,
                };
        }
        return values;
    }

    private canFillGameField(game: Game, field: string): boolean {
        const provenance = game.metadataProvenance?.[field];
        if (provenance?.source === 'admin') return false;
        const value = (game as unknown as Record<string, unknown>)[field];
        return (
            value === null ||
            value === undefined ||
            value === '' ||
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === 'boolean' && value === false && !provenance)
        );
    }

    private async hardwareMatch<T extends Cpu | Gpu>(
        tx: EntityManager,
        entity: typeof Cpu | typeof Gpu,
        candidateValue: CandidateValue | undefined,
        existing: T | null,
    ): Promise<T | null> {
        if (existing) return existing;
        if (!candidateValue || typeof candidateValue.value !== 'string')
            return null;
        const rows = (await tx.getRepository(entity).find({
            where: { name: candidateValue.value },
        })) as T[];
        return rows.length === 1 ? rows[0] : null;
    }

    private requirementNotes(
        existing: string | null,
        notes: CandidateValue | undefined,
        cpu: CandidateValue | undefined,
        gpu: CandidateValue | undefined,
    ): string | null {
        const values = [
            existing,
            typeof notes?.value === 'string' ? notes.value : null,
            cpu ? `CPU: ${String(cpu.value)}` : null,
            gpu ? `GPU: ${String(gpu.value)}` : null,
        ].filter((value): value is string => !!value && value.trim() !== '');
        return unique(values).join('; ') || null;
    }

    private numberValue(
        candidateValue: CandidateValue | undefined,
        existing: number | null | undefined,
    ): number | null {
        if (
            typeof candidateValue?.value === 'number' &&
            Number.isFinite(candidateValue.value)
        ) {
            return Math.ceil(candidateValue.value);
        }
        return existing ?? null;
    }

    private booleanValue(
        candidateValue: CandidateValue | undefined,
    ): boolean | null {
        return typeof candidateValue?.value === 'boolean'
            ? candidateValue.value
            : null;
    }

    private candidateForHardware(
        value: string,
        provenance:
            | {
                  source?: string;
                  sourceUrl?: string | null;
                  extractedBy?: 'gemini' | null;
              }
            | undefined,
    ): CandidateValue {
        return {
            value,
            source: sourceFrom(provenance?.source),
            sourceUrl: provenance?.sourceUrl ?? null,
            extractedBy: provenance?.extractedBy ?? null,
        };
    }
}

type RequirementField =
    | 'ramGb'
    | 'vramGb'
    | 'storageGb'
    | 'cpu'
    | 'gpu'
    | 'requiresSsd'
    | 'notes';
