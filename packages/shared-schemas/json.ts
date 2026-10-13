/** JSON parser rejecting duplicate/escaped-duplicate members, invalid UTF-8 and lone surrogates.
 * JSON.parse alone silently accepts duplicate members and is inappropriate for signed input.
 */
export function parseJsonStrict(input:Buffer|string,maxDepth=32):unknown {
  const text=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true}).decode(input);
  let i=0;const ws=()=>{while(/[ \t\r\n]/.test(text[i]??'!'))i++;};
  const fail=():never=>{throw new Error('INVALID_JSON');};
  function str():string {
    if(text[i]!=='"')return fail();const start=i++;let escaped=false;
    while(i<text.length){const c=text[i++];if(c==='"'&&!escaped){const s=JSON.parse(text.slice(start,i));if(!s.isWellFormed())throw new Error('INVALID_UNICODE');return s;}if(c==='\\'&&!escaped)escaped=true;else escaped=false;}
    return fail();
  }
  function val(depth:number):unknown {
    if(depth>maxDepth)throw new Error('JSON_DEPTH_LIMIT');ws();const c=text[i];
    if(c==='"')return str();
    if(c==='{') {i++;const out:Record<string,unknown>=Object.create(null),keys=new Set<string>();ws();if(text[i]==='}'){i++;return out;}
      while(true){ws();const k=str();if(keys.has(k))throw new Error('DUPLICATE_JSON_KEY');keys.add(k);ws();if(text[i++]!==':')return fail();out[k]=val(depth+1);ws();if(text[i]==='}'){i++;return out;}if(text[i++]!==',')return fail();}
    }
    if(c==='['){i++;const out:unknown[]=[];ws();if(text[i]===']'){i++;return out;}while(true){if(out.length>=2048)throw new Error('JSON_ARRAY_LIMIT');out.push(val(depth+1));ws();if(text[i]===']'){i++;return out;}if(text[i++]!==',')return fail();}}
    for(const [s,v] of [['true',true],['false',false],['null',null]] as const){if(text.slice(i,i+s.length)===s){i+=s.length;return v;}}
    const m=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if(!m)return fail();i+=m[0].length;const n=Number(m[0]);
    if(!Number.isFinite(n)||(Number.isInteger(n)&&!Number.isSafeInteger(n)))throw new Error('NUMBER_RANGE');return n;
  }
  const out=val(0);ws();if(i!==text.length)fail();return out;
}
export type Schema = {type?:string;properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean|Schema;items?:Schema;enum?:unknown[];const?:unknown;pattern?:string;minLength?:number;maxLength?:number;minimum?:number;maximum?:number;minItems?:number;maxItems?:number;anyOf?:Schema[]};
export class ValidationError extends Error { constructor(message:string){super(message);this.name='ValidationError';} }
export function validate<T>(schema:Schema,value:unknown,path='$'):T {
  const no=(m:string):never=>{throw new ValidationError(path+': '+m);};
  if(schema.anyOf){for(const s of schema.anyOf){try{return validate<T>(s,value,path);}catch{}}return no('no matching schema');}
  if('const' in schema&&value!==schema.const)no('incorrect constant');
  if(schema.enum&&!schema.enum.includes(value))no('unexpected enum value');
  if(schema.type==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value))no('expected object');const o=value as Record<string,unknown>;
    for(const k of schema.required??[])if(!(k in o))no('missing '+k);
    for(const [k,v]of Object.entries(o)){const s=schema.properties?.[k];if(s)validate(s,v,path+'.'+k);else if(schema.additionalProperties===false)no('unexpected '+k);else if(typeof schema.additionalProperties==='object')validate(schema.additionalProperties,v,path+'.'+k);}
  }
  if(schema.type==='array') {if(!Array.isArray(value))no('expected array');const a=value as unknown[];if(a.length<(schema.minItems??0)||a.length>(schema.maxItems??2048))no('array length');a.forEach((v,i)=>schema.items&&validate(schema.items,v,path+'['+i+']'));}
  if(schema.type==='string'){if(typeof value!=='string')no('expected string');const s=value as string;if(s.length<(schema.minLength??0)||s.length>(schema.maxLength??8192))no('string length');if(schema.pattern&&!new RegExp(schema.pattern).test(s))no('format');}
  if(schema.type==='number'||schema.type==='integer'){if(typeof value!=='number'||!Number.isFinite(value))no('expected number');const n=value as number;if(schema.type==='integer'&&!Number.isSafeInteger(n))no('expected safe integer');if(n<(schema.minimum??-Infinity)||n>(schema.maximum??Infinity))no('number range');}
  if(schema.type==='boolean'&&typeof value!=='boolean')no('expected boolean');
  return value as T;
}
