import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { requireOrganizationManager } from "../managerAuthorization.js";
import { db } from "../runtime/firebase.js";
import { defaultOrganizationId, organizationIdForRequest } from "../runtime/organization.js";
import { githubFeedbackToken } from "../runtime/params.js";

const githubFeedbackRepository = "irvingellan/cleanflow";
const feedbackMessageLimit = 3000;
const feedbackTypes = {
  suggestion: "Suggestion",
  bug: "Problem / Bug",
  other: "Other",
};

function optionalContextValue(value, maximumLength) {
  if (typeof value !== "string") {
    return "Not provided";
  }

  const normalizedValue = value.trim().replace(/\s+/g, " ");
  return normalizedValue ? normalizedValue.slice(0, maximumLength) : "Not provided";
}

function normalizedViewport(viewport) {
  const width = Number.isInteger(viewport?.width) ? viewport.width : null;
  const height = Number.isInteger(viewport?.height) ? viewport.height : null;

  if (!width || !height || width < 1 || height < 1 || width > 10000 || height > 10000) {
    return "Not provided";
  }

  return `${width} × ${height}`;
}

function feedbackIssueBody({ type, message, appVersion, screen, viewport, reporter, submittedAt }) {
  return [
    "## Feedback",
    "",
    message,
    "",
    "## Context",
    "",
    `- **Type:** ${feedbackTypes[type]}`,
    `- **App version:** ${appVersion}`,
    `- **Screen:** ${screen}`,
    `- **Submitted at:** ${submittedAt}`,
    `- **Reporter:** ${reporter}`,
    `- **Viewport:** ${viewport}`,
    "- **Source:** CleanFlow in-app feedback",
  ].join("\n");
}

export async function submitFeedback(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);

  const type = request.data?.type;
  const message = typeof request.data?.message === "string" ? request.data.message.trim() : "";

  if (!feedbackTypes[type]) {
    throw new HttpsError("invalid-argument", "Feedback type is invalid.");
  }

  if (!message || message.length > feedbackMessageLimit) {
    throw new HttpsError("invalid-argument", "Feedback message is invalid.");
  }

  const appVersion = optionalContextValue(request.data?.appVersion, 32);
  const screen = optionalContextValue(request.data?.screen, 80);
  const viewport = normalizedViewport(request.data?.viewport);
  if (organizationId !== defaultOrganizationId) {
    await db.collection("organizations").doc(organizationId).collection("feedbackReports").add({
      message, screen, appVersion, viewport, createdByUid: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(), status: "NEW",
    });
    return { submitted: true };
  }

  const reporter = request.auth.token.email || request.auth.uid;
  const submittedAt = new Date().toISOString();
  const repositoryToken = githubFeedbackToken.value();

  if (!repositoryToken) {
    logger.error("Feedback submission secret is not configured.");
    throw new HttpsError("failed-precondition", "Feedback submission is not configured.");
  }

  const githubResponse = await fetch(
    `https://api.github.com/repos/${githubFeedbackRepository}/issues`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${repositoryToken}`,
        "Content-Type": "application/json",
        "User-Agent": "CleanFlow-Feedback",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: `[Feedback] ${feedbackTypes[type]} · ${screen}`,
        body: feedbackIssueBody({
          type,
          message,
          appVersion,
          screen,
          viewport,
          reporter,
          submittedAt,
        }),
      }),
    },
  );

  if (!githubResponse.ok) {
    logger.error("GitHub rejected a feedback issue request.", {
      status: githubResponse.status,
      requestId: githubResponse.headers.get("x-github-request-id") || "not-provided",
    });
    throw new HttpsError("internal", "Unable to submit feedback.");
  }

  const issue = await githubResponse.json();
  logger.info("CleanFlow feedback issue created.", { issueNumber: issue.number });

  return { submitted: true };
}
