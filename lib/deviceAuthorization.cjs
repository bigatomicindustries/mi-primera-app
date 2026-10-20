function isAuthorizedMobileDevice(device, expectedId) {
  return Boolean(
    device &&
    typeof expectedId === "string" &&
    device.id === expectedId &&
    typeof device.business_id === "string" &&
    device.business_id.length > 0 &&
    device.status === "active" &&
    typeof device.linked_at === "string" &&
    device.linked_at.length > 0 &&
    device.revoked_at === null
  );
}

module.exports = { isAuthorizedMobileDevice };
