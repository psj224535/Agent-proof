"""Optional real-browser smoke test. Start `npm start` first; install Python playwright."""
import asyncio, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'/'screenshots'
async def run():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  launch={'headless':True}
  if os.environ.get('CHROMIUM_PATH'):launch['executable_path']=os.environ['CHROMIUM_PATH']
  browser=await p.chromium.launch(**launch)
  page=await browser.new_page(viewport={'width':1440,'height':1050},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:3000/')
  await page.wait_for_function("document.querySelectorAll('#scenario-grid button').length === 13")
  await page.locator('#prepare-all').click()
  await page.wait_for_function("document.querySelector('#setup-status').textContent.startsWith('준비 완료')")
  await page.screenshot(path=str(OUT/'agent-portal.png'),full_page=True)
  await page.locator('[data-page=scenarios]').click()
  await page.locator('[data-scenario=normal]').click()
  await page.wait_for_function("document.querySelector('#verdict').textContent === 'VERIFIED' && !document.querySelector('#result').hidden")
  await page.screenshot(path=str(OUT/'agent-result.png'),full_page=True)
  await page.locator('[data-page=scenarios]').click()
  await page.locator('[data-scenario=forged-passport]').click()
  await page.wait_for_function("document.querySelector('#verdict').textContent === 'REJECT'")
  await page.goto('http://127.0.0.1:3001/')
  await page.fill('#admin-token',(ROOT/'.state/verifier/admin-token').read_text())
  await page.locator('#login-form button').click()
  await page.wait_for_selector('#console:not([hidden])')
  await page.screenshot(path=str(OUT/'verifier-dashboard.png'),full_page=True)
  await page.locator('#trace-rows button').first.click()
  await page.wait_for_selector('#detail:not([hidden])')
  await page.screenshot(path=str(OUT/'verifier-detail.png'),full_page=True)
  await page.locator('[data-page=modules]').click()
  await page.screenshot(path=str(OUT/'verifier-modules.png'),full_page=True)
  await page.set_viewport_size({'width':390,'height':844})
  await page.goto('http://127.0.0.1:3000/')
  await page.screenshot(path=str(OUT/'agent-mobile.png'),full_page=True)
  assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow'
  assert not errors,errors
  print('Browser smoke PASS: setup; normal VERIFIED; forged Passport REJECT; admin login; trace detail; module view; mobile width. No page errors.')
  await browser.close()
asyncio.run(run())
