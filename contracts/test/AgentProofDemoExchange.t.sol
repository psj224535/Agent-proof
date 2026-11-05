// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {AgentProofDemoExchange as Exchange} from "../src/AgentProofDemoExchange.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {MockIdentityRegistry} from "./MockIdentityRegistry.sol";

contract WithdrawalReentrancyProbe {
    Exchange exchange;
    bool public blocked;
    constructor(Exchange x) {exchange=x;}
    function attempt() external payable {
        exchange.depositBudget{value:msg.value}();
        exchange.withdrawUnusedBudget(msg.value);
    }
    receive() external payable {
        (bool ok,) = address(exchange).call(abi.encodeCall(exchange.withdrawUnusedBudget,(1)));
        blocked=!ok;
    }
}

contract AgentProofDemoExchangeTest is Test {
    Exchange exchange;
    DemoToken token;
    MockIdentityRegistry registry;
    uint256 verifierKey=0xA11CE;
    uint256 buyerKey=0xB0B;
    uint256 otherKey=0xBAD;
    address verifier;
    address buyer;
    address executor=address(0xE);
    address agentOwner=address(0xA);
    uint256 constant PRICE=0.001 ether;
    Exchange.ExecutionAuthorization auth;

    function setUp() public {
        vm.chainId(31337);vm.warp(1_800_000_000);
        verifier=vm.addr(verifierKey);buyer=vm.addr(buyerKey);
        registry=new MockIdentityRegistry();
        registry.setOwner(7,agentOwner);
        registry.setMetadata(7,"agentproof.executionWallet.v1",abi.encode(executor));
        exchange=new Exchange(address(this),verifier,address(registry));
        token=new DemoToken("Nova","dNOVA",address(exchange));
        exchange.addListing(address(token),PRICE,91);
        vm.deal(buyer,10 ether);
        vm.startPrank(buyer);
        exchange.depositBudget{value:1 ether}();
        exchange.configurePolicy(7,executor,true,0.1 ether,0.01 ether,1 ether,uint64(block.timestamp+1 days));
        exchange.setTokenAllowed(address(token),true);
        vm.stopPrank();
        auth=Exchange.ExecutionAuthorization(address(registry),7,agentOwner,executor,buyer,address(token),2 ether,2*PRICE,2,keccak256("evidence"),keccak256("trace"),keccak256("nonce"),uint64(block.timestamp),uint64(block.timestamp+90));
    }
    function sign(Exchange.ExecutionAuthorization memory a,uint256 key) internal view returns(bytes memory){
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,exchange.hashExecution(a));return abi.encodePacked(r,s,v);
    }
    function buy() internal {bytes memory sig=sign(auth,verifierKey);vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    function denied(string memory reason) internal {bytes memory sig=sign(auth,verifierKey);vm.expectRevert(bytes(reason));vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    function policy(uint256 max,uint256 autoLimit,uint256 total,uint64 expires,bool enabled) internal {
        vm.prank(buyer);exchange.configurePolicy(7,executor,enabled,max,autoLimit,total,expires);auth.policyVersion++;
    }
    function testDeposit() public {assertEq(exchange.budgets(buyer),1 ether);assertEq(exchange.totalDepositedBudget(),1 ether);}
    function testConfigurePolicy() public {
        (uint256 agent,address wallet,bool enabled,uint256 max,uint256 autoLimit,uint256 total,uint256 spent,uint64 expiry,bool active,uint256 version)=exchange.policies(buyer);
        assertEq(agent,7);assertEq(wallet,executor);assertTrue(enabled);assertEq(max,0.1 ether);assertEq(autoLimit,0.01 ether);assertEq(total,1 ether);assertEq(spent,0);assertGt(expiry,block.timestamp);assertTrue(active);assertEq(version,2);
    }
    function testVerifiedPurchaseBalancesBudgetProceedsAndEvent() public {
        vm.recordLogs();buy();Vm.Log[] memory logs=vm.getRecordedLogs();
        assertEq(token.balanceOf(buyer),2 ether);assertEq(exchange.budgets(buyer),1 ether-2*PRICE);
        assertEq(exchange.totalDepositedBudget(),1 ether-2*PRICE);assertEq(exchange.merchantProceeds(),2*PRICE);assertTrue(exchange.usedNonces(auth.nonce));
        Vm.Log memory e=logs[logs.length-1];
        assertEq(e.emitter,address(exchange));assertEq(e.topics[0],keccak256("VerifiedAgentPurchase(address,uint256,address,address,uint256,uint256,bytes32,bytes32,bytes32)"));
        assertEq(e.topics[1],bytes32(uint256(uint160(buyer))));assertEq(uint256(e.topics[2]),7);assertEq(e.topics[3],bytes32(uint256(uint160(address(token)))));
        (address executionWallet,uint256 quantity,uint256 cost,bytes32 nonce,bytes32 evidence,bytes32 trace)=abi.decode(e.data,(address,uint256,uint256,bytes32,bytes32,bytes32));
        assertEq(executionWallet,executor);assertEq(quantity,2 ether);assertEq(cost,2*PRICE);assertEq(nonce,auth.nonce);assertEq(evidence,auth.evidenceHash);assertEq(trace,auth.traceId);
    }
    function testUntrustedVerifier() public {bytes memory sig=sign(auth,otherKey);vm.expectRevert("UNTRUSTED_VERIFIER");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    // REJECT/PARTIAL cannot obtain verifier signatures. Supplying their own signatures never bypasses this gate.
    function testRejectedAgentCannotSelfAuthorize() public {bytes memory sig=sign(auth,otherKey);vm.expectRevert("UNTRUSTED_VERIFIER");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    function testPartialAgentCannotSelfAuthorize() public {bytes memory sig=sign(auth,buyerKey);vm.expectRevert("UNTRUSTED_VERIFIER");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    function testWrongAgent() public {auth.agentId=8;denied("AGENT_MISMATCH");}
    function testWrongSender() public {bytes memory sig=sign(auth,verifierKey);vm.expectRevert("EXECUTOR_MISMATCH");exchange.buyWithAuthorization(auth,sig,"");}
    function testWrongExecutionWallet() public {auth.executionWallet=address(9);bytes memory sig=sign(auth,verifierKey);vm.expectRevert("POLICY_EXECUTOR_MISMATCH");vm.prank(address(9));exchange.buyWithAuthorization(auth,sig,"");}
    function testWrongBuyer() public {auth.buyer=address(9);denied("POLICY_DISABLED");}
    function testExpiredAuthorization() public {vm.warp(block.timestamp+91);denied("AUTHORIZATION_EXPIRED");}
    function testFutureAuthorization() public {auth.issuedAt=uint64(block.timestamp+1);denied("AUTHORIZATION_EXPIRED");}
    function testOverlongAuthorization() public {auth.expiresAt=uint64(block.timestamp+121);denied("AUTHORIZATION_EXPIRED");}
    function testReplay() public {buy();denied("NONCE_USED");}
    function testPolicyExpired() public {policy(0.1 ether,0.01 ether,1 ether,uint64(block.timestamp+1),true);vm.warp(block.timestamp+2);denied("POLICY_EXPIRED");}
    function testPolicyRevoked() public {vm.prank(buyer);exchange.revokePolicy();denied("POLICY_DISABLED");}
    function testPolicyPaused() public {vm.prank(buyer);exchange.pausePolicy();denied("POLICY_DISABLED");}
    function testBuyDisabled() public {policy(0.1 ether,0.01 ether,1 ether,uint64(block.timestamp+1 days),false);denied("POLICY_DISABLED");}
    function testTokenDisallowed() public {vm.prank(buyer);exchange.setTokenAllowed(address(token),false);auth.policyVersion++;denied("TOKEN_NOT_ALLOWED");}
    function testListingInactive() public {exchange.updateListing(address(token),PRICE,91,false);denied("LISTING_INACTIVE");}
    function testPerTradeLimit() public {policy(PRICE,PRICE,1 ether,uint64(block.timestamp+1 days),true);denied("PER_TRADE_LIMIT");}
    function testTotalBudgetLimit() public {policy(2*PRICE,2*PRICE,3*PRICE,uint64(block.timestamp+1 days),true);buy();auth.nonce=keccak256("second");denied("TOTAL_BUDGET_LIMIT");}
    function testInsufficientDeposit() public {vm.prank(buyer);exchange.withdrawUnusedBudget(1 ether-PRICE);denied("INSUFFICIENT_BUDGET");}
    function testPriceIncreaseExceedsMaximum() public {exchange.updateListing(address(token),PRICE+1,91,true);denied("MAX_COST_EXCEEDED");}
    function testOwnerChanged() public {registry.setOwner(7,address(2));denied("AGENT_OWNER_CHANGED");}
    function testBindingChanged() public {registry.setMetadata(7,"agentproof.executionWallet.v1",abi.encode(address(2)));denied("EXECUTION_BINDING_CHANGED");}
    function testBindingNonCanonical20Bytes() public {registry.setMetadata(7,"agentproof.executionWallet.v1",abi.encodePacked(executor));denied("EXECUTION_BINDING_CHANGED");}
    function testBindingNonCanonicalHighBytes() public {registry.setMetadata(7,"agentproof.executionWallet.v1",abi.encode(bytes32(uint256(uint160(executor)) | (uint256(1)<<255))));denied("EXECUTION_BINDING_CHANGED");}
    function testPause() public {exchange.pauseExchange();bytes memory sig=sign(auth,verifierKey);vm.expectRevert();vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");exchange.unpauseExchange();buy();}
    function testPolicyChanged() public {vm.prank(buyer);exchange.setTokenAllowed(address(token),true);denied("POLICY_CHANGED");}
    function testZeroQuantity() public {auth.quantity=0;denied("INSUFFICIENT_INVENTORY");}
    function testWrongRegistry() public {auth.registry=address(9);denied("REGISTRY_MISMATCH");}
    function testMutationOfTokenInvalidatesSignature() public {bytes memory sig=sign(auth,verifierKey);auth.token=address(9);vm.expectRevert("UNTRUSTED_VERIFIER");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    function testMutationOfQuantityInvalidatesSignature() public {bytes memory sig=sign(auth,verifierKey);auth.quantity++;vm.expectRevert("UNTRUSTED_VERIFIER");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    function testOtherExchangeSignatureRejected() public {Exchange other=new Exchange(address(this),verifier,address(registry));(uint8 v,bytes32 r,bytes32 s)=vm.sign(verifierKey,other.hashExecution(auth));vm.expectRevert("UNTRUSTED_VERIFIER");vm.prank(executor);exchange.buyWithAuthorization(auth,abi.encodePacked(r,s,v),"");}
    function testOtherChainSignatureRejected() public {vm.chainId(11155111);bytes memory sig=sign(auth,verifierKey);vm.chainId(31337);vm.expectRevert("UNTRUSTED_VERIFIER");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    function testHumanApprovalRequired() public {policy(0.1 ether,PRICE,1 ether,uint64(block.timestamp+1 days),true);bytes memory sig=sign(auth,verifierKey);vm.expectRevert();vm.prank(executor);exchange.buyWithAuthorization(auth,sig,"");}
    function testHumanApprovalSuccessAndReplayProtection() public {
        policy(0.1 ether,PRICE,1 ether,uint64(block.timestamp+1 days),true);
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(buyerKey,exchange.hashHumanApproval(auth));bytes memory human=abi.encodePacked(r,s,v);bytes memory sig=sign(auth,verifierKey);
        vm.prank(executor);exchange.buyWithAuthorization(auth,sig,human);assertEq(token.balanceOf(buyer),2 ether);
        vm.expectRevert("NONCE_USED");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,human);
    }
    function testHumanApprovalWrongSigner() public {policy(0.1 ether,PRICE,1 ether,uint64(block.timestamp+1 days),true);(uint8 v,bytes32 r,bytes32 s)=vm.sign(otherKey,exchange.hashHumanApproval(auth));bytes memory sig=sign(auth,verifierKey);vm.expectRevert("HUMAN_APPROVAL_REQUIRED");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,abi.encodePacked(r,s,v));}
    function testHumanApprovalBoundToExactExecution() public {policy(0.1 ether,PRICE,1 ether,uint64(block.timestamp+1 days),true);(uint8 v,bytes32 r,bytes32 s)=vm.sign(buyerKey,exchange.hashHumanApproval(auth));auth.nonce=keccak256("different");bytes memory sig=sign(auth,verifierKey);vm.expectRevert("HUMAN_APPROVAL_REQUIRED");vm.prank(executor);exchange.buyWithAuthorization(auth,sig,abi.encodePacked(r,s,v));}
    function testOwnerOnlyAdministration() public {
        vm.startPrank(buyer);
        vm.expectRevert();exchange.updateListing(address(token),PRICE,2,false);
        vm.expectRevert();exchange.addListing(address(123),PRICE,2);
        vm.expectRevert();exchange.depositInventory(address(token),1);
        vm.expectRevert();exchange.setTrustedVerifier(buyer);
        vm.expectRevert();exchange.pauseExchange();
        vm.expectRevert();exchange.unpauseExchange();
        vm.expectRevert();exchange.withdrawMerchantProceeds(payable(buyer),1);
        vm.stopPrank();
    }
    function testUserPolicyCannotBeWrittenByExecutor() public {vm.prank(executor);exchange.configurePolicy(7,executor,true,1,1,1,uint64(block.timestamp+1 days));(,,,,,,,,,uint256 version)=exchange.policies(buyer);assertEq(version,2);}
    function testUnusedBudgetWithdrawalWhilePaused() public {exchange.pauseExchange();uint256 before=buyer.balance;vm.prank(buyer);exchange.withdrawUnusedBudget(0.4 ether);assertEq(buyer.balance,before+0.4 ether);assertEq(exchange.budgets(buyer),0.6 ether);}
    function testMerchantWithdrawCannotSpendUserDeposits() public {buy();address merchant=address(0x123);exchange.withdrawMerchantProceeds(payable(merchant),2*PRICE);assertEq(merchant.balance,2*PRICE);assertEq(address(exchange).balance,exchange.totalDepositedBudget());vm.expectRevert("INSUFFICIENT_PROCEEDS");exchange.withdrawMerchantProceeds(payable(merchant),1);}
    function testWithdrawalReentrancyBlocked() public {WithdrawalReentrancyProbe probe=new WithdrawalReentrancyProbe(exchange);probe.attempt{value:1 ether}();assertTrue(probe.blocked());assertEq(exchange.budgets(address(probe)),0);}
    function testVerifierRotationInvalidatesOldApprovals() public {exchange.setTrustedVerifier(vm.addr(otherKey));denied("UNTRUSTED_VERIFIER");}
    function testFixedSupplyAndInventory() public {assertEq(token.totalSupply(),1_000_000 ether);assertEq(exchange.inventory(address(token)),token.totalSupply());assertEq(token.name(),"AgentProof Demo Nova");}
    function testFractionalQuoteRoundsUp() public {assertEq(exchange.quote(address(token),1),1);}
    function testMainnetDeploymentRejected() public {vm.chainId(1);vm.expectRevert("ONLY_TEST_CHAINS");new Exchange(address(this),verifier,address(registry));vm.expectRevert("ONLY_TEST_CHAINS");new DemoToken("Nova","dNOVA",address(exchange));}
    function testSepoliaRegistryPinned() public {vm.chainId(11155111);vm.expectRevert("SEPOLIA_REGISTRY_REQUIRED");new Exchange(address(this),verifier,address(registry));}
    function testSharedCanonicalMetadataVector() public pure {
        assertEq(abi.encode(address(0x1234567890123456789012345678901234567890)),hex"0000000000000000000000001234567890123456789012345678901234567890");
    }
    function testInventoryDeposit() public {
        buy();vm.prank(buyer);token.transfer(address(this),1 ether);token.approve(address(exchange),1 ether);
        uint256 before=exchange.inventory(address(token));exchange.depositInventory(address(token),1 ether);assertEq(exchange.inventory(address(token)),before+1 ether);
    }
    function testSpentIsPreservedOnReconfigure() public {
        buy();policy(0.1 ether,0.01 ether,1 ether,uint64(block.timestamp+1 days),true);(,,,,,,uint256 spent,,,)=exchange.policies(buyer);assertEq(spent,2*PRICE);
    }
    function testZeroDepositRejected() public {vm.expectRevert("ZERO_DEPOSIT");exchange.depositBudget();}
    function testZeroNonceRejected() public {auth.nonce=bytes32(0);denied("NONCE_USED");}
    function testMissingEvidenceRejected() public {auth.evidenceHash=bytes32(0);denied("EVIDENCE_REQUIRED");}
    function testInsufficientInventory() public {auth.quantity=token.totalSupply()+1;denied("INSUFFICIENT_INVENTORY");}
    function testFuzzPurchaseConservesAccounting(uint96 rawQuantity) public {
        uint256 quantity=bound(uint256(rawQuantity),1,10 ether);auth.quantity=quantity;auth.maxTotalCostWei=exchange.quote(address(token),quantity);
        uint256 before=exchange.budgets(buyer);buy();assertEq(before-exchange.budgets(buyer),exchange.merchantProceeds());assertEq(token.balanceOf(buyer),quantity);assertEq(address(exchange).balance,exchange.totalDepositedBudget()+exchange.merchantProceeds());
    }
}
