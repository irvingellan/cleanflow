import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db, storage } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";
const proofUploadTimeoutMs = 60_000;
const proofMetadataTimeoutMs = 20_000;
export const maximumPayoutProofSizeBytes = 10 * 1024 * 1024;
export const acceptedPayoutProofContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function proofError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function proofStoragePath(payoutId) {
  return `organizations/${organizationId}/payouts/${payoutId}/proof/payment-proof`;
}

function logProofUpload(stage, details = {}) {
  console.info(`[CleanFlow] Payout proof ${stage}.`, details);
}

function withTimeout(operation, timeoutMs, timeoutError) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(timeoutError), timeoutMs);

    operation.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function validatePayoutProofFile(file) {
  if (!file) {
    return proofError("missing-proof", "Choose an image proof.");
  }

  if (!acceptedPayoutProofContentTypes.includes(file.type)) {
    return proofError("invalid-proof-type", "Choose a JPEG, PNG, WebP, HEIC, or HEIF image.");
  }

  if (file.size > maximumPayoutProofSizeBytes) {
    return proofError("proof-too-large", "Choose an image no larger than 10 MB.");
  }

  return null;
}

export async function uploadPayoutProof({ payoutId, file, onProgress }) {
  const validationError = validatePayoutProofFile(file);

  if (!payoutId) {
    throw proofError("missing-payout", "A payout is required.");
  }

  if (validationError) {
    throw validationError;
  }

  const storagePath = proofStoragePath(payoutId);
  const uploadTask = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: file.type,
  });

  logProofUpload("upload started", { contentType: file.type, sizeBytes: file.size });

  try {
    await new Promise((resolve, reject) => {
      let isSettled = false;
      const finish = (callback, value) => {
        if (isSettled) return;
        isSettled = true;
        window.clearTimeout(timeoutId);
        callback(value);
      };
      const timeoutId = window.setTimeout(() => {
        uploadTask.cancel();
        finish(
          reject,
          proofError("proof-upload-timeout", "The proof upload took too long."),
        );
      }, proofUploadTimeoutMs);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          if (typeof onProgress === "function") {
            onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          }
        },
        (error) => finish(reject, error),
        () => finish(resolve),
      );
    });
  } catch (error) {
    logProofUpload("upload failed", { code: error.code || "unknown" });
    throw error;
  }

  logProofUpload("upload completed");

  // The payout transaction is already complete. Updating proof metadata separately means an
  // upload can be retried without creating a second payout or touching linked Jobs.
  try {
    await withTimeout(
      updateDoc(doc(db, "organizations", organizationId, "payouts", payoutId), {
        proofStoragePath: storagePath,
        proofFileName: file.name || "payment-proof",
        proofContentType: file.type,
        proofSizeBytes: file.size,
        proofUploadedAt: serverTimestamp(),
      }),
      proofMetadataTimeoutMs,
      proofError("proof-metadata-timeout", "Saving proof metadata took too long."),
    );
  } catch (error) {
    logProofUpload("metadata update failed", { code: error.code || "unknown" });
    throw error;
  }

  logProofUpload("metadata update completed");
}

export async function getPayoutProofUrl(storagePath) {
  if (!storagePath) {
    throw proofError("missing-proof", "This payout has no proof.");
  }

  // Only the protected Storage path is persisted. A manager requests a view URL on demand;
  // no download URL is stored in Firestore as the proof reference.
  return getDownloadURL(ref(storage, storagePath));
}
