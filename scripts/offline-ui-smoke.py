"""Offline UI-only test. Uses recorded synthetic HTTP fixtures, never live browser requests.

This is NOT a live browser E2E test. Start the local demo only to record synthetic
fixtures using Python before launching the browser; all browser networking is
aborted. The actions below exercise client rendering with fixed responses only.
"""
import asyncio, copy, json, os, re, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'/'demo'/'screenshots'
def capture():
 token=(ROOT/'.state/verifier/admin-token').read_text().strip()
 def get(port,path,body=None,admin=False):
  h={'content-type':'application/json'}
  if admin:h['authorization']='Bearer '+token
  request=urllib.request.Request(f'http://127.0.0.1:{port}'+path,headers=h,data=None if body is None else json.dumps(body).encode())
  with urllib.request.urlopen(request,timeout=25) as response:return json.load(response)
 normal=get(3000,'/api/scenarios/normal/run',{})
 normal['result'].pop('ticket',None)
 normal['traceUrl']='https://offline.invalid/'
 docs=get(3000,'/api/documents')
 agentconfig=get(3000,'/api/public/config')
 trace=get(3001,'/api/v1/traces/'+normal['result']['traceId'],admin=True)
 traces=get(3001,'/api/v1/traces',admin=True)[:6]
 modules=get(3001,'/api/v1/modules',admin=True)
 # No private keys or administrator/ticket credentials are written to fixtures.
 return {'normal':normal,'docs':docs,'agentconfig':agentconfig,'trace':trace,'traces':traces,'modules':modules}
async def run():
 fixture=capture();OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  options={'headless':True}
  if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
  browser=await p.chromium.launch(**options)
  context=await browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
  await context.route('**/*',lambda route:route.abort())
  page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def load(app,responses):
   nonlocal page
   await page.close()
   page=await context.new_page();page.set_default_timeout(6000);page.on('pageerror',lambda e:errors.append(str(e)))
   source=(ROOT/'apps'/app/'index.html').read_text()
   source=re.sub(r'<link[^>]*>','',source)
   source=re.sub(r'<script[^>]*>.*?</script>','',source,flags=re.S)
   await page.set_content(source)
   await page.add_style_tag(content=(ROOT/'apps'/app/'style.css').read_text())
   await page.evaluate('''responses=>{window.fetch=async path=>{const value=responses[String(path)];if(value===undefined)throw new Error('UNEXPECTED_OFFLINE_FIXTURE '+path);return {ok:true,json:async()=>structuredClone(value)};};}''',responses)
   await page.add_script_tag(content=(ROOT/'apps'/app/'app.js').read_text())
  await load('agent-portal',{'/api/public/config':fixture['agentconfig'],'/api/documents':fixture['docs'],'/api/scenarios/normal/run':fixture['normal']})
  await page.wait_for_function("document.querySelectorAll('#scenario-grid button').length===13")
  await page.screenshot(path=str(OUT/'agent-setup-offline.png'),full_page=True)
  await page.locator('[data-page=scenarios]').click()
  await page.locator('[data-scenario=normal]').click()
  await page.wait_for_function("document.querySelector('#verdict').textContent==='VERIFIED'")
  assert await page.locator('#filters details').count()==5
  await page.screenshot(path=str(OUT/'agent-result-offline.png'),full_page=True)
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Agent mobile overflow'
  await page.screenshot(path=str(OUT/'agent-mobile-offline.png'),full_page=True)
  await page.set_viewport_size({'width':1440,'height':1000})
  await load('verifier-dashboard',{'/api/public/config':{'agentOrigin':'https://offline.invalid'},'/api/v1/modules':fixture['modules'],'/api/v1/traces':fixture['traces'],'/api/v1/traces/'+fixture['trace']['traceId']:fixture['trace']})
  await page.fill('#admin-token','OFFLINE-FIXTURE-NOT-A-SECRET')
  await page.locator('#login-form button').click()
  await page.wait_for_selector('#console:not([hidden])')
  await page.screenshot(path=str(OUT/'verifier-overview-offline.png'),full_page=True)
  await page.locator('#trace-rows button').first.click()
  await page.wait_for_selector('#detail:not([hidden])')
  assert await page.locator('#detail-filters details').count()==5
  await page.screenshot(path=str(OUT/'verifier-detail-offline.png'),full_page=True)
  await page.locator('[data-page=modules]').click()
  await page.screenshot(path=str(OUT/'verifier-modules-offline.png'),full_page=True)
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Dashboard mobile overflow'
  assert not errors,errors
  await browser.close()
 print('OFFLINE UI SMOKE PASS: Agent scenarios/results, five filter cards, administrator view rendering, trace detail, module view, mobile widths; no page errors. All browser network disabled. Not live browser E2E.')
asyncio.run(run())
