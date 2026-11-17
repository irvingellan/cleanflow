import { defineSecret, defineString } from "firebase-functions/params";

export const githubFeedbackToken = defineSecret("GITHUB_FEEDBACK_TOKEN");
export const devCenterDeveloperUids = defineSecret("DEV_CENTER_DEVELOPER_UIDS");
export const devCenterSandboxProjectId = defineString("DEV_CENTER_SANDBOX_PROJECT_ID", { default: "" });
export const managerReminderProviderParam = defineString("MANAGER_REMINDER_PROVIDER", { default: "fcm" });
