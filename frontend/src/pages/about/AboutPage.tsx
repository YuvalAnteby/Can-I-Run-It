import { CircleAlert } from 'lucide-react';
import type { ReactElement } from 'react';

import { ArchitectureDiagram } from './ArchitectureDiagram';
import { CompatibilityDiagram } from './CompatibilityDiagram';

export default function AboutPage(): ReactElement {
  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-12 text-gray-300 md:py-16">
      <header className="max-w-3xl">
        <h1 className="m-0 text-4xl font-bold tracking-[-0.03em] text-white text-balance md:text-5xl">
          How Can I Run It works
        </h1>
        <p className="mt-4 mb-0 max-w-[70ch] text-lg leading-8 text-gray-300">
          Can I Run It compares a specific PC and game configuration with the
          best evidence available, then explains where the result came from.
        </p>
      </header>

      <section
        aria-labelledby="inputs-heading"
        className="mt-14 border-t border-gray-800 pt-10"
      >
        <div>
          <h2
            id="inputs-heading"
            className="mt-0 mb-3 text-2xl font-semibold tracking-[-0.02em] text-white"
          >
            What a check uses
          </h2>
          <div className="flex flex-wrap gap-2" aria-label="Check inputs">
            {['Game', 'CPU', 'GPU', 'RAM', 'Resolution', 'Preset'].map(
              (input) => (
                <span
                  key={input}
                  className="rounded-full border border-sky-300/20 bg-sky-300/[0.07] px-3 py-1.5 text-xs font-semibold text-sky-100"
                >
                  {input}
                </span>
              ),
            )}
            <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.07] px-3 py-1.5 text-xs font-semibold text-violet-100">
              Upscaler preference
            </span>
          </div>
          <p className="m-0 mt-5 leading-7">
            A check uses the game, CPU, GPU, RAM, resolution, settings preset,
            and an optional upscaler and quality preference.
            <br />
            You can target 30, 60, 90, 120, or 144 FPS. The default target FPS
            is 60.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="architecture-heading"
        className="mt-14 border-t border-gray-800 pt-10"
      >
        <div>
          <h2
            id="architecture-heading"
            className="mt-0 mb-3 text-2xl font-semibold tracking-[-0.02em] text-white"
          >
            The system at a glance
          </h2>
          <p className="m-0 leading-7">
            The browser talks to one API boundary. NestJS owns compatibility
            orchestration, PostgreSQL stores the evidence.
            <br />
            Gemini is an optional fallback when stored records are missing.
          </p>
        </div>
        <ArchitectureDiagram />
      </section>

      <section
        aria-labelledby="lookup-heading"
        className="mt-14 border-t border-gray-800 pt-10"
      >
        <div>
          <h2
            id="lookup-heading"
            className="mt-0 mb-3 text-2xl font-semibold tracking-[-0.02em] text-white"
          >
            How evidence is selected
          </h2>
          <p className="m-0 leading-7">
            Exact lookup identity is the game, CPU, GPU, RAM, resolution, and
            settings preset.
            <br />
            Target FPS, SSD choice, and storage capacity are not identity
            fields, an upscaler is a preference rather than a requirement.
          </p>
        </div>
        <CompatibilityDiagram />
        <p className="mt-6 mb-0 text-sm leading-6 text-gray-400">
          A measured database row is used first, followed by a cached provider
          result or Gemini.
          <br />
          If provider data is unavailable, a heuristic estimate is used when
          enough requirements exist, otherwise the check returns Insufficient
          data.
        </p>
      </section>

      <section
        aria-labelledby="results-heading"
        className="mt-14 border-t border-gray-800 pt-10"
      >
        <div className="grid gap-10 md:grid-cols-2 md:gap-14">
          <div>
            <h2
              id="results-heading"
              className="mt-0 mb-3 text-2xl font-semibold tracking-[-0.02em] text-white"
            >
              Reading a result
            </h2>
            <p className="m-0 max-w-[48ch] leading-7">
              Verified, AI, and Estimate badges identify measured, provider, and
              heuristic evidence. Results use the exact verdicts Can run,
              Can&apos;t run, Likely can run, Likely can&apos;t run, and
              Insufficient data.
            </p>
          </div>
          <div>
            <h2
              id="limits-heading"
              className="mt-0 mb-3 text-2xl font-semibold tracking-[-0.02em] text-white"
            >
              V1 limits
            </h2>
            <p className="m-0 max-w-[48ch] leading-7">
              The curated dataset covers only the configurations currently
              stored, so some checks rely on provider data, a heuristic, or
              return Insufficient data. V1 does not include accounts, automatic
              ingestion or enrichment, or ML model support. A public URL is
              pending.
            </p>
          </div>
        </div>
        <div className="mt-8 flex items-start gap-2.5 border-t border-white/[0.07] pt-5 text-sm leading-6 text-gray-400">
          <CircleAlert
            className="mt-1 h-4 w-4 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <p className="m-0">
            Storage capacity is not collected or evaluated. An SSD mismatch is
            advisory only and a VRAM shortage overrides a positive verdict.
          </p>
        </div>
      </section>
    </article>
  );
}
