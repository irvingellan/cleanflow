const content = {
  productName: "CleanFlow",
  productDescription: "Operations platform",
  buildLabel: "Foundation build",
};

const jobs = [
  {
    id: 1,
    name: "Pacific Beach Condo",
    status: "Unassigned",
  },
  {
    id: 2,
    name: "La Jolla House",
    status: "In Progress",
  },
  {
    id: 3,
    name: "Mission Beach",
    status: "Offered",
  },
];

function App() {
  return (
    <main className="app-shell">
      <section className="foundation" aria-labelledby="page-title">
        <header className="foundation__header">
          <div>
            <p className="eyebrow">{content.productDescription}</p>
            <h1 id="page-title">{content.productName}</h1>
          </div>
          <span className="badge">{content.buildLabel}</span>
        </header>

        {jobs.map((job) => (
          <article
            key={job.id}
            className="job-card"
            aria-label={`${job.name} - ${job.status}`}
          >
            <h2>{job.name}</h2>

            <p className="job-card__status">
              <span className="status-dot" aria-hidden="true" />
              {job.status}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
