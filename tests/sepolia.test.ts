import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocuments} from '../packages/agent-kit/index.ts';
import {hash} from '../packages/crypto/index.ts';
import {validate,registrationSchema,cardSchema} from '../packages/shared-schemas/index.ts';
import {BINDING_METADATA_KEY,loadViem} from '../packages/erc8004-filter/viem-reader.ts';
import {REGISTER_ABI,SEPOLIA_CHAIN_HEX,SEPOLIA_CHAIN_ID,SEPOLIA_REGISTRY,SET_METADATA_ABI,metadataTransaction,registrationTransaction} from '../packages/erc8004-filter/sepolia.ts';

const owner='0x422A6dDB79F4a13B58f7aAedD92f464c3e1e70A9';
const origin='https://psj224535.github.io/Agent-proof';

test('47 Sepolia register transaction is exact, zero-value ERC-8004 calldata',()=>{
 const uri=origin+'/.well-known/agent-registration.json',tx=registrationTransaction(owner,uri),{decodeFunctionData}=loadViem();
 assert.equal(tx.to,SEPOLIA_REGISTRY);assert.equal(tx.from,owner);assert.equal(tx.value,'0x0');assert.equal(tx.chainId,SEPOLIA_CHAIN_HEX);
 const decoded=decodeFunctionData({abi:REGISTER_ABI,data:tx.data});assert.equal(decoded.functionName,'register');assert.deepEqual(decoded.args,[uri]);
});

test('48 Sepolia runtime binding metadata is exactly bytes32',()=>{
 const documents=createDocuments({agentOrigin:origin,agentId:'123',chainId:SEPOLIA_CHAIN_ID,registry:SEPOLIA_REGISTRY,ownerAddress:owner,validityMs:86400000});const bindingHash=hash(documents.binding);
 const tx=metadataTransaction(owner,'123',bindingHash),{decodeFunctionData}=loadViem(),decoded=decodeFunctionData({abi:SET_METADATA_ABI,data:tx.data});
 assert.equal(decoded.functionName,'setMetadata');assert.equal(String(decoded.args?.[0]),'123');assert.equal(decoded.args?.[1],BINDING_METADATA_KEY);assert.equal(decoded.args?.[2],'0x'+bindingHash);
});

test('49 generated public registration and signed A2A card validate',()=>{
 const documents=createDocuments({agentOrigin:origin,agentId:'123',chainId:SEPOLIA_CHAIN_ID,registry:SEPOLIA_REGISTRY,ownerAddress:owner,agentName:'PM',validityMs:86400000});
 validate(registrationSchema,documents.registration);validate(cardSchema,documents.card);assert.equal(documents.registration.registrations[0].agentRegistry,'eip155:11155111:'+SEPOLIA_REGISTRY);assert.equal(documents.binding.ownerWallet,owner);assert.equal(documents.registration.agentproof.runtimeBindingHash,hash(documents.binding));
});
