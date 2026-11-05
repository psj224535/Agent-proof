// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IIdentityRegistry} from "./IIdentityRegistry.sol";

/// @notice Non-upgradeable, testnet-only inventory exchange. Authentication alone grants no spending permission.
contract AgentProofDemoExchange is Ownable, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    address public constant SEPOLIA_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    string public constant EXECUTION_WALLET_METADATA_KEY = "agentproof.executionWallet.v1";
    uint256 public constant MAX_AUTHORIZATION_TTL = 120;
    bytes32 public constant EXECUTION_TYPEHASH = keccak256("ExecutionAuthorization(address registry,uint256 agentId,address agentOwner,address executionWallet,address buyer,address token,uint256 quantity,uint256 maxTotalCostWei,uint256 policyVersion,bytes32 evidenceHash,bytes32 traceId,bytes32 nonce,uint64 issuedAt,uint64 expiresAt)");
    bytes32 public constant HUMAN_APPROVAL_TYPEHASH = keccak256("HumanApproval(bytes32 executionHash)");

    struct Policy {
        uint256 agentId;
        address executionWallet;
        bool buyEnabled;
        uint256 maxPerTradeWei;
        uint256 autoApproveLimitWei;
        uint256 totalBudgetLimitWei;
        uint256 spentWei;
        uint64 validUntil;
        bool active;
        uint256 policyVersion;
    }
    struct Listing {
        address token;
        string name;
        string symbol;
        uint8 decimals;
        uint256 pricePerWholeTokenWei;
        uint256 demoScore;
        bool active;
        uint64 updatedAt;
    }
    struct ExecutionAuthorization {
        address registry;
        uint256 agentId;
        address agentOwner;
        address executionWallet;
        address buyer;
        address token;
        uint256 quantity;
        uint256 maxTotalCostWei;
        uint256 policyVersion;
        bytes32 evidenceHash;
        bytes32 traceId;
        bytes32 nonce;
        uint64 issuedAt;
        uint64 expiresAt;
    }

    address public trustedVerifier;
    IIdentityRegistry public immutable registry;
    mapping(address => Listing) public listings;
    address[] public listingTokens;
    mapping(address => uint256) public budgets;
    mapping(address => Policy) public policies;
    mapping(address => mapping(address => bool)) public allowedTokens;
    mapping(bytes32 => bool) public usedNonces;
    uint256 public merchantProceeds;
    uint256 public totalDepositedBudget;

    event BudgetDeposited(address indexed user, uint256 amount, uint256 balance);
    event BudgetWithdrawn(address indexed user, uint256 amount, uint256 balance);
    event PolicyConfigured(address indexed user, uint256 indexed agentId, address executionWallet, uint256 policyVersion);
    event PolicyRevoked(address indexed user, uint256 policyVersion);
    event PolicyPaused(address indexed user, uint256 policyVersion);
    event TokenAllowed(address indexed user, address indexed token, bool allowed, uint256 policyVersion);
    event ListingAdded(address indexed token, uint256 pricePerWholeTokenWei, uint256 demoScore);
    event ListingUpdated(address indexed token, uint256 pricePerWholeTokenWei, uint256 demoScore, bool active);
    event InventoryDeposited(address indexed token, uint256 quantity);
    event VerifiedAgentPurchase(address indexed user, uint256 indexed agentId, address executionWallet, address indexed token, uint256 quantity, uint256 totalCostWei, bytes32 authorizationNonce, bytes32 evidenceHash, bytes32 traceId);
    event TrustedVerifierChanged(address indexed previousVerifier, address indexed newVerifier);
    event ExchangePaused(address indexed account, bool paused);
    event MerchantProceedsWithdrawn(address indexed recipient, uint256 amount);

    constructor(address initialOwner, address verifier, address identityRegistry)
        Ownable(initialOwner) EIP712("AgentProofDemoExchange", "1")
    {
        require(block.chainid == 11155111 || block.chainid == 31337, "ONLY_TEST_CHAINS");
        require(verifier != address(0), "VERIFIER_REQUIRED");
        require(identityRegistry.code.length > 0, "REGISTRY_REQUIRED");
        require(block.chainid != 11155111 || identityRegistry == SEPOLIA_REGISTRY, "SEPOLIA_REGISTRY_REQUIRED");
        trustedVerifier = verifier;
        registry = IIdentityRegistry(identityRegistry);
    }

    function depositBudget() external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "ZERO_DEPOSIT");
        budgets[msg.sender] += msg.value;
        totalDepositedBudget += msg.value;
        emit BudgetDeposited(msg.sender, msg.value, budgets[msg.sender]);
    }

    /// @notice Users may recover unspent ETH even while the exchange or policy is paused.
    function withdrawUnusedBudget(uint256 amount) external nonReentrant {
        require(amount > 0 && amount <= budgets[msg.sender], "INSUFFICIENT_BUDGET");
        budgets[msg.sender] -= amount;
        totalDepositedBudget -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH_TRANSFER_FAILED");
        emit BudgetWithdrawn(msg.sender, amount, budgets[msg.sender]);
    }

    function configurePolicy(uint256 agentId, address executionWallet, bool buyEnabled, uint256 maxPerTradeWei, uint256 autoApproveLimitWei, uint256 totalBudgetLimitWei, uint64 validUntil) external {
        require(executionWallet != address(0), "EXECUTOR_REQUIRED");
        require(maxPerTradeWei > 0 && autoApproveLimitWei <= maxPerTradeWei && maxPerTradeWei <= totalBudgetLimitWei, "INVALID_LIMITS");
        require(validUntil > block.timestamp, "POLICY_EXPIRED");
        Policy storage previous = policies[msg.sender];
        require(totalBudgetLimitWei >= previous.spentWei, "BUDGET_BELOW_SPENT");
        uint256 version = previous.policyVersion + 1;
        uint256 spent = previous.spentWei;
        policies[msg.sender] = Policy(agentId, executionWallet, buyEnabled, maxPerTradeWei, autoApproveLimitWei, totalBudgetLimitWei, spent, validUntil, true, version);
        emit PolicyConfigured(msg.sender, agentId, executionWallet, version);
    }

    function setTokenAllowed(address token, bool allowed) external {
        require(listings[token].token != address(0), "LISTING_MISSING");
        require(policies[msg.sender].policyVersion > 0, "POLICY_MISSING");
        allowedTokens[msg.sender][token] = allowed;
        emit TokenAllowed(msg.sender, token, allowed, ++policies[msg.sender].policyVersion);
    }

    function revokePolicy() external {
        Policy storage policy = policies[msg.sender];
        require(policy.policyVersion > 0, "POLICY_MISSING");
        policy.active = false;
        policy.buyEnabled = false;
        emit PolicyRevoked(msg.sender, ++policy.policyVersion);
    }

    function pausePolicy() external {
        Policy storage policy = policies[msg.sender];
        require(policy.policyVersion > 0, "POLICY_MISSING");
        policy.active = false;
        emit PolicyPaused(msg.sender, ++policy.policyVersion);
    }

    function addListing(address token, uint256 pricePerWholeTokenWei, uint256 demoScore) external onlyOwner {
        require(token.code.length > 0 && listings[token].token == address(0), "INVALID_LISTING");
        require(pricePerWholeTokenWei > 0 && demoScore <= 100, "INVALID_LISTING_VALUES");
        IERC20Metadata asset = IERC20Metadata(token);
        uint8 decimals = asset.decimals();
        require(decimals <= 18, "UNSUPPORTED_DECIMALS");
        listings[token] = Listing(token, asset.name(), asset.symbol(), decimals, pricePerWholeTokenWei, demoScore, true, uint64(block.timestamp));
        listingTokens.push(token);
        emit ListingAdded(token, pricePerWholeTokenWei, demoScore);
    }

    function updateListing(address token, uint256 pricePerWholeTokenWei, uint256 demoScore, bool active) external onlyOwner {
        require(listings[token].token != address(0), "LISTING_MISSING");
        require(pricePerWholeTokenWei > 0 && demoScore <= 100, "INVALID_LISTING_VALUES");
        Listing storage listing = listings[token];
        listing.pricePerWholeTokenWei = pricePerWholeTokenWei;
        listing.demoScore = demoScore;
        listing.active = active;
        listing.updatedAt = uint64(block.timestamp);
        emit ListingUpdated(token, pricePerWholeTokenWei, demoScore, active);
    }

    function depositInventory(address token, uint256 quantity) external onlyOwner nonReentrant {
        require(listings[token].token != address(0) && quantity > 0, "INVALID_INVENTORY");
        IERC20(token).safeTransferFrom(msg.sender, address(this), quantity);
        emit InventoryDeposited(token, quantity);
    }

    function inventory(address token) public view returns (uint256) { return IERC20(token).balanceOf(address(this)); }
    function getListingTokens() external view returns (address[] memory) { return listingTokens; }
    function quote(address token, uint256 quantity) public view returns (uint256) {
        Listing storage listing = listings[token];
        require(listing.token != address(0), "LISTING_MISSING");
        // Round up so sub-wei fractions cannot buy free tokens.
        return Math.mulDiv(quantity, listing.pricePerWholeTokenWei, 10 ** listing.decimals, Math.Rounding.Ceil);
    }
    function hashExecution(ExecutionAuthorization calldata authorization) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(EXECUTION_TYPEHASH, authorization)));
    }
    function hashHumanApproval(ExecutionAuthorization calldata authorization) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(HUMAN_APPROVAL_TYPEHASH, hashExecution(authorization))));
    }

    function buyWithAuthorization(ExecutionAuthorization calldata a, bytes calldata verifierSignature, bytes calldata humanApprovalSignature) external nonReentrant whenNotPaused {
        require(block.chainid == 11155111 || block.chainid == 31337, "ONLY_TEST_CHAINS");
        require(a.registry == address(registry), "REGISTRY_MISMATCH");
        require(msg.sender == a.executionWallet, "EXECUTOR_MISMATCH");
        require(a.issuedAt <= block.timestamp && a.expiresAt > block.timestamp && a.expiresAt > a.issuedAt && a.expiresAt - a.issuedAt <= MAX_AUTHORIZATION_TTL, "AUTHORIZATION_EXPIRED");
        require(a.nonce != bytes32(0) && !usedNonces[a.nonce], "NONCE_USED");
        require(a.evidenceHash != bytes32(0) && a.traceId != bytes32(0), "EVIDENCE_REQUIRED");
        bytes32 digest = hashExecution(a);
        require(ECDSA.recover(digest, verifierSignature) == trustedVerifier, "UNTRUSTED_VERIFIER");
        Policy storage policy = policies[a.buyer];
        require(policy.active && policy.buyEnabled, "POLICY_DISABLED");
        require(policy.validUntil > block.timestamp, "POLICY_EXPIRED");
        require(policy.policyVersion == a.policyVersion, "POLICY_CHANGED");
        require(policy.agentId == a.agentId, "AGENT_MISMATCH");
        require(policy.executionWallet == a.executionWallet, "POLICY_EXECUTOR_MISMATCH");
        Listing storage listing = listings[a.token];
        require(listing.token != address(0) && listing.active, "LISTING_INACTIVE");
        require(allowedTokens[a.buyer][a.token], "TOKEN_NOT_ALLOWED");
        require(a.quantity > 0 && inventory(a.token) >= a.quantity, "INSUFFICIENT_INVENTORY");
        uint256 cost = quote(a.token, a.quantity);
        require(cost > 0 && cost <= a.maxTotalCostWei, "MAX_COST_EXCEEDED");
        require(cost <= policy.maxPerTradeWei, "PER_TRADE_LIMIT");
        require(policy.spentWei + cost <= policy.totalBudgetLimitWei, "TOTAL_BUDGET_LIMIT");
        require(budgets[a.buyer] >= cost, "INSUFFICIENT_BUDGET");
        require(registry.ownerOf(a.agentId) == a.agentOwner, "AGENT_OWNER_CHANGED");
        bytes memory binding = registry.getMetadata(a.agentId, EXECUTION_WALLET_METADATA_KEY);
        require(binding.length == 32 && keccak256(binding) == keccak256(abi.encode(a.executionWallet)), "EXECUTION_BINDING_CHANGED");
        if (cost > policy.autoApproveLimitWei) {
            bytes32 humanDigest = _hashTypedDataV4(keccak256(abi.encode(HUMAN_APPROVAL_TYPEHASH, digest)));
            require(ECDSA.recover(humanDigest, humanApprovalSignature) == a.buyer, "HUMAN_APPROVAL_REQUIRED");
        }
        usedNonces[a.nonce] = true;
        budgets[a.buyer] -= cost;
        totalDepositedBudget -= cost;
        policy.spentWei += cost;
        merchantProceeds += cost;
        IERC20(a.token).safeTransfer(a.buyer, a.quantity);
        emit VerifiedAgentPurchase(a.buyer, a.agentId, a.executionWallet, a.token, a.quantity, cost, a.nonce, a.evidenceHash, a.traceId);
    }

    function withdrawMerchantProceeds(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        require(recipient != address(0) && amount > 0 && amount <= merchantProceeds, "INSUFFICIENT_PROCEEDS");
        merchantProceeds -= amount;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "ETH_TRANSFER_FAILED");
        emit MerchantProceedsWithdrawn(recipient, amount);
    }
    function setTrustedVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "VERIFIER_REQUIRED");
        emit TrustedVerifierChanged(trustedVerifier, verifier);
        trustedVerifier = verifier;
    }
    function pauseExchange() external onlyOwner { _pause(); emit ExchangePaused(msg.sender, true); }
    function unpauseExchange() external onlyOwner { _unpause(); emit ExchangePaused(msg.sender, false); }
}
