// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
/// @notice Local test fixture, never an official ERC-8004 registry.
contract MockIdentityRegistry {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => string) public tokenURI;
    function setURI(uint256 id, string calldata uri) external {tokenURI[id]=uri;}
    function getAgentWallet(uint256 id) external view returns(address){return ownerOf[id];}
    mapping(uint256 => mapping(string => bytes)) private metadata;
    function setOwner(uint256 id, address owner) external {ownerOf[id]=owner;}
    function setMetadata(uint256 id,string calldata key,bytes calldata value) external {metadata[id][key]=value;}
    function getMetadata(uint256 id,string calldata key) external view returns(bytes memory){return metadata[id][key];}
}
