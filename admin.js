
const API_BASE = "https://api.tallyxml.online";

function setToken(token){
  document.cookie=`admin_token=${encodeURIComponent(token)}; path=/; max-age=${7*24*60*60}`;
}

function getToken(){
  const row=document.cookie.split("; ").find(r=>r.startsWith("admin_token="));
  return row?decodeURIComponent(row.split("=")[1]):"";
}

async function api(path, opts={}){

  const headers=opts.headers||{};

  const token=getToken();

  if(token){
    headers.Authorization="Bearer "+token;
  }

  if(opts.json){
    headers["Content-Type"]="application/json";
    opts.body=JSON.stringify(opts.json);
    delete opts.json;
  }

  const res=await fetch(API_BASE+path,{...opts,headers});

  const data=await res.json();

  if(!res.ok){
    throw new Error(data.error || "Request failed");
  }

  return data;
}
