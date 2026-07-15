const client=require('prom-client');

client.collectDefaultMetrics({prefix:'maquillaje_'});
const httpDuration=new client.Histogram({
  name:'maquillaje_http_request_duration_seconds',help:'Duración de solicitudes HTTP',
  labelNames:['method','route','status'],buckets:[.01,.05,.1,.25,.5,1,2,5]
});

function middlewareMetricas(req,res,next){
  const fin=httpDuration.startTimer();
  res.on('finish',()=>fin({method:req.method,route:req.route?.path||req.path,status:String(res.statusCode)}));
  next();
}

async function endpointMetricas(_req,res){
  res.set('Content-Type',client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports={middlewareMetricas,endpointMetricas};
