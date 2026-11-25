import { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";
import * as photos from "../propertyAccessPhotos.js";
import { db, organizationId } from "../runtime/firebase.js";

function privatePhotoCall(operation) {
  return async (request) => {
    try {
      return await operation(db, getStorage(), request, organizationId);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      // Provider errors may contain the private object path.
      throw new HttpsError("unavailable", "The access photo operation is temporarily unavailable.");
    }
  };
}

export const uploadPropertyAccessPhoto = privatePhotoCall(photos.uploadPropertyAccessPhoto);
export const removePropertyAccessPhoto = privatePhotoCall(photos.removePropertyAccessPhoto);
export const getPropertyAccessPhoto = privatePhotoCall(photos.getPropertyAccessPhoto);
export const getMyJobAccessPhoto = privatePhotoCall(photos.getMyJobAccessPhoto);
