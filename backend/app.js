const express = require('express');
const app = express();
const port = 3000;

// const {getEvent}  = require('lambda/getEvent');
const getEventPage = require('./lambda/getEventPage');
const createOrder = require("./lambda/createOrder");
const viewOrder = require("./lambda/viewOrder");
const createEvent = require("./lambda/createEvent");
// 미들웨어: JSON 바디 파싱
app.use(express.json());

// 기본 라우터
app.get('/getEventPage/:id', async (req, res) =>  {
    let event = {
        pathParameters:{
            event_key: req.params.id
        }
    }
    let resp = await getEventPage.handler(event);
    res.send(resp.body);
});


app.get('/viewOrder/:orderNo/:orderId', async (req, res) =>  {
    const { orderNo, orderId } = req.params;
    let event = {
        pathParameters:{
            order_no: orderNo,
            order_id: orderId,
        }
    }
    let resp = await viewOrder.handler(event);
    res.send(resp.body);
});


app.get('/viewOrder/:orderNo', async (req, res) =>  {
    const { orderNo, orderId = "noInput" } = req.params;
    let event = {
        pathParameters:{
            order_no: orderNo,
            order_id: orderId,
        }
    }
    let resp = await viewOrder.handler(event);
    res.send(resp.body);
});

// 예시: POST 요청 처리
app.post('/createOrder', async(req, res) => {
    const data = req.body;
    console.log('Received data:', data);
    let event = {
          body:data
    }
    let resp = await createOrder.handler(event);
    console.log(resp.statusCode);
    res.status(resp.statusCode).send(resp.body);
});


// 예시: POST 요청 처리
app.post('/create-event', async(req, res) => {
    const data = req.body;
    console.log('Received data:', data);
    let event = {
        body:data
    };
    let resp = await createEvent.handler(event);
    console.log(resp.statusCode);
    res.status(resp.statusCode).send(resp.body);
});


app.get('/:id', async (req, res) =>  {
    let event = {
        pathParameters:{
            event_key: req.params.id
        }
    }
    let resp = await getEventPage.handler(event);
    res.send(resp.body);
});

app.get('/', (req, res) => {
    res.send('Hello from internet!');
});

// 예시: POST 요청 처리
app.post('/api/data', (req, res) => {
    const data = req.body;
    console.log('Received data:', data);
    res.status(201).json({ message: 'Data received', data });
});

// 서버 시작
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});