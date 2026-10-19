// Local smoke-test server; live Telegram auth requires HTTPS and APP_URL on Vercel.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const routes={'/api/app':'../api/app.js','/api/learning':'../api/learning.js','/api/telegram':'../api/telegram.js','/api/trainer':'../api/trainer.js'};
 if(routes[url.pathname])return require(routes[url.pathname])(req,res);
 const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!/^(index\.html|platform\.js|learning-ui\.js|style\.css|images\/cards\/[A-Za-z0-9_]+\.png)$/.test(relative)){res.writeHead(404);return res.end('Not found');}
 try{const file=path.join(root,relative);res.setHeader('Content-Type',relative.endsWith('.js')?'application/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(fs.readFileSync(file));}
 catch{res.writeHead(404);res.end('Not found');}
}).listen(3000,'0.0.0.0',()=>console.log('Local preview: http://localhost:3000'));
