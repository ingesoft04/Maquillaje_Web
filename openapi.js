module.exports={
  openapi:'3.0.3',
  info:{title:'Arte & Belleza SENA API',version:'2.0.0',description:'API de agenda, CRM, pagos, inventario y administración.'},
  servers:[{url:'/api',description:'Servidor actual'}],
  tags:[
    {name:'Autenticación'},{name:'Catálogo'},{name:'Citas'},{name:'Perfil cosmético'},
    {name:'Pagos'},{name:'Inventario'},{name:'Agenda avanzada'},{name:'Administración'}
  ],
  components:{
    securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}},
    schemas:{
      Error:{type:'object',properties:{error:{type:'string'}}},
      Login:{type:'object',required:['email','password'],properties:{email:{type:'string',format:'email'},password:{type:'string',format:'password'}}},
      Cita:{type:'object',required:['especialista_id','tipo_id','fecha','hora'],properties:{especialista_id:{type:'integer'},tipo_id:{type:'integer'},fecha:{type:'string',format:'date'},hora:{type:'string',example:'10:00'},notas:{type:'string'}}},
      Pago:{type:'object',required:['cita_id','monto','metodo'],properties:{cita_id:{type:'string',format:'uuid'},monto:{type:'number'},metodo:{type:'string',enum:['efectivo','transferencia','tarjeta','otro']},referencia:{type:'string'}}}
    }
  },
  paths:{
    '/auth/registro':{post:{tags:['Autenticación'],summary:'Crear cuenta',requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['nombre','email','password'],properties:{nombre:{type:'string'},email:{type:'string'},telefono:{type:'string'},password:{type:'string'}}}}}},responses:{201:{description:'Cuenta creada'},409:{description:'Correo duplicado'}}}},
    '/auth/login':{post:{tags:['Autenticación'],summary:'Iniciar sesión',requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Login'}}}},responses:{200:{description:'JWT y usuario'},401:{description:'Credenciales incorrectas'}}}},
    '/auth/perfil':{get:{tags:['Autenticación'],summary:'Perfil autenticado',security:[{bearerAuth:[]}],responses:{200:{description:'Perfil'}}}},
    '/tipos':{get:{tags:['Catálogo'],summary:'Servicios activos',responses:{200:{description:'Catálogo'}}}},
    '/especialistas':{get:{tags:['Catálogo'],summary:'Especialistas activas',responses:{200:{description:'Catálogo'}}}},
    '/citas':{
      get:{tags:['Citas'],summary:'Citas del usuario',security:[{bearerAuth:[]}],responses:{200:{description:'Listado'}}},
      post:{tags:['Citas'],summary:'Agendar cita',security:[{bearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Cita'}}}},responses:{201:{description:'Cita creada'},409:{description:'Horario no disponible'}}}
    },
    '/citas/disponibilidad':{get:{tags:['Citas'],summary:'Calcular horas disponibles según jornada y duración',security:[{bearerAuth:[]}],parameters:[{in:'query',name:'especialista_id',required:true,schema:{type:'integer'}},{in:'query',name:'fecha',required:true,schema:{type:'string',format:'date'}},{in:'query',name:'tipo_id',required:true,schema:{type:'integer'}}],responses:{200:{description:'Horas disponibles y ocupadas'}}}},
    '/citas/{id}/reprogramar':{patch:{tags:['Citas'],summary:'Reprogramar cita propia',security:[{bearerAuth:[]}],parameters:[{in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{content:{'application/json':{schema:{$ref:'#/components/schemas/Cita'}}}},responses:{200:{description:'Reprogramada'},409:{description:'Conflicto'}}}},
    '/perfil-cosmetico':{
      get:{tags:['Perfil cosmético'],security:[{bearerAuth:[]}],summary:'Consultar ficha',responses:{200:{description:'Ficha'}}},
      put:{tags:['Perfil cosmético'],security:[{bearerAuth:[]}],summary:'Crear o actualizar ficha',responses:{200:{description:'Ficha guardada'}}}
    },
    '/pagos/mis':{get:{tags:['Pagos'],security:[{bearerAuth:[]}],summary:'Pagos de la cliente',responses:{200:{description:'Pagos'}}}},
    '/admin/pagos':{
      get:{tags:['Pagos'],security:[{bearerAuth:[]}],summary:'Todos los pagos',responses:{200:{description:'Pagos'}}},
      post:{tags:['Pagos'],security:[{bearerAuth:[]}],summary:'Registrar pago',requestBody:{content:{'application/json':{schema:{$ref:'#/components/schemas/Pago'}}}},responses:{201:{description:'Pago registrado'}}}
    },
    '/admin/inventario':{
      get:{tags:['Inventario'],security:[{bearerAuth:[]}],summary:'Productos y alertas',responses:{200:{description:'Inventario'}}},
      post:{tags:['Inventario'],security:[{bearerAuth:[]}],summary:'Crear producto',responses:{201:{description:'Producto creado'}}}
    },
    '/admin/analitica':{get:{tags:['Administración'],security:[{bearerAuth:[]}],summary:'Indicadores operativos y financieros',responses:{200:{description:'Analítica'}}}},
    '/admin/horarios':{get:{tags:['Agenda avanzada'],security:[{bearerAuth:[]}],summary:'Jornadas por especialista',responses:{200:{description:'Horarios'}}},post:{tags:['Agenda avanzada'],security:[{bearerAuth:[]}],summary:'Crear tramo laboral',responses:{201:{description:'Horario creado'}}}},
    '/admin/bloqueos':{get:{tags:['Agenda avanzada'],security:[{bearerAuth:[]}],summary:'Vacaciones y bloqueos',responses:{200:{description:'Bloqueos'}}},post:{tags:['Agenda avanzada'],security:[{bearerAuth:[]}],summary:'Crear bloqueo',responses:{201:{description:'Bloqueo creado'}}}}
  }
};
