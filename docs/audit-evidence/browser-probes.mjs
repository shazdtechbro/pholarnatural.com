import { chromium } from 'playwright-core';
import fs from 'node:fs';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('pholar-cookie-consent-v1',JSON.stringify({essential:true,analytics:false,marketing:false})));
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push({route:new URL(page.url()).pathname,message:e.message}));
 const routes=['/','/shop','/shop/restorative-hair-oil','/services','/book','/cart','/checkout','/checkout/success','/order-confirmation','/book/confirmation','/about','/faq','/contact','/shipping-policy','/refund-policy','/privacy-policy','/terms-of-service','/admin','/admin/login','/admin/register','/admin/products','/admin/services','/admin/bookings','/admin/orders','/admin/discounts','/admin/settings','/missing-audit-page'];
 const results=[];
 for(const route of routes){const r=await page.goto('http://127.0.0.1:3000'+route,{waitUntil:'domcontentloaded',timeout:15000});await page.waitForTimeout(300);results.push({route,status:r.status(),landed:new URL(page.url()).pathname,title:await page.title()});}
 await page.goto('http://127.0.0.1:3000/',{waitUntil:'domcontentloaded',timeout:15000});
 await page.getByRole('button',{name:'Add to Cart',exact:true}).first().click();
 await page.waitForTimeout(300);const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('pholar-cart-v1')));
 await page.waitForTimeout(300);await page.reload({waitUntil:'domcontentloaded',timeout:15000});await page.waitForTimeout(500);
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('pholar-cart-v1')));
 results.push({probe:'Homepage add to cart survives reload',before:before.map(i=>({variant_id:i.variant_id,quantity:i.quantity})),after});
 for(const route of ['/','/shop','/services','/book','/cart','/checkout','/faq','/contact','/admin/login']){
 await page.setViewportSize({width:320,height:800});await page.goto('http://127.0.0.1:3000'+route,{waitUntil:'domcontentloaded',timeout:15000});
 results.push({probe:'320px width',route,...await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}))});
 }
 fs.writeFileSync('/tmp/pholar-browser-audit.json',JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({results,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
