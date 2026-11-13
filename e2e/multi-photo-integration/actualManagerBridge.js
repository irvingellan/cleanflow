// Test-only transport adapter: every result comes from the real authenticated
// alternate-port callable. No fabricated projection, image or success response.
export const getChecklistEvidence = (...args) => window.actualManagerEvidence(...args);
export const getClientReportCapability = async jobId => (await window.actualManagerCallable('getClientReportCapability', { jobId })).capability;
export const createClientReport = jobId => window.actualManagerCallable('createClientReport', { jobId });
export const revokeClientReport = jobId => window.actualManagerCallable('revokeClientReport', { jobId });
export const updateClientReport = async (jobId, options) => (await window.actualManagerCallable('createClientReport', { jobId, update: true, ...options })).capability;
export const correctChecklistAnswer = (jobId, kind, itemId, answer) => window.actualManagerCallable('correctChecklistAnswer', { jobId, kind, itemId, answer });
export const setReportPhotoVisibility = (jobId, evidenceId, hidden, reason) => window.actualManagerCallable('setReportPhotoVisibility', { jobId, evidenceId, hidden, reason });
