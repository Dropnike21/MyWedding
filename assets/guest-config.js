/**
 * Invitation access remains OFF until Firebase Authentication,
 * App Check and the callable backend have been deployed and tested.
 * Never put secrets, invitation code lists or Google Drive OAuth tokens here.
 */
export const guestAccessConfig = Object.freeze({
  enabled: false,
  previewTestEnabled: true,
  previewTestCode: "AJ27-TEST",
  plannerEnabled: true,
  region: "asia-southeast1",
  callableName: "redeemInvitation",
  driveUploadsEnabled: false,
  beginPhotoUploadCallable: "beginGuestPhotoUpload",
  finalizePhotoUploadCallable: "finalizeGuestPhotoUpload",
  cancelPhotoUploadCallable: "cancelGuestPhotoUpload",
  appCheckSiteKey: "6LdWTAkuAAAAAHkNSBZn8MTjXd_cFE9B-rEXuOLR",
});
