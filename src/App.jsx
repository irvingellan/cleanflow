import { useEffect, useState } from "react";
import { getCleaners } from "./features/cleaners/cleanerService.js";
import { createJobOffers } from "./features/jobs/jobOfferService.js";
import { createJob, getJobs } from "./features/jobs/jobService.js";
import { getProperties } from "./features/properties/propertyService.js";

const content = {
  productName: "CleanFlow",
  productDescription: "Operations platform",
  buildLabel: "Foundation build",
  propertiesNavigation: "Properties",
  jobsNavigation: "Jobs",
  loadingProperties: "Loading properties…",
  loadingJobs: "Loading jobs…",
  loadingCleaners: "Loading cleaners…",
  propertyErrorMessage: "Unable to load properties.",
  jobErrorMessage: "Unable to load jobs.",
  cleanerErrorMessage: "Unable to load cleaners.",
  emptyProperties: "No properties found.",
  emptyJobs: "No jobs found.",
  emptyCleaners: "No active cleaners found.",
  propertyLabel: "Property",
  unnamedProperty: "Unnamed property",
  missingValue: "Not provided",
  propertyDetails: "Property details",
  jobDetails: "Job details",
  createCleaning: "Create cleaning",
  createCleaningError: "Unable to create cleaning.",
  successTitle: "Cleaning created",
  offerToCleaners: "Offer to cleaners",
  sendOffers: "Send offers",
  sendOffersError: "Unable to send offers.",
  offersSent: "Offers sent",
};

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function formatPrice(value) {
  if (!hasValue(value)) {
    return content.missingValue;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value) {
  if (!value) {
    return content.missingValue;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

function formatCreatedAt(value) {
  if (!value || typeof value.toDate !== "function") {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value.toDate());
}

function App() {
  const [properties, setProperties] = useState([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [hasPropertyError, setHasPropertyError] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [hasJobError, setHasJobError] = useState(false);
  const [cleaners, setCleaners] = useState([]);
  const [isLoadingCleaners, setIsLoadingCleaners] = useState(false);
  const [hasCleanerError, setHasCleanerError] = useState(false);
  const [activeSection, setActiveSection] = useState("properties");
  const [view, setView] = useState("property-list");
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [createdJob, setCreatedJob] = useState(null);
  const [offersSentCount, setOffersSentCount] = useState(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadProperties() {
      try {
        const loadedProperties = await getProperties();

        if (isCurrent) {
          setProperties(loadedProperties);
        }
      } catch {
        if (isCurrent) {
          setHasPropertyError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingProperties(false);
        }
      }
    }

    loadProperties();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (view !== "job-list") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingJobs(true);
    setHasJobError(false);

    async function loadJobs() {
      try {
        const loadedJobs = await getJobs();

        if (isCurrent) {
          setJobs(loadedJobs);
        }
      } catch {
        if (isCurrent) {
          setHasJobError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingJobs(false);
        }
      }
    }

    loadJobs();

    return () => {
      isCurrent = false;
    };
  }, [view]);

  useEffect(() => {
    if (view !== "offer-cleaners") {
      return undefined;
    }

    let isCurrent = true;
    setIsLoadingCleaners(true);
    setHasCleanerError(false);

    async function loadCleaners() {
      try {
        const loadedCleaners = await getCleaners();

        if (isCurrent) {
          setCleaners(loadedCleaners);
        }
      } catch {
        if (isCurrent) {
          setHasCleanerError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingCleaners(false);
        }
      }
    }

    loadCleaners();

    return () => {
      isCurrent = false;
    };
  }, [view]);

  function showProperties() {
    setActiveSection("properties");
    setSelectedProperty(null);
    setSelectedJob(null);
    setCreatedJob(null);
    setOffersSentCount(null);
    setView("property-list");
  }

  function showJobs() {
    setActiveSection("jobs");
    setSelectedProperty(null);
    setSelectedJob(null);
    setOffersSentCount(null);
    setView("job-list");
  }

  function openProperty(property) {
    setActiveSection("properties");
    setSelectedProperty(property);
    setView("property-detail");
  }

  function openJob(job) {
    setActiveSection("jobs");
    setSelectedJob(job);
    setView("job-detail");
  }

  function showOfferCleaners() {
    setOffersSentCount(null);
    setView("offer-cleaners");
  }

  return (
    <main className="app-shell">
      <section className="foundation" aria-labelledby="page-title">
        <header className="foundation__header">
          <div className="brand-block">
            <p className="eyebrow">{content.productDescription}</p>
            <h1 id="page-title">{content.productName}</h1>
            <MainNavigation
              activeSection={activeSection}
              onShowProperties={showProperties}
              onShowJobs={showJobs}
            />
          </div>
          <span className="badge">{content.buildLabel}</span>
        </header>

        {view === "property-list" && (
          <PropertyList
            properties={properties}
            isLoading={isLoadingProperties}
            hasError={hasPropertyError}
            onSelect={openProperty}
          />
        )}

        {view === "property-detail" && selectedProperty && (
          <PropertyDetail
            property={selectedProperty}
            onBack={showProperties}
            onCreateCleaning={() => setView("create-cleaning")}
          />
        )}

        {view === "create-cleaning" && selectedProperty && (
          <CreateCleaningForm
            property={selectedProperty}
            onBack={() => setView("property-detail")}
            onCreated={(job) => {
              setCreatedJob(job);
              setView("create-success");
            }}
          />
        )}

        {view === "create-success" && createdJob && (
          <CleaningSuccess
            job={createdJob}
            onBack={showProperties}
            onViewJob={() => openJob(createdJob)}
          />
        )}

        {view === "job-list" && (
          <JobList
            jobs={jobs}
            isLoading={isLoadingJobs}
            hasError={hasJobError}
            onSelect={openJob}
          />
        )}

        {view === "job-detail" && selectedJob && (
          <JobDetail
            job={selectedJob}
            onBack={showJobs}
            onOfferToCleaners={showOfferCleaners}
          />
        )}

        {view === "offer-cleaners" && selectedJob && (
          <OfferCleaners
            job={selectedJob}
            cleaners={cleaners}
            isLoading={isLoadingCleaners}
            hasError={hasCleanerError}
            onBack={() => setView("job-detail")}
            onSent={(count) => {
              setOffersSentCount(count);
              setView("offers-success");
            }}
          />
        )}

        {view === "offers-success" && selectedJob && offersSentCount !== null && (
          <OffersSuccess
            count={offersSentCount}
            onBackToJob={() => setView("job-detail")}
            onBackToJobs={showJobs}
          />
        )}
      </section>
    </main>
  );
}

function MainNavigation({ activeSection, onShowProperties, onShowJobs }) {
  return (
    <nav className="main-navigation" aria-label="Main navigation">
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "properties" ? "page" : undefined}
        onClick={onShowProperties}
      >
        {content.propertiesNavigation}
      </button>
      <button
        className="navigation-button"
        type="button"
        aria-current={activeSection === "jobs" ? "page" : undefined}
        onClick={onShowJobs}
      >
        {content.jobsNavigation}
      </button>
    </nav>
  );
}

function PropertyList({ properties, isLoading, hasError, onSelect }) {
  if (isLoading) {
    return <StateCard message={content.loadingProperties} status="status" />;
  }

  if (hasError) {
    return <StateCard message={content.propertyErrorMessage} status="alert" isError />;
  }

  if (properties.length === 0) {
    return <StateCard message={content.emptyProperties} />;
  }

  return (
    <div className="property-list">
      {properties.map((property) => {
        const propertyName = property.name || content.unnamedProperty;

        return (
          <button
            key={property.id}
            className="property-card"
            type="button"
            aria-label={`View ${propertyName}`}
            onClick={() => onSelect(property)}
          >
            <span className="property-card__title">{propertyName}</span>

            <span className="property-card__label">
              <span className="status-dot" aria-hidden="true" />
              {content.propertyLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PropertyDetail({ property, onBack, onCreateCleaning }) {
  const propertyName = property.name || content.unnamedProperty;
  const clientName = property.clientName || content.missingValue;
  let activeStatus = content.missingValue;

  if (property.active === true) {
    activeStatus = "Active";
  }

  if (property.active === false) {
    activeStatus = "Inactive";
  }

  return (
    <section className="panel" aria-labelledby="property-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{content.propertyDetails}</p>
      <h2 id="property-detail-title" className="panel__title">
        {propertyName}
      </h2>

      <dl className="detail-list">
        <DetailItem label="Client" value={clientName} />
        {property.defaultClientPrice !== undefined && (
          <DetailItem
            label="Default client price"
            value={formatPrice(property.defaultClientPrice)}
          />
        )}
        {property.defaultCleanerPrice !== undefined && (
          <DetailItem
            label="Default cleaner price"
            value={formatPrice(property.defaultCleanerPrice)}
          />
        )}
        <DetailItem label="Status" value={activeStatus} />
      </dl>

      <div className="button-row">
        <button
          className="button button--primary"
          type="button"
          onClick={onCreateCleaning}
        >
          {content.createCleaning}
        </button>
      </div>
    </section>
  );
}

function CreateCleaningForm({ property, onBack, onCreated }) {
  const propertyName = property.name ?? "";
  const clientName = property.clientName ?? "";
  const displayPropertyName = propertyName || content.unnamedProperty;
  const displayClientName = clientName || content.missingValue;
  const [formValues, setFormValues] = useState({
    scheduledDate: "",
    clientPrice: property.defaultClientPrice ?? "",
    cleanerPayout: property.defaultCleanerPrice ?? "",
    notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setHasSaveError(false);

    const clientPrice =
      formValues.clientPrice === "" ? null : Number(formValues.clientPrice);
    const cleanerPayout =
      formValues.cleanerPayout === ""
        ? null
        : Number(formValues.cleanerPayout);
    const notes = formValues.notes.trim();

    try {
      const jobId = await createJob({
        propertyId: property.id,
        propertyName,
        clientName,
        scheduledDate: formValues.scheduledDate,
        clientPrice,
        cleanerPayout,
        notes,
      });

      onCreated({
        id: jobId,
        propertyId: property.id,
        propertyName,
        clientName,
        scheduledDate: formValues.scheduledDate,
        clientPrice,
        cleanerPayout,
        notes,
        operationalStatus: "UNASSIGNED",
      });
    } catch {
      setHasSaveError(true);
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="create-cleaning-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">New job</p>
      <h2 id="create-cleaning-title" className="panel__title">
        {content.createCleaning}
      </h2>

      <form className="cleaning-form" onSubmit={handleSubmit}>
        <label>
          Property name
          <input type="text" value={displayPropertyName} readOnly />
        </label>

        <label>
          Client name
          <input type="text" value={displayClientName} readOnly />
        </label>

        <label>
          Date
          <input
            type="date"
            name="scheduledDate"
            value={formValues.scheduledDate}
            onChange={updateField}
            required
          />
        </label>

        <div className="form-row">
          <label>
            Client price
            <input
              type="number"
              name="clientPrice"
              min="0"
              step="0.01"
              value={formValues.clientPrice}
              onChange={updateField}
            />
          </label>

          <label>
            Cleaner payout
            <input
              type="number"
              name="cleanerPayout"
              min="0"
              step="0.01"
              value={formValues.cleanerPayout}
              onChange={updateField}
            />
          </label>
        </div>

        <label>
          Notes
          <textarea
            name="notes"
            rows="4"
            value={formValues.notes}
            onChange={updateField}
          />
        </label>

        <label>
          Status
          <input type="text" value="UNASSIGNED" readOnly />
        </label>

        {hasSaveError && (
          <p className="form-error" role="alert">
            {content.createCleaningError}
          </p>
        )}

        <div className="button-row">
          <button
            className="button button--primary"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Creating…" : content.createCleaning}
          </button>
        </div>
      </form>
    </section>
  );
}

function CleaningSuccess({ job, onBack, onViewJob }) {
  return (
    <section className="panel success-panel" aria-labelledby="success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">Job saved</p>
      <h2 id="success-title" className="panel__title">
        {content.successTitle}
      </h2>
      <p className="success-panel__detail">
        {job.propertyName || content.unnamedProperty}
      </p>
      <p className="success-panel__date">{formatDate(job.scheduledDate)}</p>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onViewJob}>
          View job
        </button>
        <button className="button" type="button" onClick={onBack}>
          Back to properties
        </button>
      </div>
    </section>
  );
}

function JobList({ jobs, isLoading, hasError, onSelect }) {
  if (isLoading) {
    return <StateCard message={content.loadingJobs} status="status" />;
  }

  if (hasError) {
    return <StateCard message={content.jobErrorMessage} status="alert" isError />;
  }

  if (jobs.length === 0) {
    return <StateCard message={content.emptyJobs} />;
  }

  const sortedJobs = [...jobs].sort((firstJob, secondJob) =>
    (firstJob.scheduledDate || "").localeCompare(secondJob.scheduledDate || ""),
  );

  return (
    <section aria-labelledby="jobs-title">
      <p className="eyebrow">{content.jobsNavigation}</p>
      <h2 id="jobs-title" className="list-title">
        Cleaning jobs
      </h2>

      <div className="job-list">
        {sortedJobs.map((job) => (
          <button
            key={job.id}
            className="job-card"
            type="button"
            aria-label={`View job for ${job.propertyName || content.unnamedProperty}`}
            onClick={() => onSelect(job)}
          >
            <span className="job-card__date">{formatDate(job.scheduledDate)}</span>
            <span className="job-card__summary">
              <strong>{job.propertyName || content.unnamedProperty}</strong>
              <span>{job.clientName || content.missingValue}</span>
            </span>
            <span className="status-badge">
              {job.operationalStatus || content.missingValue}
            </span>
            {(hasValue(job.clientPrice) || hasValue(job.cleanerPayout)) && (
              <span className="job-card__prices">
                {hasValue(job.clientPrice) && <span>Client {formatPrice(job.clientPrice)}</span>}
                {hasValue(job.cleanerPayout) && (
                  <span>Cleaner {formatPrice(job.cleanerPayout)}</span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function JobDetail({ job, onBack, onOfferToCleaners }) {
  const createdAt = formatCreatedAt(job.createdAt);

  return (
    <section className="panel" aria-labelledby="job-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{content.jobDetails}</p>
      <h2 id="job-detail-title" className="panel__title">
        {job.propertyName || content.unnamedProperty}
      </h2>

      <dl className="detail-list">
        <DetailItem label="Property" value={job.propertyName || content.unnamedProperty} />
        <DetailItem label="Client" value={job.clientName || content.missingValue} />
        <DetailItem label="Scheduled date" value={formatDate(job.scheduledDate)} />
        <DetailItem
          label="Operational status"
          value={job.operationalStatus || content.missingValue}
        />
        <DetailItem label="Client price" value={formatPrice(job.clientPrice)} />
        <DetailItem label="Cleaner payout" value={formatPrice(job.cleanerPayout)} />
        {createdAt && <DetailItem label="Created" value={createdAt} />}
      </dl>

      {job.notes && (
        <section className="notes-section" aria-label="Notes">
          <h3>Notes</h3>
          <p>{job.notes}</p>
        </section>
      )}

      <div className="button-row">
        <button
          className="button button--primary"
          type="button"
          onClick={onOfferToCleaners}
        >
          {content.offerToCleaners}
        </button>
      </div>
    </section>
  );
}

function OfferCleaners({ job, cleaners, isLoading, hasError, onBack, onSent }) {
  const [selectedCleanerIds, setSelectedCleanerIds] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [hasSendError, setHasSendError] = useState(false);

  function toggleCleaner(cleanerId) {
    setSelectedCleanerIds((currentIds) =>
      currentIds.includes(cleanerId)
        ? currentIds.filter((id) => id !== cleanerId)
        : [...currentIds, cleanerId],
    );
  }

  async function sendOffers(event) {
    event.preventDefault();
    const selectedCleaners = cleaners.filter((cleaner) =>
      selectedCleanerIds.includes(cleaner.id),
    );

    if (selectedCleaners.length === 0) {
      return;
    }

    setIsSending(true);
    setHasSendError(false);

    try {
      await createJobOffers({ jobId: job.id, cleaners: selectedCleaners });
      onSent(selectedCleaners.length);
    } catch {
      setHasSendError(true);
      setIsSending(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="offer-cleaners-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">Job offers</p>
      <h2 id="offer-cleaners-title" className="panel__title">
        {content.offerToCleaners}
      </h2>
      <p className="offer-job-name">
        {job.propertyName || content.unnamedProperty}
      </p>

      {isLoading && <StateCard message={content.loadingCleaners} status="status" />}

      {!isLoading && hasError && (
        <StateCard message={content.cleanerErrorMessage} status="alert" isError />
      )}

      {!isLoading && !hasError && cleaners.length === 0 && (
        <StateCard message={content.emptyCleaners} />
      )}

      {!isLoading && !hasError && cleaners.length > 0 && (
        <form className="offer-form" onSubmit={sendOffers}>
          <div className="cleaner-list">
            {cleaners.map((cleaner) => (
              <label key={cleaner.id} className="cleaner-option">
                <input
                  type="checkbox"
                  checked={selectedCleanerIds.includes(cleaner.id)}
                  onChange={() => toggleCleaner(cleaner.id)}
                />
                <span>{cleaner.name || content.missingValue}</span>
              </label>
            ))}
          </div>

          {hasSendError && (
            <p className="form-error" role="alert">
              {content.sendOffersError}
            </p>
          )}

          <div className="button-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={selectedCleanerIds.length === 0 || isSending}
            >
              {isSending ? "Sending…" : content.sendOffers}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function OffersSuccess({ count, onBackToJob, onBackToJobs }) {
  return (
    <section className="panel success-panel" aria-labelledby="offers-success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">Job offers</p>
      <h2 id="offers-success-title" className="panel__title">
        {content.offersSent}
      </h2>
      <p className="success-panel__detail">
        {count} {count === 1 ? "cleaner" : "cleaners"} received an offer.
      </p>

      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onBackToJob}>
          Back to job
        </button>
        <button className="button" type="button" onClick={onBackToJobs}>
          Back to jobs
        </button>
      </div>
    </section>
  );
}

function StateCard({ message, status, isError = false }) {
  return (
    <p className={`state-card${isError ? " state-card--error" : ""}`} role={status}>
      {message}
    </p>
  );
}

function BackButton({ onClick }) {
  return (
    <button className="back-button" type="button" onClick={onClick}>
      ← Back
    </button>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default App;
