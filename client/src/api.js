export async function api(path,body){
 const response=await fetch('/api'+path,{credentials:'same-origin',headers:body!==undefined?{'Content-Type':'application/json'}:{},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({error:'Backend could not be reached. Check that the API is running.'}));
 if(!response.ok)throw new Error(data.error||'Request failed.');return data;
}
