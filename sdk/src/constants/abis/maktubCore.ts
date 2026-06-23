/** ABI for the MaktubCore contract — the immutable heartbeat engine. */
export const MAKTUB_CORE_ABI = [
  // Constructor
  "constructor(uint256 _baseFee, uint256 _perAdditionalFee, address _feeReceiver, address _recipientRegistry, address _executorRewards)",

  // Errors
  "error AlreadyExecuted()",
  "error DuplicateRecipient(address recipient)",
  "error EmptyPayload()",
  "error HeartbeatAlreadyExists()",
  "error HeartbeatIsDeactivated()",
  "error HeartbeatNotFound()",
  "error InsufficientFee()",
  "error IntervalTooLong()",
  "error IntervalTooShort()",
  "error NoRecipients()",
  "error NotExecutor()",
  "error NotOwner()",
  "error PayloadTooLarge()",
  "error RecipientNotRegistered(address recipient)",
  "error TimerNotExpired()",
  "error TooManyRecipients()",

  // Events
  "event HeartbeatCheckedIn(uint256 indexed id, uint256 timestamp)",
  "event HeartbeatCreated(uint256 indexed id, address indexed owner, address[] recipients, uint256 interval)",
  "event HeartbeatDeactivated(uint256 indexed id)",
  "event HeartbeatExecuted(uint256 indexed id, address indexed executor, uint256 timestamp)",
  "event IntervalUpdated(uint256 indexed id, uint256 newInterval)",
  "event RecipientsUpdated(uint256 indexed id, address[] newRecipients)",

  // State-changing functions
  "function createHeartbeat(bytes32 salt, address[] recipients, bytes payload, uint256 interval) payable returns (uint256 id)",
  "function checkIn(uint256 id)",
  "function execute(uint256 id)",
  "function updateRecipients(uint256 id, address[] newRecipients)",
  "function updateInterval(uint256 id, uint256 newInterval)",
  "function deactivate(uint256 id)",

  // View functions
  "function getHeartbeat(uint256 id) view returns (address owner, address[] recipients, bytes payload, uint256 interval, uint256 lastCheckIn, uint256 createdAt, uint256 checkInCount, bool executed, bool deactivated)",
  "function isExpired(uint256 id) view returns (bool)",
  "function isExecutor(address account) view returns (bool)",
  "function timeRemaining(uint256 id) view returns (uint256)",
  "function heartbeatCount() view returns (uint256)",
  // Discovery (D-038) — IDs are content-addressed, not 0..N enumerable
  "function ownerBeatCount(address owner) view returns (uint256)",
  "function getOwnerBeats(address owner) view returns (uint256[])",
  "function getOwnerBeatsPaged(address owner, uint256 start, uint256 count) view returns (uint256[])",
  "function inboxCount(address recipient) view returns (uint256)",
  "function getInboxBeats(address recipient) view returns (uint256[])",
  "function getInboxBeatsPaged(address recipient, uint256 start, uint256 count) view returns (uint256[])",
  "function baseFee() view returns (uint256)",
  "function perAdditionalFee() view returns (uint256)",
  "function creationFeeFor(uint256 recipientCount) view returns (uint256)",
  "function feeReceiver() view returns (address)",
  "function recipientRegistry() view returns (address)",
  "function executorRewards() view returns (address)",
  "function MIN_INTERVAL() view returns (uint256)",
  "function MAX_INTERVAL() view returns (uint256)",
  "function MAX_RECIPIENTS() view returns (uint256)",
  "function MAX_PAYLOAD_BYTES() view returns (uint256)",
] as const;
