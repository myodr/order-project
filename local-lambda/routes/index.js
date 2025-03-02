var express = require('express');
var router = express.Router();

const getEvent = require("../../lambda/getEvent");
const getEventPage = require("../../lambda/getEventPage");
const createProduct = require("../../lambda/createProduct")
const createEvent = require("../../lambda/createEvent");
/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/createProduct', async function(req, res, next){

  //body 가 string 으로 넘어가도록 req.body 재정의
  let event = {
    body : JSON.stringify(req.body)
  }
  let response = await createProduct.handler(event);
  res.status(response.statusCode)
  res.send(response.body);
});

router.post('/createEvent', async function(req, res, next){

  //body 가 string 으로 넘어가도록 req.body 재정의
  let event = {
    body : JSON.stringify(req.body)
  }
  let response = await createEvent.handler(event);
  res.status(response.statusCode)
  res.send(response.body);
});

router.get ('/getEvent/:event_id', async function(req, res, next){
  //aws api-gateway pathParameters 지정을 위해 node의 path param을
  //event 로 wrap하여 전달
  const event = {
    pathParameters : {
      event_id: req.params.event_id
    }
  }

  let response = await getEvent.handler(event);
  res.status(response.statusCode);
  res.send(response.body);
});

router.get ('/getEventPage/:event_id', async function(req, res, next){
  //aws api-gateway pathParameters 지정을 위해 node의 path param을
  //event 로 wrap하여 전달
  const event = {
    pathParameters : {
      event_id: req.params.event_id
    }
  }

  let response = await getEventPage.handler(event);
  res.status(response.statusCode);
  res.send(response.body);
});

module.exports = router;
