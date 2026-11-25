import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PropertyCleanerAccess } from "./PropertyCleanerAccess.jsx";
import {
  getPropertyAccessPhoto, listPropertyAccessPhotos, removePropertyAccessPhoto, uploadPropertyAccessPhoto,
} from "./propertyService.js";

vi.mock("./propertyService.js", () => ({
  getPropertyAccessPhoto: vi.fn(),
  listPropertyAccessPhotos: vi.fn(),
  removePropertyAccessPhoto: vi.fn(),
  uploadPropertyAccessPhoto: vi.fn(),
}));

afterEach(() => { vi.restoreAllMocks(); });

it("lists previews, uploads a captioned photo, and confirms removal inside the access section", async () => {
  localStorage.setItem("cleanflow-language", "en");
  const photo = { id: "a".repeat(32), caption: "Side gate" };
  listPropertyAccessPhotos.mockResolvedValue([]);
  uploadPropertyAccessPhoto.mockResolvedValue({ photo });
  getPropertyAccessPhoto.mockResolvedValue({ contentType: "image/jpeg", dataBase64: "/9j/2Q==" });
  removePropertyAccessPhoto.mockResolvedValue({ removed: true });
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  const user = userEvent.setup();
  render(<TranslationProvider><PropertyCleanerAccess property={{ id: "house" }} onSave={vi.fn()} /></TranslationProvider>);
  expect(listPropertyAccessPhotos).not.toHaveBeenCalled();
  await user.click(screen.getByText("Photos for the cleaner"));
  expect(await screen.findByText(/Up to 8 photos/)).toBeVisible();
  const file = new File([new Uint8Array([255, 216, 255, 217])], "gate.jpg", { type: "image/jpeg" });
  const upload = await screen.findByLabelText("Add photo");
  expect(upload).toHaveAttribute("accept", "image/*");
  await user.type(screen.getByLabelText("Caption (optional)"), photo.caption);
  await user.upload(upload, file);
  expect(await screen.findByRole("img", { name: photo.caption })).toHaveAttribute("src", "data:image/jpeg;base64,/9j/2Q==");
  expect(listPropertyAccessPhotos).toHaveBeenCalledWith("house");
  expect(uploadPropertyAccessPhoto).toHaveBeenCalledWith({
    propertyId: "house", contentType: "image/jpeg", dataBase64: "/9j/2Q==", caption: photo.caption,
  });
  expect(getPropertyAccessPhoto).toHaveBeenCalledWith("house", photo.id);
  const remove = screen.getByRole("button", { name: "Remove photo" });
  await user.click(remove);
  expect(removePropertyAccessPhoto).not.toHaveBeenCalled();
  await user.click(remove);
  await waitFor(() => expect(screen.queryByText(photo.caption)).toBeNull());
  expect(confirm).toHaveBeenCalledWith("Remove this access photo?");
  expect(removePropertyAccessPhoto).toHaveBeenCalledWith("house", photo.id);
});
