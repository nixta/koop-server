var express = require("express"),
  bodyParser = require('body-parser'),
  fs = require('fs'),
  pjson = require('./package.json'),
  koop = require('./lib');

module.exports = function( config ) {
  var app = express(), route, controller, model;

  // keep track of the registered services
  app.services = [];

  koop.config = config;

  // init the koop log based on config params 
  koop.log = new koop.Logger( config );

  // log every request
  //app.use(function(req, res, next) {
    //koop.log.debug("%s %s", req.method, req.url);
    //next();
  //});

  // store the sha so we know what version of koop this is 
  app.status = {
    version: pjson.version,
    //sha: fs.readFileSync( __dirname + '/.git/refs/heads/master' ).toString(),
    providers: {}
  };

  // handle POST requests 
  app.use(bodyParser());

  app.set('view engine', 'ejs');
  
  // serve the index 
  app.get("/", function(req, res, next) {
    res.render(__dirname + '/views/index');
  });

  // serve the index 
  app.get("/providers", function(req, res, next) {
    res.json(app.services);
  });

  // a generic rest info response object for geoservice compliance 
  var restInfo = {
    currentVersion: 10.21,
    fullVersion: "10.2.1",
    soapUrl: "",
    secureSoapUrl: "",
    authInfo: {
      isTokenBasedSecurity: false,
      tokenServicesUrl: "",
      shortLivedTokenValidity: 60
    }
  };
 
  app.all("/arcgis/rest/info", function(req,res){
    res.json( restInfo );
  });


  var restServices = {
    currentVersion: 10.21,
    folders: [],
    services: []
  };

  app.all("/arcgis/rest/services", function(req, res){
    restServices.services = app.services;  
    res.json( restServices );
  });

  // register providers into the app
  // sets up models, routes -> controllers/handlers 
  app.register = function(provider){
    // only register if the provider has a name 
    if ( provider.name ) {
      app.services.push( { type:'FeatureServer', name: provider.name.toLowerCase() });

      // save the provider onto the app
      model = new provider.model( koop );

      // pass the model to the controller
      controller = new provider.controller( model );

      // if a provider has a status object store it
      if ( provider.status ) {
        app.status.providers[provider.name] = provider.status;
      }

      // binds a series of standard routes
      if ( provider.name && provider.pattern ) {
        app._bindDefaultRoutes(provider.name, provider.pattern, controller );
      }

      // add each route, the routes let us override defaults etc. 
      app._bindRoutes( provider.routes, controller );
    }
  };

  var defaultRoutes = {
    'featureserver': ['/FeatureServer/:layer/:method', '/FeatureServer/:layer', '/FeatureServer'],
    'preview':['/preview'],
    'drop':['/drop']
  };  

  // assigns a series of default routes; assumes 
  app._bindDefaultRoutes = function( name, pattern, controller ){
    var routes, handler;
    for ( handler in defaultRoutes ){
      if ( controller[ handler ] ){
        defaultRoutes[ handler ].forEach(function(route){
          app[ 'get' ]( '/'+ name + pattern + route, controller[ handler ]);
        });
      }
    }
  };


  // bind each route in a list to controller handler
  app._bindRoutes = function( routes, controller ){
    for ( route in routes ){
      var path = route.split(' ');
      app[ path[0] ]( path[1], controller[ routes[ route ] ]);
    }
  };
  
  // init koop centralized file access  
  // this allows us to turn the FS access off globally
  koop.files = new koop.Files( koop );
  koop.tiles = new koop.Tiles( koop );
  koop.thumbnail = new koop.Thumbnail( koop );
  // Need the exporter to have access to the cache so we pass it Koop
  koop.exporter = new koop.Exporter( koop );
  koop.Cache = new koop.DataCache( koop );

  // Start the Cache DB with the conn string from config
  if ( config && config.db ) {
    if ( config.db.postgis ) {
      koop.Cache.db = koop.PostGIS.connect( config.db.postgis.conn );
    } else if ( config && config.db.sqlite ) {
      koop.Cache.db = koop.SQLite.connect( config.db.sqlite );
    }
    koop.Cache.db.log = koop.log;
  } else if (config && !config.db){
    console.log('Exiting since no DB configuration found in config');
    process.exit();
  }
 

  return app;
  
};
