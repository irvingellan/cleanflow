import { JobDetailSection } from "./JobDetailSection.jsx";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { formatIssueCategory } from "../issues/issuePresentation.js";
import { formatCreatedAt, hasValue } from "../../lib/presentation.js";

/** The Issues section of Job Detail: the issue list and the resolution form. */
export function JobIssuesSection({
  job,
  translate,
  language,
  issuesSectionRef,
  onRefreshIssues,
  isLoadingIssues,
  hasIssuesError,
  sortedIssues,
  resolvingIssueId,
  openResolutionForm,
  resolveSelectedIssue,
  resolutionNote,
  setResolutionNote,
  resolutionError,
  isResolvingIssue,
  closeResolutionForm,
}) {
  return (
    <JobDetailSection jobId={job.id} title={translate("jobs.section.issues")}>
    <section ref={issuesSectionRef} tabIndex={-1} className="issues-section" aria-labelledby="issues-title">
      <div className="issues-section__header">
        <h3 id="issues-title">{translate("issues.title")}</h3>
        <button
          className="button"
          type="button"
          onClick={onRefreshIssues}
          disabled={isLoadingIssues}
        >
          {translate("issues.refresh")}
        </button>
      </div>

      {isLoadingIssues && (
        <StateCard message={translate("issues.loading")} status="status" />
      )}

      {!isLoadingIssues && hasIssuesError && (
        <StateCard
          message={translate("issues.error")}
          status="alert"
          isError
        />
      )}

      {!isLoadingIssues && !hasIssuesError && sortedIssues.length === 0 && (
        <StateCard message={translate("issues.empty")} />
      )}

      {!isLoadingIssues && !hasIssuesError && sortedIssues.length > 0 && (
        <div className="issue-list">
          {sortedIssues.map((issue) => {
            const issueCreatedAt = formatCreatedAt(issue.createdAt, language);
            const resolvedAt = formatCreatedAt(issue.resolvedAt, language);
            const isOpen = issue.status === "OPEN";
            const isResolutionFormVisible = resolvingIssueId === issue.id;

            return (
              <article key={issue.id} className="issue-card">
                <div className="issue-card__header">
                  <strong>
                    {formatIssueCategory(issue.category, translate)}
                  </strong>
                  <span className="status-badge">
                    {issue.status === "RESOLVED"
                      ? translate("status.resolved")
                      : translate("status.open")}
                  </span>
                </div>
                <p>{issue.description || translate("common.notProvided")}</p>
                <span>
                  {translate("issues.reportedBy", {
                    cleaner:
                      issue.cleanerName || translate("common.notProvided"),
                  })}
                </span>
                {issueCreatedAt && (
                  <span>
                    {translate("issues.reported")} {issueCreatedAt}
                  </span>
                )}
                {resolvedAt && (
                  <span>
                    {translate("issues.resolved")} {resolvedAt}
                  </span>
                )}
                {issue.status === "RESOLVED" &&
                  hasValue(issue.resolutionNote) && (
                    <p className="issue-card__resolution-note">
                      {translate("issues.resolution")}: {issue.resolutionNote}
                    </p>
                  )}

                {isOpen && !isResolutionFormVisible && (
                  <div>
                    <button
                      className="button"
                      type="button"
                      onClick={() => openResolutionForm(issue)}
                    >
                      {translate("issues.resolve")}
                    </button>
                  </div>
                )}

                {isOpen && isResolutionFormVisible && (
                  <form
                    className="issue-resolution-form"
                    onSubmit={resolveSelectedIssue}
                  >
                    <p className="issue-resolution-form__summary">
                      <strong>
                        {formatIssueCategory(issue.category, translate)}
                      </strong>
                      <span>
                        {issue.description || translate("common.notProvided")}
                      </span>
                    </p>
                    <label>
                      {translate("issues.resolutionNote")}
                      <textarea
                        name="resolutionNote"
                        value={resolutionNote}
                        onChange={(event) =>
                          setResolutionNote(event.target.value)
                        }
                        rows="3"
                      />
                    </label>
                    {resolutionError && (
                      <p className="form-error" role="alert">
                        {resolutionError}
                      </p>
                    )}
                    <div className="button-row">
                      <button
                        className="button"
                        type="button"
                        disabled={isResolvingIssue}
                        onClick={closeResolutionForm}
                      >
                        {translate("common.cancel")}
                      </button>
                      <button
                        className="button button--primary"
                        type="submit"
                        disabled={isResolvingIssue}
                      >
                        {isResolvingIssue
                          ? translate("issues.resolving")
                          : translate("issues.resolve")}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>

    </JobDetailSection>
  );
}
