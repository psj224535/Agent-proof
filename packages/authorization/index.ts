export interface ProposedAction {merchant:string;productId:string;amount:number;currency:string;quantity:number}
export interface AuthorizationPolicy {version:string;[key:string]:unknown}
export interface AuthorizationModule {authorize(input:{authenticationTicket:string;action:ProposedAction;policy?:AuthorizationPolicy}):Promise<{verdict:'ALLOW'|'ASK'|'DENY';reasonCodes:string[]}>}
/** Not wired to mock access: authentication must never imply a real spending permission. */
export class UnimplementedAuthorization implements AuthorizationModule {
 async authorize():Promise<{verdict:'DENY';reasonCodes:string[]}>{return {verdict:'DENY',reasonCodes:['AUTHORIZATION_NOT_IMPLEMENTED']};}
}
