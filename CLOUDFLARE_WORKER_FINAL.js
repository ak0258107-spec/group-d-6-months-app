const ALLOWED_ORIGINS = [
  "https://ak0258107-spec.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://ak0258107-spec.github.io",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({success:true,message:"GK BY PURUSHOTAM SIR Secure PDF API is running"},200,cors);
      }

      const accessToken=getBearerToken(request);
      if(!accessToken)return json({success:false,error:"Login required"},401,cors);

      const user=await getSupabaseUser(env,accessToken);
      if(!user?.id)return json({success:false,error:"Invalid or expired login"},401,cors);

      if(url.pathname==="/admin/upload" && request.method==="PUT"){
        await requireAdmin(env,accessToken,user.id);
        const incomingFileName=url.searchParams.get("filename")||request.headers.get("X-File-Name")||"study-material.pdf";
        const safeFileName=sanitizeFileName(incomingFileName);
        if(!safeFileName.toLowerCase().endsWith(".pdf"))return json({success:false,error:"Only PDF files are allowed"},400,cors);
        if(!request.body)return json({success:false,error:"PDF file is missing"},400,cors);

        const key=`pdfs/${new Date().getFullYear()}/${crypto.randomUUID()}-${safeFileName}`;
        await env.PDF_BUCKET.put(key,request.body,{
          httpMetadata:{contentType:"application/pdf",contentDisposition:"inline"},
          customMetadata:{uploadedBy:user.id,originalName:safeFileName,uploadedAt:new Date().toISOString()}
        });
        return json({success:true,key,fileName:safeFileName,message:"PDF uploaded successfully"},200,cors);
      }

      const readMatch=url.pathname.match(/^\/material\/([^/]+)\/read$/);
      if(readMatch && request.method==="GET"){
        const materialId=decodeURIComponent(readMatch[1]);
        const canRead=await callSupabaseRpc(env,accessToken,"can_read_material",{p_material_id:materialId});
        if(canRead!==true)return json({success:false,code:"VERIFICATION_REQUIRED",error:"पहले Class Verification पूरा करें, तभी PDF खुलेगी।"},403,cors);
        const material=await getMaterial(env,accessToken,materialId);
        if(!material?.storage_path)return json({success:false,error:"PDF information not found"},404,cors);
        return streamR2Pdf(env,material.storage_path,material.title,false,cors);
      }

      const downloadMatch=url.pathname.match(/^\/material\/([^/]+)\/download$/);
      if(downloadMatch && request.method==="GET"){
        const materialId=decodeURIComponent(downloadMatch[1]);
        const canDownload=await callSupabaseRpc(env,accessToken,"can_download_material",{p_material_id:materialId});
        if(canDownload!==true)return json({success:false,code:"TEST_REQUIRED",error:"PDF Download के लिए required Mock Test pass करना जरूरी है।"},403,cors);
        const material=await getMaterial(env,accessToken,materialId);
        if(!material?.storage_path)return json({success:false,error:"PDF information not found"},404,cors);
        return streamR2Pdf(env,material.storage_path,material.title,true,cors);
      }

      if(url.pathname==="/admin/file" && request.method==="DELETE"){
        await requireAdmin(env,accessToken,user.id);
        const key=url.searchParams.get("key");
        if(!key||!key.startsWith("pdfs/"))return json({success:false,error:"Invalid file key"},400,cors);
        await env.PDF_BUCKET.delete(key);
        return json({success:true,message:"PDF deleted successfully"},200,cors);
      }

      return json({success:false,error:"Route not found"},404,cors);
    } catch(error) {
      console.error(error);
      return json({success:false,error:error?.message||"Internal server error"},error?.status||500,cors);
    }
  }
};

function getBearerToken(request){
  const auth=request.headers.get("Authorization")||"";
  return auth.startsWith("Bearer ")?auth.slice(7).trim():null;
}
async function getSupabaseUser(env,accessToken){
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{
    headers:{Authorization:`Bearer ${accessToken}`,apikey:env.SUPABASE_ANON_KEY}
  });
  return response.ok?response.json():null;
}
async function requireAdmin(env,accessToken,userId){
  const response=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,{
    headers:supabaseHeaders(env,accessToken)
  });
  if(!response.ok)throw apiError(403,"Admin verification failed");
  const rows=await response.json();
  if(String(rows?.[0]?.role||"").toLowerCase()!=="admin")throw apiError(403,"Admin access required");
}
async function getMaterial(env,accessToken,materialId){
  const response=await fetch(`${env.SUPABASE_URL}/rest/v1/study_materials?id=eq.${encodeURIComponent(materialId)}&select=id,title,storage_path,access_mode,download_test_id,download_pass_percent&limit=1`,{
    headers:supabaseHeaders(env,accessToken)
  });
  if(!response.ok)throw apiError(response.status,"Unable to load PDF information");
  const rows=await response.json();
  return rows?.[0]||null;
}
async function callSupabaseRpc(env,accessToken,functionName,payload){
  const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`,{
    method:"POST",
    headers:{...supabaseHeaders(env,accessToken),"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  if(!response.ok)throw apiError(response.status,"Permission check failed");
  return response.json();
}
function supabaseHeaders(env,accessToken){
  return {apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${accessToken}`,Accept:"application/json"};
}
async function streamR2Pdf(env,key,title,download,cors){
  if(!key.startsWith("pdfs/"))return json({success:false,error:"This PDF is not stored in R2"},404,cors);
  const object=await env.PDF_BUCKET.get(key);
  if(!object)return json({success:false,error:"PDF file not found"},404,cors);
  const headers=new Headers(cors);
  object.writeHttpMetadata(headers);
  headers.set("Content-Type","application/pdf");
  headers.set("Cache-Control","private, no-store, max-age=0");
  headers.set("X-Content-Type-Options","nosniff");
  const safeTitle=ensurePdfName(sanitizeFileName(title||key.split("/").pop()||"study-material.pdf"));
  headers.set("Content-Disposition",`${download?"attachment":"inline"}; filename="${safeTitle}"`);
  return new Response(object.body,{status:200,headers});
}
function isAllowedOrigin(origin){
  if(!origin)return true;
  return ALLOWED_ORIGINS.some(allowed=>origin===allowed||origin.startsWith(allowed+":"));
}
function sanitizeFileName(name){
  return String(name).replace(/[^\p{L}\p{N}._ -]/gu,"_").replace(/\s+/g,"-").replace(/-+/g,"-").slice(0,150);
}
function ensurePdfName(name){return name.toLowerCase().endsWith(".pdf")?name:`${name}.pdf`}
function apiError(status,message){const e=new Error(message);e.status=status;return e}
function json(data,status,cors){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
  });
}
