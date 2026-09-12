import type { ReactElement } from 'react';

export default function AboutPage(): ReactElement {
  return (
    <article className="w-full max-w-3xl mx-auto px-4 py-12 md:py-16 text-gray-300">
      <header className="mb-12">
        <h1 className="m-0 text-4xl md:text-5xl font-bold -tracking-[0.03em] text-white text-balance">
          How Can I Run It works
        </h1>
        <p className="mt-4 mb-0 max-w-[70ch] text-lg leading-8 text-gray-300">
          Can I Run It compares a specific PC and game configuration with the
          best evidence available, then explains where the result came from.
        </p>
      </header>

      <section
        aria-labelledby="inputs-heading"
        className="py-8 border-t border-gray-800"
      >
        <h2
          id="inputs-heading"
          className="mt-0 mb-3 text-2xl font-semibold text-white"
        >
          What a check uses
        </h2>
        <p className="m-0 max-w-[70ch] leading-7">
          A check uses the game, CPU, GPU, RAM, resolution, settings preset, and
          an optional upscaler and quality preference. You can target 30, 60,
          90, 120, or 144 FPS; the default target FPS is 60.
        </p>
      </section>

      <section
        aria-labelledby="lookup-heading"
        className="py-8 border-t border-gray-800"
      >
        <h2
          id="lookup-heading"
          className="mt-0 mb-3 text-2xl font-semibold text-white"
        >
          How evidence is selected
        </h2>
        <p className="m-0 max-w-[70ch] leading-7">
          Exact lookup identity is the game, CPU, GPU, RAM, resolution, and
          settings preset. Target FPS, SSD choice, and storage capacity are not
          identity fields. An upscaler and its quality are optional preferences,
          not identity requirements.
        </p>
        <ol className="mt-5 mb-0 pl-5 space-y-3 marker:text-blue-400">
          <li className="pl-2 leading-7">
            A measured database row is used first.
          </li>
          <li className="pl-2 leading-7">
            Next comes a cached provider result, or a Gemini result when no
            matching stored row exists.
          </li>
          <li className="pl-2 leading-7">
            If provider data is unavailable, a requirements-based heuristic
            estimate is used when enough data exists.
          </li>
        </ol>
      </section>

      <section
        aria-labelledby="results-heading"
        className="py-8 border-t border-gray-800"
      >
        <h2
          id="results-heading"
          className="mt-0 mb-3 text-2xl font-semibold text-white"
        >
          Reading a result
        </h2>
        <p className="m-0 max-w-[70ch] leading-7">
          Verified, AI, and Estimate badges identify measured, provider, and
          heuristic evidence. Results use the exact verdicts Can run, Can&apos;t
          run, Likely can run, Likely can&apos;t run, and Insufficient data.
        </p>
        <p className="mt-4 mb-0 max-w-[70ch] leading-7">
          A VRAM shortage overrides a positive FPS verdict. An SSD mismatch is
          advisory only and does not change the verdict. Storage capacity is not
          collected or evaluated.
        </p>
      </section>

      <section
        aria-labelledby="limits-heading"
        className="py-8 border-t border-gray-800"
      >
        <h2
          id="limits-heading"
          className="mt-0 mb-3 text-2xl font-semibold text-white"
        >
          V1 limits
        </h2>
        <p className="m-0 max-w-[70ch] leading-7">
          The curated dataset covers only the configurations currently stored,
          so some checks rely on provider data, a heuristic, or return
          Insufficient data. V1 does not include accounts, automatic ingestion
          or enrichment, or ML model support. A public URL is pending.
        </p>
      </section>

      <section
        aria-labelledby="stack-heading"
        className="pt-8 border-t border-gray-800"
      >
        <h2
          id="stack-heading"
          className="mt-0 mb-3 text-2xl font-semibold text-white"
        >
          Built with
        </h2>
        <p className="m-0 max-w-[70ch] leading-7">
          NestJS powers the API, React powers the interface, PostgreSQL stores
          the catalog and performance records, Docker runs the services, and
          Gemini provides the optional provider fallback.
        </p>
      </section>
    </article>
  );
}
