const publicOfferApiPath = "/api/public-offer";
export const publicOfferLoadDeadlineMs = 15_000;

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
  const controller = new AbortController();
  let timer;
  try {
    const body = await Promise.race([
      request(`${publicOfferApiPath}?${query}`, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal: controller.signal,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new PublicOfferRequestError("request_failed"));
          controller.abort();
        }, publicOfferLoadDeadlineMs);
      }),
    ]);
    if (!body.offer || typeof body.offer !== "object") {
      throw new PublicOfferRequestError("request_failed");
    }
    return body.offer;
  } finally {
    clearTimeout(timer);
  }
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

export async function acknowledgePublicOfferAssignment({ token }) {
  const body = await request(publicOfferApiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token, action: "ACKNOWLEDGE_ASSIGNMENT" }),
    credentials: "omit",
  });

  if (body.assignmentAcknowledgment !== "CONFIRMED") {
    throw new PublicOfferRequestError("request_failed");
  }

  return body;
}
