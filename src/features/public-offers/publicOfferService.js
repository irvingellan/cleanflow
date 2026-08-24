const publicOfferApiPath = "/api/public-offer";

export class PublicOfferRequestError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function responseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function request(path, options) {
  const response = await fetch(path, options);
  const body = await responseBody(response);

  if (!response.ok) {
    throw new PublicOfferRequestError(body.error || "request_failed");
  }

  return body;
}

export async function getPublicOffer(token) {
  const query = new URLSearchParams({ token });
  const body = await request(`${publicOfferApiPath}?${query}`, {
    headers: { Accept: "application/json" },
    credentials: "omit",
  });

  if (!body.offer || typeof body.offer !== "object") {
    throw new PublicOfferRequestError("request_failed");
  }

  return body.offer;
}

export async function respondToPublicOffer({ token, status }) {
  if (status !== "INTERESTED" && status !== "DECLINED") {
    throw new Error("Invalid public offer response status.");
  }

  const body = await request(publicOfferApiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token, status }),
    credentials: "omit",
  });

  if (!["INTERESTED", "DECLINED"].includes(body.status)) {
    throw new PublicOfferRequestError("request_failed");
  }

  return body;
}
