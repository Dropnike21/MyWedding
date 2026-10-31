/**
 * Invitation access remains OFF until Firebase Authentication,
 * App Check and the callable backend have been deployed and tested.
 * Never put secrets, invitation code lists or Google Drive OAuth tokens here.
 */
export const guestAccessConfig = Object.freeze({
  enabled: false,
  plannerEnabled: true,
  region: "asia-southeast1",
  callableName: "redeemInvitation",
  appCheckSiteKey: "",
});
