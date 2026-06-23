/** ABI for the MaktubFlash contract — the instant-triggered citizen. */
export const MAKTUB_FLASH_ABI = [
  // Constructor
  "constructor(uint256 _perRecipientFee, address _feeReceiver, address _recipientRegistry)",

  // Errors
  "error NoRecipients()",
  "error TooManyRecipients()",
  "error EmptyPayload()",
  "error PayloadTooLarge()",
  "error RecipientNotFlashEligible(address recipient)",
  "error WrongFee(uint256 expected, uint256 provided)",
  "error DuplicateRecipient(address recipient)",
  "error FlashNotFound()",

  // Write functions
  "function flash(address[] recipients, bytes payload) payable returns (uint256 id)",

  // Read functions
  "function flashFeeFor(uint256 recipientCount) view returns (uint256)",
  "function flashCount() view returns (uint256)",
  // Canonical state + discovery (D-039)
  "function getFlash(uint256 id) view returns (address sender, address[] recipients, bytes payload, uint256 timestamp)",
  "function sentFlashCount(address sender) view returns (uint256)",
  "function getSentFlashes(address sender) view returns (uint256[])",
  "function getSentFlashesPaged(address sender, uint256 start, uint256 count) view returns (uint256[])",
  "function receivedFlashCount(address recipient) view returns (uint256)",
  "function getReceivedFlashes(address recipient) view returns (uint256[])",
  "function getReceivedFlashesPaged(address recipient, uint256 start, uint256 count) view returns (uint256[])",
  "function perRecipientFee() view returns (uint256)",
  "function feeReceiver() view returns (address)",
  "function recipientRegistry() view returns (address)",
  "function MAX_RECIPIENTS() view returns (uint256)",
  "function MAX_PAYLOAD_BYTES() view returns (uint256)",

  // Events
  "event FlashSent(uint256 indexed id, address indexed sender, address[] recipients, bytes payload, uint256 timestamp)",
  "event FlashDelivered(uint256 indexed id, address indexed recipient, address indexed sender)",
] as const;
