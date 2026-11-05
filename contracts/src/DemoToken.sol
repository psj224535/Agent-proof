// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Sepolia/Anvil test asset. Fixed supply, no minting, no real-world value.
contract DemoToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 ether;

    constructor(string memory demoName, string memory demoSymbol, address exchange)
        ERC20(string.concat("AgentProof Demo ", demoName), demoSymbol)
    {
        require(block.chainid == 11155111 || block.chainid == 31337, "ONLY_TEST_CHAINS");
        require(exchange.code.length > 0, "EXCHANGE_REQUIRED");
        _mint(exchange, INITIAL_SUPPLY);
    }
}
