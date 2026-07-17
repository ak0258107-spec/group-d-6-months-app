
const sb=window.supabase.createClient(APP_CONFIG.SUPABASE_URL,APP_CONFIG.SUPABASE_PUBLISHABLE_KEY);
async function requireAuth(){const {data:{session}}=await sb.auth.getSession();if(!session){location.href='index.html';return null}return session.user}
async function getProfile(id){const {data}=await sb.from('profiles').select('*').eq('id',id).maybeSingle();return data}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fmtDate(s){return new Date(s+'T00:00:00').toLocaleDateString('hi-IN')}
async function logout(){await sb.auth.signOut();location.href='index.html'}
window.sb=sb;window.requireAuth=requireAuth;window.getProfile=getProfile;window.esc=esc;window.fmtDate=fmtDate;window.logout=logout;
