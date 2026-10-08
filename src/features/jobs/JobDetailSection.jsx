// Presentation only: opening a section never invokes a domain operation.
// Content stays mounted so collapsing a section cannot discard a pending form.
import { useId } from "react";

export function JobDetailSection({ title, children, jobId, summary }) {
  const descriptionId = useId();
  return (
    <details key={jobId} className="job-detail-section">
      {summary ? <summary aria-label={title} aria-describedby={descriptionId}>
        <span className="job-v2-disclosure-heading">
          <span className="job-v2-disclosure-title">{title}</span>
          <span id={descriptionId} className="job-v2-disclosure-summary">{summary}</span>
        </span>
      </summary> : <summary>{title}</summary>}
      <div className="job-detail-section__content">{children}</div>
    </details>
  );
}

export function revealJobDetailSection(element) {
  const section = element?.closest("details.job-detail-section");
  if (section) section.open = true;
}
