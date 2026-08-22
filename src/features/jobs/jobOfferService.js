import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

export async function createJobOffers({ jobId, cleaners }) {
  const batch = writeBatch(db);

  for (const cleaner of cleaners) {
    batch.set(
      doc(
        db,
        "organizations",
        organizationId,
        "jobs",
        jobId,
        "offers",
        cleaner.id,
      ),
      {
        jobId,
        cleanerId: cleaner.id,
        cleanerName: cleaner.name,
        status: "PENDING",
        createdAt: serverTimestamp(),
      },
    );
  }

  await batch.commit();
}
