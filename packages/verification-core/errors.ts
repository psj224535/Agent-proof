export class VerificationFailure extends Error {
  code:string; constructor(code:string,message=code){super(message);this.code=code;this.name='VerificationFailure';}
}
export class SourceUnavailable extends Error {
  code:string; constructor(code='SOURCE_UNAVAILABLE'){super(code);this.code=code;this.name='SourceUnavailable';}
}
export function ensure(condition:unknown,code:string):asserts condition {if(!condition)throw new VerificationFailure(code);}
