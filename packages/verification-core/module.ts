import {hash,iso} from '../crypto/index.ts';
import type {ModuleId,ModuleConfig,ModuleResult,Status,JsonObject} from '../shared-schemas/types.ts';
import type {Context,VerificationModule} from './context.ts';
import {SourceUnavailable,VerificationFailure} from './errors.ts';
import {ValidationError} from '../shared-schemas/json.ts';
export interface Outcome {status?:Status;reasonCodes?:string[];message?:string;expiresAt?:string}
export function makeModule(id:ModuleId,name:string,config:ModuleConfig,dependencies:ModuleId[],check:(ctx:Context)=>Promise<Outcome>):VerificationModule {
 return {id,name,version:'1.0.0',enabled:config.enabled,required:config.required,dependencies,
  async verify(ctx:Context):Promise<ModuleResult>{
   const started=performance.now();let out:Outcome;
   try{out=await check(ctx);}
   catch(e){
    if(e instanceof VerificationFailure)out={status:'FAIL',reasonCodes:[e.code],message:e.message};
    else if(e instanceof SourceUnavailable)out={status:'ERROR',reasonCodes:[e.code],message:'독립 출처를 조회하지 못했습니다. 위조로 단정하지 않습니다.'};
    else if(e instanceof ValidationError)out={status:'FAIL',reasonCodes:['DOCUMENT_SCHEMA_INVALID'],message:e.message};
    else out={status:'FAIL',reasonCodes:['CRYPTO_OR_INTERNAL_SAFE_FAILURE'],message:'검증을 안전하게 완료하지 못했습니다.'};
   }
   const r:Omit<ModuleResult,'outputHash'>={moduleId:id,status:out.status??'PASS',reasonCodes:out.reasonCodes??['CHECK_PASSED'],humanReadableReason:out.message??'설정된 검사를 통과했습니다.',evidence:ctx.evidence as JsonObject,observedAt:iso(ctx.now),expiresAt:out.expiresAt??null,durationMs:Math.max(0,Math.round(performance.now()-started)),inputHash:hash({bundleHash:ctx.bundle.bundleHash,configurationVersion:ctx.configuration.version,priorOutputs:ctx.results.map(r=>r.outputHash)})};
   return {...r,outputHash:hash(r)};
  }
 };
}
export function skipped(id:ModuleId,ctx:Context,reason:string):ModuleResult {
 const r:Omit<ModuleResult,'outputHash'>={moduleId:id,status:'SKIP',reasonCodes:[reason],humanReadableReason:reason==='DISABLED_BY_ADMIN'?'관리자가 비활성화했습니다. PASS가 아닙니다.':'필요한 선행 증거가 없어 실행하지 않았습니다.',evidence:{},observedAt:iso(ctx.now),expiresAt:null,durationMs:0,inputHash:hash({bundleHash:ctx.bundle.bundleHash,configurationVersion:ctx.configuration.version})};return {...r,outputHash:hash(r)};
}
