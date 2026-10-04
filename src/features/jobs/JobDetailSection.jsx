// Presentation only: opening a section never invokes a domain operation.
// Content stays mounted so collapsing a section cannot discard a pending form.
export function JobDetailSection({ title, children, jobId }) {
  return (
    <details key={jobId} className="job-detail-section">
      <summary>{title}</summary>
      <div className="job-detail-section__content">{children}</div>
    </details>
  );
}

export function revealJobDetailSection(element) {
  const section = element?.closest("details.job-detail-section");
  if (section) section.open = true;
}
