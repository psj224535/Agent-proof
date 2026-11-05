import {randomHex, hash, without} from '../crypto/index.ts';
import {uint256, validateTradeIntent} from './schema.ts';
import type {ExchangeListing, OnchainTradeIntent, TradeAuthorizationPolicy} from './types.ts';

export const DEMO_SCORE_NOTICE='이 점수는 시스템 흐름 검증을 위한 합성 데모 데이터이며 실제 투자 전망이나 금융 조언이 아닙니다.';
export const SUPPORTED_INTENT='BUY_HIGHEST_DEMO_SCORE_TOKEN';
/** Deliberately bounded parser: no claim of understanding arbitrary natural language. */
export function parseTradingGoal(value:unknown):typeof SUPPORTED_INTENT {
  if(typeof value!=='string'||value.length>500)throw new Error('UNSUPPORTED_TRADING_INTENT');
  const normalized=value.normalize('NFKC').trim().replace(/[.!。]$/,'').replace(/\s+/g,' ').toLowerCase();
  const supported=[
    '내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘',
    '가장 높은 데모 점수의 테스트 코인을 사줘',
    'buy the highest demo score token within my budget',
    'buy_highest_demo_score_token'
  ];
  if(!supported.includes(normalized))throw new Error('UNSUPPORTED_TRADING_INTENT');return SUPPORTED_INTENT;
}
export function parseUnitsExact(value:string, decimals=18):bigint {
  if(!Number.isSafeInteger(decimals)||decimals<0||decimals>36)throw new Error('DECIMALS_INVALID');
  if(typeof value!=='string'||value.length>120||!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))throw new Error('DECIMAL_FORMAT_INVALID');
  const [whole,fraction='']=value.split('.');if(fraction.length>decimals)throw new Error('DECIMAL_PRECISION_EXCEEDED');
  return uint256((BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction||'0').padEnd(decimals,'0'))).toString());
}
export function formatUnitsExact(value:string|bigint,decimals=18):string {
  const n=uint256(String(value));if(!Number.isSafeInteger(decimals)||decimals<0||decimals>36)throw new Error('DECIMALS_INVALID');
  if(decimals===0)return String(n);const unit=10n**BigInt(decimals);
  const tail=String(n%unit).padStart(decimals,'0').replace(/0+$/,'');return String(n/unit)+(tail?'.'+tail:'');
}
export function purchaseCost(quantity:string,pricePerWholeTokenWei:string,decimals:number):bigint {
  if(!Number.isSafeInteger(decimals)||decimals<0||decimals>36)throw new Error('DECIMALS_INVALID');
  const numerator=uint256(quantity)*uint256(pricePerWholeTokenWei),unit=10n**BigInt(decimals);
  const cost=(numerator+unit-1n)/unit;return uint256(String(cost));
}
export function remainingBudget(policy:TradeAuthorizationPolicy,depositedBudgetWei:string):bigint {
  const total=uint256(policy.totalBudgetWei),spent=uint256(policy.spentWei),deposit=uint256(depositedBudgetWei);
  return total<=spent?0n:min(total-spent,deposit);
}
function min(...values:bigint[]):bigint{return values.reduce((a,b)=>a<b?a:b);}
export function budgetAwareQuantity(listing:ExchangeListing,budgetWei:string):string {
  const price=uint256(listing.pricePerWholeTokenWei);if(price===0n)throw new Error('LISTING_PRICE_INVALID');
  if(!Number.isSafeInteger(listing.decimals)||listing.decimals<0||listing.decimals>36)throw new Error('DECIMALS_INVALID');
  const quantity=min(uint256(budgetWei)*10n**BigInt(listing.decimals)/price,uint256(listing.inventory));
  return String(quantity);
}
export function selectHighestDemoScore(listings:ExchangeListing[],allowedTokens:string[]):ExchangeListing {
  const allowed=new Set(allowedTokens.map(t=>t.toLowerCase()));
  const eligible=listings.filter(l=>l.active&&allowed.has(l.token.toLowerCase())&&uint256(l.inventory)>0n&&uint256(l.pricePerWholeTokenWei)>0n);
  for(const l of eligible)if(!Number.isSafeInteger(l.demoScore)||l.demoScore<0||l.demoScore>100)throw new Error('DEMO_SCORE_INVALID');
  eligible.sort((a,b)=>b.demoScore-a.demoScore||a.token.toLowerCase().localeCompare(b.token.toLowerCase()));
  if(!eligible.length)throw new Error('NO_ALLOWED_ACTIVE_LISTING');return eligible[0];
}
export function policyHash(policy:Omit<TradeAuthorizationPolicy,'policyHash'>|TradeAuthorizationPolicy):string {
  return '0x'+hash(without(policy,'policyHash'));
}
export function actionHash(intent:OnchainTradeIntent):string{return '0x'+hash(validateTradeIntent(intent));}
export function createTradeIntent(input:{goal:string;merchant:string;policy:TradeAuthorizationPolicy;listings:ExchangeListing[];depositedBudgetWei:string;now?:number;ttlMs?:number}):{intent:OnchainTradeIntent;listing:ExchangeListing;costWei:string;reason:string} {
  parseTradingGoal(input.goal);const p=input.policy,listing=selectHighestDemoScore(input.listings,p.allowedTokens);
  const budget=min(remainingBudget(p,input.depositedBudgetWei),uint256(p.maxPerTradeWei));
  const quantity=budgetAwareQuantity(listing,String(budget));if(quantity==='0')throw new Error('BUDGET_CANNOT_BUY_TOKEN');
  const costWei=String(purchaseCost(quantity,listing.pricePerWholeTokenWei,listing.decimals));
  const now=input.now??Date.now(),ttl=input.ttlMs??120_000;
  const intent:OnchainTradeIntent={version:'agentproof-trade-v1',chainId:p.allowedChainId,exchangeContract:p.allowedExchange,
    buyerWallet:p.userWallet,agentIdentity:p.agentIdentity,executionWallet:p.executionWallet,action:'BUY',token:listing.token,
    quantity,maxTotalCostWei:costWei,merchant:input.merchant,purpose:'payment',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+ttl).toISOString(),nonce:randomHex(16)};
  validateTradeIntent(intent);return {intent,listing,costWei,reason:'HIGHEST_ALLOWED_ACTIVE_DEMO_SCORE'};
}
