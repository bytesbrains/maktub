/** ABI for the MktbToken contract — ERC-20 + ERC20Votes governance token. */
export const MKTB_TOKEN_ABI = [
  // Errors
  "error ExceedsMaxSupply(uint256 requested, uint256 available)",

  // ERC-20 standard
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",

  // ERC20Permit
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",

  // ERC20Votes
  "function delegate(address delegatee)",
  "function delegateBySig(address delegatee, uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s)",
  "function delegates(address account) view returns (address)",
  "function getVotes(address account) view returns (uint256)",
  "function getPastVotes(address account, uint256 timepoint) view returns (uint256)",
  "function getPastTotalSupply(uint256 timepoint) view returns (uint256)",

  // ERC20Burnable
  "function burn(uint256 value)",
  "function burnFrom(address account, uint256 value)",

  // Ownable
  "function owner() view returns (address)",
  "function renounceOwnership()",
  "function transferOwnership(address newOwner)",

  // Minting
  "function mint(address to, uint256 amount)",
  "function MAX_SUPPLY() view returns (uint256)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)",
  "event DelegateVotesChanged(address indexed delegate, uint256 previousVotes, uint256 newVotes)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
] as const;
