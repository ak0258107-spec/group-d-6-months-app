const encoder=new TextEncoder();
const decoder=new TextDecoder();
function b64urlEncode(input){const bytes=input instanceof Uint8Array?input:new Uint8Array(input);let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function b64urlDecode(value=''){const base=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);const raw=atob(base);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
function concat(...arrays){const size=arrays.reduce((n,a)=>n+a.length,0);const out=new Uint8Array(size);let p=0;for(const a of arrays){out.set(a,p);p+=a.length}return out}
async function hmac(key,data){const cryptoKey=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,data))}
async function hkdfExtract(salt,ikm){return hmac(salt,ikm)}
async function hkdfExpand(prk,info,length){let output=new Uint8Array(0),previous=new Uint8Array(0),counter=1;while(output.length<length){previous=await hmac(prk,concat(previous,info,new Uint8Array([counter++])));output=concat(output,previous)}return output.slice(0,length)}
function json(data,status=200,origin='*'){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS','cache-control':'no-store'}})}
function allowedOrigin(request,env){const origin=request.headers.get('Origin')||'*';if(!env.APP_ORIGIN)return '*';return origin===env.APP_ORIGIN?origin:env.APP_ORIGIN}
async function supabaseUser(token,env){const response=await fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token}});if(!response.ok)return null;return response.json()}
function bearer(request){const value=request.headers.get('Authorization')||'';return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():''}
function serviceHeaders(env,extra={}){return {apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',...extra}}
async function isAdmin(userId,env){const url=env.SUPABASE_URL.replace(/\/$/,'')+`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role,is_active&limit=1`;const r=await fetch(url,{headers:serviceHeaders(env)});if(!r.ok)return false;const rows=await r.json();return String(rows?.[0]?.role||'').toLowerCase()==='admin'&&rows?.[0]?.is_active!==false}
async function createVapidJwt(endpoint,env){
  const publicRaw=b64urlDecode(env.VAPID_PUBLIC_KEY),privateRaw=b64urlDecode(env.VAPID_PRIVATE_KEY);
  if(publicRaw.length!==65||publicRaw[0]!==4||privateRaw.length!==32)throw new Error('Invalid VAPID key format');
  const x=b64urlEncode(publicRaw.slice(1,33)),y=b64urlEncode(publicRaw.slice(33,65)),d=b64urlEncode(privateRaw);
  const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x,y,d,ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const aud=new URL(endpoint).origin,now=Math.floor(Date.now()/1000);
  const header=b64urlEncode(encoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const payload=b64urlEncode(encoder.encode(JSON.stringify({aud,exp:now+43200,sub:env.VAPID_SUBJECT||'mailto:admin@example.com'})));
  const input=encoder.encode(header+'.'+payload);
  const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,input));
  return `${header}.${payload}.${b64urlEncode(signature)}`;
}
async function encryptPayload(subscription,payload){
  const clientPublic=b64urlDecode(subscription.p256dh),authSecret=b64urlDecode(subscription.auth);
  const clientKey=await crypto.subtle.importKey('raw',clientPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const serverKeys=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:clientKey},serverKeys.privateKey,256));
  const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',serverKeys.publicKey));
  const prkKey=await hkdfExtract(authSecret,shared);
  const keyInfo=concat(encoder.encode('WebPush: info\0'),clientPublic,serverPublic);
  const ikm=await hkdfExpand(prkKey,keyInfo,32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const prk=await hkdfExtract(salt,ikm);
  const cek=await hkdfExpand(prk,encoder.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await hkdfExpand(prk,encoder.encode('Content-Encoding: nonce\0'),12);
  const plaintext=concat(encoder.encode(JSON.stringify(payload)),new Uint8Array([2]));
  const aesKey=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},aesKey,plaintext));
  const rs=new Uint8Array(4);new DataView(rs.buffer).setUint32(0,4096);
  return concat(salt,rs,new Uint8Array([serverPublic.length]),serverPublic,cipher);
}
async function sendOne(subscription,payload,env){
  const body=await encryptPayload(subscription,payload),jwt=await createVapidJwt(subscription.endpoint,env);
  return fetch(subscription.endpoint,{method:'POST',headers:{TTL:'86400',Urgency:'high','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',Authorization:`vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`},body});
}
function generatorPage(){return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VAPID Key Generator</title><style>body{font-family:Arial;background:#eef5ff;padding:24px}.card{max-width:760px;margin:auto;background:white;padding:24px;border-radius:18px;box-shadow:0 15px 40px #0002}button{padding:13px 18px;border:0;border-radius:10px;background:#1769d2;color:white;font-weight:bold}textarea{width:100%;min-height:90px;margin:8px 0 18px;padding:10px}</style><div class="card"><h1>VAPID Keys Generator</h1><p>Generate दबाएँ। Public और Private key को Cloudflare Worker Variables/Secrets में save करें। Private key GitHub में कभी न डालें।</p><button onclick="go()">Generate Secure Keys</button><h3>VAPID_PUBLIC_KEY</h3><textarea id="pub" readonly></textarea><h3>VAPID_PRIVATE_KEY</h3><textarea id="priv" readonly></textarea></div><script>const e=b=>{let s='';new Uint8Array(b).forEach(x=>s+=String.fromCharCode(x));return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')};async function go(){const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const j=await crypto.subtle.exportKey('jwk',k.privateKey);const d=a=>Uint8Array.from(atob(a.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-a.length%4)%4)),c=>c.charCodeAt(0));const x=d(j.x),y=d(j.y),raw=new Uint8Array(65);raw[0]=4;raw.set(x,1);raw.set(y,33);pub.value=e(raw);priv.value=j.d}</script></html>`}
export default {async fetch(request,env){
  const url=new URL(request.url),origin=allowedOrigin(request,env);
  if(request.method==='OPTIONS')return json({ok:true},200,origin);
  if(url.pathname==='/setup/vapid-key-generator')return new Response(generatorPage(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  if(url.pathname==='/health')return json({ok:true,service:'group-d-notification-api',vapidConfigured:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)},200,origin);
  if(url.pathname==='/api/vapid-public-key'){
    if(!env.VAPID_PUBLIC_KEY)return json({error:'VAPID_PUBLIC_KEY Worker variable missing'},503,origin);
    return json({publicKey:env.VAPID_PUBLIC_KEY},200,origin);
  }
  const token=bearer(request);if(!token)return json({error:'Authorization required'},401,origin);
  const user=await supabaseUser(token,env);if(!user?.id)return json({error:'Invalid login session'},401,origin);
  if(url.pathname==='/api/subscribe'&&request.method==='POST'){
    const body=await request.json().catch(()=>({})),s=body.subscription||{};
    if(!s.endpoint||!s.keys?.p256dh||!s.keys?.auth)return json({error:'Invalid push subscription'},400,origin);
    const endpoint=env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/push_subscriptions?on_conflict=endpoint';
    const r=await fetch(endpoint,{method:'POST',headers:serviceHeaders(env,{Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify({user_id:user.id,endpoint:s.endpoint,p256dh:s.keys.p256dh,auth:s.keys.auth,user_agent:String(body.userAgent||'').slice(0,500),is_active:true,updated_at:new Date().toISOString()})});
    if(!r.ok)return json({error:'Subscription database save failed',detail:await r.text()},500,origin);
    return json({success:true},200,origin);
  }
  if(url.pathname==='/api/unsubscribe'&&request.method==='POST'){
    const body=await request.json().catch(()=>({}));if(!body.endpoint)return json({error:'endpoint required'},400,origin);
    const endpoint=env.SUPABASE_URL.replace(/\/$/,'')+`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(body.endpoint)}`;
    await fetch(endpoint,{method:'PATCH',headers:serviceHeaders(env),body:JSON.stringify({is_active:false,updated_at:new Date().toISOString()})});
    return json({success:true},200,origin);
  }
  if(url.pathname==='/api/send'&&request.method==='POST'){
    if(!(await isAdmin(user.id,env)))return json({error:'Admin access required'},403,origin);
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return json({error:'VAPID secrets are not configured'},503,origin);
    const body=await request.json().catch(()=>({}));if(!body.title||!body.message)return json({error:'title and message required'},400,origin);
    const q=env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/push_subscriptions?is_active=eq.true&select=id,endpoint,p256dh,auth';
    const sr=await fetch(q,{headers:serviceHeaders(env)});if(!sr.ok)return json({error:'Subscriptions could not be loaded'},500,origin);
    const subs=await sr.json(),payload={title:String(body.title).slice(0,120),message:String(body.message).slice(0,500),url:body.url||env.APP_ORIGIN||'/',tag:body.tag||'gk-update',notificationId:body.notificationId||null};
    let sent=0,failed=0,disabled=0;
    for(let i=0;i<subs.length;i+=20){
      const batch=subs.slice(i,i+20);
      const results=await Promise.all(batch.map(async s=>{try{const r=await sendOne(s,payload,env);return {s,status:r.status,ok:r.ok}}catch(error){return {s,status:0,ok:false,error:String(error)}}}));
      for(const result of results){if(result.ok)sent++;else{failed++;if(result.status===404||result.status===410){disabled++;const patch=env.SUPABASE_URL.replace(/\/$/,'')+`/rest/v1/push_subscriptions?id=eq.${result.s.id}`;await fetch(patch,{method:'PATCH',headers:serviceHeaders(env),body:JSON.stringify({is_active:false,updated_at:new Date().toISOString()})})}}}
    }
    return json({success:true,total:subs.length,sent,failed,disabled},200,origin);
  }
  return json({error:'Not found'},404,origin);
}};
