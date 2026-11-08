/**
 * Guest invitation links use real Firebase verification and uploads.
 * Valid guest codes are issued only by authenticated wedding owners.
 * The backend must be deployed before these features work.
 * Never put secrets, invitation code lists or Google Drive OAuth tokens here.
 */
export const guestAccessConfig = Object.freeze({
  enabled: true,
  previewTestEnabled: false,
  plannerEnabled: true,
  region: "asia-southeast1",
  callableName: "redeemInvitation",
  driveUploadsEnabled: true,
  beginPhotoUploadCallable: "beginGuestPhotoUpload",
  finalizePhotoUploadCallable: "finalizeGuestPhotoUpload",
  cancelPhotoUploadCallable: "cancelGuestPhotoUpload",
  appCheckSiteKey: "6LdWTAkuAAAAAHkNSBZn8MTjXd_cFE9B-rEXuOLR",
});
