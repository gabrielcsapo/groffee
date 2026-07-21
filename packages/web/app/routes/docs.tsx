import { ApiDocs } from "@groffee/ui";

export default function Docs() {
  return (
    <div className="space-y-8">
      <section className="border border-border rounded-lg bg-surface p-5 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent mb-2">
          documentation
        </p>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="max-w-2xl">
            <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-text-primary">
              Run the forge. Know the API.
            </h1>
            <p className="mt-3 text-sm sm:text-base text-text-secondary leading-relaxed">
              Start with the operator guides for installation, deployment, SSH, LFS, and
              configuration. Use the reference below when you are integrating with Groffee.
            </p>
          </div>
          <a href="#getting-started" className="btn-primary whitespace-nowrap">
            Start locally
          </a>
        </div>
        <nav aria-label="Documentation sections" className="mt-6 grid sm:grid-cols-3 gap-2">
          {[
            ["getting started", "install and create the first admin", "#getting-started"],
            ["deployment", "configure storage, ports, and Docker", "#deployment"],
            ["architecture", "understand the web, database, and Git layers", "#architecture"],
          ].map(([label, description, href]) => (
            <a
              key={label}
              href={href}
              className="group rounded-md border border-border p-3 hover:border-accent/40 hover:no-underline"
            >
              <span className="block font-mono text-xs text-text-primary group-hover:text-accent">
                {label} →
              </span>
              <span className="block mt-1 text-xs text-text-secondary">{description}</span>
            </a>
          ))}
        </nav>
      </section>
      <section className="grid lg:grid-cols-3 gap-4" aria-label="Operator guides">
        <article id="getting-started" className="card scroll-mt-20 p-5">
          <p className="font-mono text-[11px] text-accent mb-2">getting started</p>
          <h2 className="text-lg font-semibold text-text-primary">Run your first forge</h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            Install Node.js 22+, pnpm, Git, and Git LFS. Start Groffee from the workspace; the first
            account registered becomes the instance administrator.
          </p>
          <pre className="mt-4 rounded-md border border-border bg-surface-secondary p-3 overflow-x-auto text-xs">
            <code>{`pnpm install
pnpm dev`}</code>
          </pre>
        </article>
        <article id="deployment" className="card scroll-mt-20 p-5">
          <p className="font-mono text-[11px] text-accent mb-2">deployment</p>
          <h2 className="text-lg font-semibold text-text-primary">Keep the data close</h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            Persist the data directory, publish the web and SSH ports, and set the external URL so
            clone links and LFS authentication point back to this instance.
          </p>
          <pre className="mt-4 rounded-md border border-border bg-surface-secondary p-3 overflow-x-auto text-xs">
            <code>{`PORT=3000
SSH_PORT=2223
DATA_DIR=./data
EXTERNAL_URL=https://git.example.com`}</code>
          </pre>
        </article>
        <article id="architecture" className="card scroll-mt-20 p-5">
          <p className="font-mono text-[11px] text-accent mb-2">architecture</p>
          <h2 className="text-lg font-semibold text-text-primary">Ordinary parts, clear seams</h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            The web package serves the UI, API, and SSH endpoint. SQLite stores application state;
            bare repositories, LFS objects, Pages, and pipeline artifacts stay on disk.
          </p>
          <a href="#api-reference" className="inline-block mt-4 font-mono text-xs">
            continue to the API reference →
          </a>
        </article>
      </section>
      <div id="api-reference" className="scroll-mt-20">
        <ApiDocs />
      </div>
    </div>
  );
}
