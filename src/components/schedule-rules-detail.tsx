import type {
  SchedulingGuideAudience,
  SchedulingGuideSection,
} from "@/lib/scheduling-rules-copy";
import { getSchedulingGuide } from "@/lib/scheduling-rules-copy";
import { Fragment } from "react";

function FlowBlock({
  flowCaption,
  flowSteps,
}: Pick<SchedulingGuideSection, "flowCaption" | "flowSteps">) {
  if (!flowSteps?.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-indigo-200/80 bg-white/55 px-3 py-3 sm:px-4">
      {flowCaption ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{flowCaption}</p>
      ) : null}
      <div className={flowCaption ? "mt-2" : ""}>
        <div className="hidden gap-2 md:flex md:flex-wrap md:items-stretch">
          {flowSteps.map((step, i) => (
            <Fragment key={i}>
              <div className="flex min-w-[8rem] max-w-[14rem] flex-1 flex-col justify-center rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-sm leading-snug font-medium text-indigo-950">
                <span className="mb-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span>{step}</span>
              </div>
              {i < flowSteps.length - 1 ? (
                <div
                  className="flex items-center px-1 text-lg font-semibold text-indigo-400"
                  aria-hidden
                >
                  →
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>
        <ol className="space-y-0 md:hidden">
          {flowSteps.map((step, i) => (
            <li key={i} className="list-none">
              <div className="flex gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <p className="text-sm font-medium leading-relaxed text-indigo-950">{step}</p>
              </div>
              {i < flowSteps.length - 1 ? (
                <div className="flex justify-center py-1.5 text-base text-indigo-400" aria-hidden>
                  ↓
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function GuideSectionBody({ section }: { section: SchedulingGuideSection }) {
  return (
    <>
      {(section.paragraphs ?? []).map((p, i) => (
        <p key={i} className="mt-2 text-sm leading-relaxed text-indigo-950 first:mt-0">
          {p}
        </p>
      ))}
      <FlowBlock flowCaption={section.flowCaption} flowSteps={section.flowSteps} />
      {section.bullets?.length ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-indigo-950">
          {section.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      {(section.paragraphsAfterBullets ?? []).map((p, i) => (
        <p key={`after-${i}`} className="mt-2 text-sm leading-relaxed text-indigo-950">
          {p}
        </p>
      ))}
      {(section.notes ?? []).map((n, i) => (
        <p key={`note-${i}`} className="mt-2 text-sm leading-relaxed text-indigo-800/90">
          {n}
        </p>
      ))}
    </>
  );
}

export function ScheduleRulesDetail({
  audience,
  className,
  scrollClassName = "max-h-[min(60vh,24rem)] overflow-y-auto",
  showDocumentTitle = false,
}: {
  audience: SchedulingGuideAudience;
  className?: string;
  /** 親の summary だけで十分なときは false */
  showDocumentTitle?: boolean;
  scrollClassName?: string;
}) {
  const doc = getSchedulingGuide(audience);
  return (
    <div className={[scrollClassName, className].filter(Boolean).join(" ")}>
      {showDocumentTitle ? (
        <p className="text-sm font-semibold text-indigo-900">{doc.documentTitle}</p>
      ) : (
        <span className="sr-only">{doc.documentTitle}</span>
      )}
      <div className="space-y-5">
        {doc.sections.map((section) => (
          <section
            key={`${section.number}-${section.title}`}
            className="border-b border-indigo-100 pb-5 last:border-b-0 last:pb-0"
          >
            <h3 className="text-base font-bold leading-snug text-indigo-950">
              <span className="font-bold text-indigo-600">{section.number}.</span> {section.title}
            </h3>
            <GuideSectionBody section={section} />
          </section>
        ))}
      </div>
    </div>
  );
}
