/** Reproducible pinned dependencies; never modifies an existing different checkout. */
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'contracts');
const pins=JSON.parse(readFileSync(resolve(dir,'dependencies.json'),'utf8'));
function run(command:string,args:string[],cwd=root){const result=spawnSync(command,args,{cwd,stdio:'inherit'});if(result.status!==0)throw new Error(command+' failed');}
for(const name of ['openzeppelin-contracts','forge-std']){
 const pin=pins[name],path=resolve(dir,'lib',name);
 if(!existsSync(path)){mkdirSync(resolve(dir,'lib'),{recursive:true});run('git',['clone','--no-checkout',pin.repository,path]);run('git',['checkout','--detach',pin.commit],path);}
 const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:path,encoding:'utf8'});
 if(revision.status!==0||revision.stdout.trim()!==pin.commit)throw new Error('DEPENDENCY_PIN_MISMATCH: '+name);
 const clean=spawnSync('git',['status','--porcelain'],{cwd:path,encoding:'utf8'});
 if(clean.status!==0||clean.stdout.trim())throw new Error('DEPENDENCY_DIRTY: '+name);
}
run('forge',['build','--root',dir]);
const artifacts:Record<string,unknown>={compiler:pins.solidity,openzeppelin:pins['openzeppelin-contracts'].version};
for(const name of ['DemoToken','AgentProofDemoExchange']){
 const artifact=JSON.parse(readFileSync(resolve(dir,'out',name+'.sol',name+'.json'),'utf8'));
 artifacts[name]={abi:artifact.abi,bytecode:artifact.bytecode.object,deployedBytecode:artifact.deployedBytecode.object};
}
writeFileSync(resolve(dir,'out','deployment-artifacts.json'),JSON.stringify(artifacts,null,2)+'\n');
console.log('Deployment artifacts: contracts/out/deployment-artifacts.json (local build; no transaction submitted)');
