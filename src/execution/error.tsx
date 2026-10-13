"use client";

import { Section, Shell } from "./components";

export function ErrorView({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Shell>
      <Section label="something went wrong">
        <p className="ex-lead">The execution data couldn&apos;t be loaded right now.</p>
        <button className="action-btn ex-small-btn" type="button" onClick={reset}>
          try again
        </button>
      </Section>
    </Shell>
  );
}
