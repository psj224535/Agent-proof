// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
/// @notice Integration ABI subset, NOT the official reference implementation.
/// AgentProof uses owner-managed metadata to anchor its custom runtime binding.
interface IIdentityRegistry {
    struct MetadataEntry { string metadataKey; bytes metadataValue; }
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256);
    function ownerOf(uint256 agentId) external view returns (address);
    function tokenURI(uint256 agentId) external view returns (string memory);
    function getAgentWallet(uint256 agentId) external view returns (address);
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory);
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external;
}
