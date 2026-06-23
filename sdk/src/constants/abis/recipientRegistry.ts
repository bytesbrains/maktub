/** ABI for the RecipientRegistry contract — immutable PRE public key registry. */
export const RECIPIENT_REGISTRY_ABI = [
  // Errors
  "error AlreadyRegistered()",
  "error EmptyPublicKey()",
  "error NotRegistered()",

  // Events
  "event RecipientRegistered(address indexed recipient, bytes prePublicKey)",
  "event PrePublicKeyUpdated(address indexed recipient, bytes newPrePublicKey)",

  // Functions
  "function register(bytes prePublicKey)",
  "function updatePrePublicKey(bytes newPrePublicKey)",
  "function isRegistered(address account) view returns (bool)",
  "function getPrePublicKey(address account) view returns (bytes)",
] as const;
