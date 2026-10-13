import type {RegistrySnapshot,Registration,RuntimeBinding,Presentation,Configuration,TrustStore,Transport,ModuleResult,ModuleId,JsonObject} from '../shared-schemas/types.ts';
import type {Fetcher} from '../network/safe-fetch.ts';
import type {Store} from '../storage/store.ts';
import type {SignatureParameters} from '../visa-tap-filter/http-signatures.ts';
export interface RegistryReader {read(identity:Presentation['claimedIdentity'],signal?:AbortSignal):Promise<RegistrySnapshot|null>}
export interface Context {
 bundle:Presentation;transport:Transport;configuration:Configuration;
 store:Store;fetcher:Fetcher;registryReader:RegistryReader;trust:TrustStore;
 chainId:number;registryAddress:string;audience:string;allowedVersions:string[];
 now:number;traceId:string;signal:AbortSignal;evidence:Record<string,unknown>;
 results:ModuleResult[];snapshot?:RegistrySnapshot;registration?:Registration;binding?:RuntimeBinding;
 challengeId?:string;tap?:SignatureParameters;
}
export interface VerificationModule {
 id:ModuleId;name:string;version:string;enabled:boolean;required:boolean;dependencies:ModuleId[];
 verify(context:Context):Promise<ModuleResult>;
}
export function identityEquals(a:Presentation['claimedIdentity'],b:Presentation['claimedIdentity']):boolean {
 return a.chainId===b.chainId&&a.registry.toLowerCase()===b.registry.toLowerCase()&&a.agentId===b.agentId;
}
export function identityScope(c:Context):string{return `${c.bundle.claimedIdentity.chainId}:${c.bundle.claimedIdentity.registry.toLowerCase()}:${c.bundle.claimedIdentity.agentId}:${c.binding?.runtimeKeyId??''}:${c.audience}`;}
