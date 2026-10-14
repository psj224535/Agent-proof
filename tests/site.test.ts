import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

interface CatalogAgent {
  slug:string;name:string;role:string;description:string;image?:string;status:'draft'|'registered';active:boolean;
  network:string;chainId:number;chainSlug:string;agentId?:string;owner?:string;registry:string;services:string[];
  registrationUrl?:string;cardUrl?:string;scanUrl?:string;explorerUrl?:string;
}

const catalog=JSON.parse(readFileSync('site/agents.json','utf8')) as CatalogAgent[];

test('50 public Agent catalog has unique, safe identities',()=>{
  assert.ok(catalog.length>=1);
  const slugs=new Set<string>(),identities=new Set<string>();
  for(const agent of catalog){
    assert.match(agent.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!slugs.has(agent.slug),`duplicate slug: ${agent.slug}`);slugs.add(agent.slug);
    assert.ok(agent.name&&agent.role&&agent.description&&agent.network);
    assert.ok(Number.isSafeInteger(agent.chainId)&&agent.chainId>0);
    assert.match(agent.registry,/^0x[0-9a-fA-F]{40}$/);
    assert.ok(Array.isArray(agent.services)&&agent.services.length>0);
    for(const path of [agent.image,agent.registrationUrl,agent.cardUrl].filter(Boolean) as string[])assert.ok(!path.startsWith('/')&&!path.includes('..'),`unsafe public path: ${path}`);
    if(agent.status==='registered'){
      assert.match(agent.agentId??'',/^\d+$/);
      assert.match(agent.owner??'',/^0x[0-9a-fA-F]{40}$/);
      const identity=`${agent.chainId}:${agent.registry.toLowerCase()}:${agent.agentId}`;
      assert.ok(!identities.has(identity),`duplicate identity: ${identity}`);identities.add(identity);
      assert.ok(agent.scanUrl?.startsWith('https://testnet.8004scan.io/agents/'));
      assert.ok(agent.explorerUrl?.startsWith('https://sepolia.etherscan.io/'));
    }
  }
});

test('51 PM catalog entry matches its public ERC-8004 registration',()=>{
  const pm=catalog.find(agent=>agent.slug==='pm');assert.ok(pm);
  const registration=JSON.parse(readFileSync('site/.well-known/agent-registration.json','utf8'));
  const [chainNamespace,chainId,registry]=String(registration.registrations[0].agentRegistry).split(':');
  assert.equal(chainNamespace,'eip155');
  assert.equal(pm.name,registration.name);
  assert.equal(pm.active,registration.active);
  assert.equal(pm.agentId,String(registration.registrations[0].agentId));
  assert.equal(pm.chainId,Number(chainId));
  assert.equal(pm.registry.toLowerCase(),registry.toLowerCase());
  assert.equal(pm.scanUrl,`https://testnet.8004scan.io/agents/${pm.chainSlug}/${pm.agentId}`);
});
