const client=require('prom-client');
const {query}=require('./db');

client.collectDefaultMetrics({prefix:'maquillaje_'});
const httpDuration=new client.Histogram({
  name:'maquillaje_http_request_duration_seconds',help:'Duración de solicitudes HTTP',
  labelNames:['method','route','status'],buckets:[.01,.05,.1,.25,.5,1,2,5]
});
const googleConnected=new client.Gauge({name:'maquillaje_google_calendar_connected',help:'1 si Google Calendar está conectado'});
const googleJobs=new client.Gauge({name:'maquillaje_google_calendar_sync_jobs',help:'Trabajos de sincronización por estado',labelNames:['state']});

function middlewareMetricas(req,res,next){
  const fin=httpDuration.startTimer();
  res.on('finish',()=>fin({method:req.method,route:req.route?.path||req.path,status:String(res.statusCode)}));
  next();
}

async function endpointMetricas(_req,res){
  try {
    const conexion=await query('SELECT EXISTS(SELECT 1 FROM google_oauth WHERE id=1) conectado');
    googleConnected.set(conexion.rows[0].conectado?1:0);
    const estados=await query('SELECT estado,COUNT(*)::int total FROM google_sync_jobs GROUP BY estado');
    googleJobs.reset(); estados.rows.forEach(x=>googleJobs.set({state:x.estado},x.total));
  } catch (_) {}
  res.set('Content-Type',client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports={middlewareMetricas,endpointMetricas};
