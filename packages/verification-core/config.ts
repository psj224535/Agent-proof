import {MODULE_IDS} from '../shared-schemas/types.ts';
import type {Configuration,ModuleId,Profile,ModuleResult,Verdict} from '../shared-schemas/types.ts';
export const DEPENDENCIES:Record<ModuleId,ModuleId[]>={erc8004:[],a2a:[], 'aps-passport':['a2a'],'company-attestation':['a2a'],'visa-tap':['a2a']};
export function defaultConfiguration():Configuration {
 return {version:1,mode:'continueAll',modules:Object.fromEntries(MODULE_IDS.map(id=>[id,{enabled:true,required:true,timeoutMs:3000}])) as Configuration['modules']};
}
export function profileFor(c:Configuration):Profile {
 const m=c.modules;
 if(MODULE_IDS.every(id=>m[id].enabled&&m[id].required))return 'FULL_AUTH_V1';
 if(['erc8004','a2a','visa-tap'].every(id=>m[id as ModuleId].enabled&&m[id as ModuleId].required))return 'WEB3_AGENT_V1';
 if(!m.erc8004.enabled&&['a2a','aps-passport','visa-tap'].every(id=>m[id as ModuleId].enabled&&m[id as ModuleId].required))return 'EXPERIMENTAL_APS_V1';
 return 'CUSTOM_REDUCED';
}
export function aggregate(c:Configuration,results:ModuleResult[]):{verdict:Verdict;policyProfile:Profile;reasonCodes:string[]} {
 const policyProfile=profileFor(c);
 // Explicit cryptographic/identity contradictions are never hidden by optional status.
 if(results.some(r=>r.status==='FAIL'))return {verdict:'REJECT',policyProfile,reasonCodes:results.filter(r=>r.status==='FAIL').flatMap(r=>r.reasonCodes)};
 const unavailable=results.filter(r=>c.modules[r.moduleId].enabled&&r.status!=='PASS');
 if(policyProfile==='CUSTOM_REDUCED'||unavailable.length||!results.some(r=>r.moduleId==='visa-tap'&&r.status==='PASS'))
   return {verdict:'PARTIAL',policyProfile,reasonCodes:[...(policyProfile==='CUSTOM_REDUCED'?['UNRECOGNIZED_REDUCED_PROFILE']:[]),...unavailable.flatMap(r=>r.reasonCodes)]};
 return {verdict:'VERIFIED',policyProfile,reasonCodes:results.filter(r=>r.status==='SKIP').flatMap(r=>r.reasonCodes)};
}
export function applyEnvironment(c:Configuration):Configuration {
 const vars:Record<ModuleId,string>={erc8004:'ERC8004_FILTER_ENABLED',a2a:'A2A_FILTER_ENABLED','aps-passport':'APS_FILTER_ENABLED','company-attestation':'COMPANY_FILTER_ENABLED','visa-tap':'TAP_FILTER_ENABLED'};
 for(const id of MODULE_IDS){const v=process.env[vars[id]];if(v!==undefined){if(v!=='true'&&v!=='false')throw new Error('INVALID_BOOLEAN_'+vars[id]);c.modules[id].enabled=v==='true';}}
 return c;
}
