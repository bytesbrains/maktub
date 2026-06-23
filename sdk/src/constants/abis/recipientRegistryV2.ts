/** ABI for the RecipientRegistryV2 contract — typed key slots (Flash substrate). */
export const RECIPIENT_REGISTRY_V2_ABI = [
  // Constructor
  "constructor(address _v1)",

  // Errors
  "error AlreadyRegistered()",
  "error NotRegistered()",
  "error InvalidKeyLength(uint256 length)",
  "error InvalidKeyPrefix(bytes1 prefix)",

  // Write functions
  "function register(bytes encPubKey, bytes ratchetPubKey)",
  "function setEncPubKey(bytes newEncPubKey)",
  "function setRatchetPubKey(bytes newRatchetPubKey)",
  "function setExtKey(bytes32 keyType, bytes key)",

  // Read functions
  "function isRegistered(address account) view returns (bool)",
  "function isRegisteredV2(address account) view returns (bool)",
  "function isFlashEligible(address account) view returns (bool)",
  "function getEncPubKey(address account) view returns (bytes)",
  "function getRatchetPubKey(address account) view returns (bytes)",
  "function getRecipient(address account) view returns (tuple(bytes encPubKey, bytes ratchetPubKey, uint64 encUpdatedAt, uint64 ratchetUpdatedAt))",
  "function getExtKey(address account, bytes32 keyType) view returns (bytes)",
  "function extKeyUpdatedAt(address account, bytes32 keyType) view returns (uint64)",
  "function v1() view returns (address)",
  "function COMPRESSED_KEY_LENGTH() view returns (uint256)",
  "function UNCOMPRESSED_KEY_LENGTH() view returns (uint256)",

  // Events
  "event RecipientRegisteredV2(address indexed recipient, bytes encPubKey, bytes ratchetPubKey)",
  "event EncPubKeyUpdated(address indexed recipient, bytes newEncPubKey)",
  "event RatchetPubKeyUpdated(address indexed recipient, bytes newRatchetPubKey)",
  "event ExtKeyUpdated(address indexed recipient, bytes32 indexed keyType, bytes newKey)",
] as const;
