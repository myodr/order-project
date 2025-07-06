const express = require('express');
const app = express();
const port = 3000;

const getRawBody = require('raw-body'); // 추가 필요

// const {getEvent}  = require('lambda/getEvent');
const getEventPage = require('./lambda/getEventPage');
const createOrder = require("./lambda/createOrder");
const viewOrder = require("./lambda/viewOrder");
const adminOrderStatus = require("./lambda/adminOrderStatus");
const updateOrderStatus = require("./lambda/updateOrderStatus");

const createEventPage = require("./lambda/createEventPage");
const createEvent = require("./lambda/createEvent");
const uploadImage = require("./lambda/uploadImage");

const eventsList = require("./lambda/adminEventsList");

// URL-encoded form 파싱 (필수!)
app.use(express.urlencoded({ extended: true }));

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
            event_no: orderNo,
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
            event_no: orderNo,
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

app.get('/admin/createEvent' , async (req, res) =>{
    const {sellerId, eventId, token} = req.query;
    let event = {
        queryStringParameters: {sellerId, eventId, token}
    }
    let resp = await createEventPage.handler(event);
    res.send (resp.body);
});

app.get('/admin/events', async (req, res) =>{
    const {sellerId, token, filter, sort} = req.query;
    let event = {
        queryStringParameters: {sellerId, token, filter, sort}
    }
    let resp = await eventsList.handler(event);
    res.send (resp.body);

})

app.get('/admin/orders', async (req, res) =>  {

    const {eventId, scrollTo,sellerId, token} = req.query;
    console.log("eventId", eventId, "sellerId", sellerId);
    let event = {
        queryStringParameters:{
            eventId,
            scrollTo,
            sellerId,
            token
        }
    }
    console.log("event", event);
    let resp = await adminOrderStatus.handler(event);
    res.send(resp.body);
});

app.post('/admin/updateOrder', async(req, res) => {
    const data = new URLSearchParams(req.body);
    console.log('/admin/updateOrder Received data:', data);
    let event = {
        body:req.body
    };
    let resp = await updateOrderStatus.handler(event);

    console.log("check resp", resp);

    // res.status(resp.statusCode).send(resp.body);
    // 🔁 302 Redirect 처리
    if (resp.statusCode === 302 && resp.headers?.Location) {
        return res.redirect(resp.headers.Location); // 실제 리다이렉션
    }

    // 일반 응답 처리
    res.status(resp.statusCode || 200).send(resp.body);
});

app.post('/admin/createEvent', async (req,res) =>{

    const data = req.body;

    // 2️⃣ Lambda event 형식으로 변환
    const event = {
        body: data
    };

    let resp = await createEvent.handler(event);

    // 🔁 302 Redirect 처리
    if (resp.statusCode === 302 && resp.headers?.Location) {
        return res.redirect(resp.headers.Location); // 실제 리다이렉션
    }

    // 일반 응답 처리
    res.status(resp.statusCode || 200).send(resp.body);
})



app.post('/admin/uploadImage', async (req,res) =>{

    // 1️⃣ req.body를 직접 쓰지 않고, raw body를 수집
    const rawBodyBuffer = await getRawBody(req);

    // 2️⃣ Lambda event 형식으로 변환
    const event = {
        headers: req.headers,
        httpMethod: req.method,
        path: req.path,
        isBase64Encoded: true,
        body: rawBodyBuffer.toString('base64') // form-data는 string으로 넘겨야 Busboy가 파싱 가능
    };

    let resp = await uploadImage.handler(event);

    // 일반 응답 처리
    res.status(resp.statusCode || 200).send(resp.body);
})

app.get('/admin', (req, res) => {
    const sellerId = req.query.sellerId || '';
    const sellerParam = sellerId ? `?sellerId=${encodeURIComponent(sellerId)}` : '';
    res.send(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>판매자 관리 페이지</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
        <style>
          body { font-family: 'IBM Plex Sans KR', sans-serif; background: #f8f9fa; }
          .admin-nav { max-width: 480px; margin: 60px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 2.5rem 2rem; }
          .admin-nav .btn { width: 100%; margin-bottom: 1.2rem; font-size: 1.1em; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="admin-nav">
          <h4 class="text-center mb-4">판매자 관리자</h4>
          <a href="/admin/profile${sellerParam}" class="btn btn-outline-primary">My Profile</a>
          <a href="/admin/products${sellerParam}" class="btn btn-outline-success">상품관리</a>
          <a href="/admin/events${sellerParam}" class="btn btn-outline-info">주문서 목록</a>
          <a href="/admin/notices${sellerParam}" class="btn btn-outline-warning">공지사항 관리</a>
          <div class="text-center mt-4 text-secondary" style="font-size:0.95em;">관리자 전용 메뉴입니다.</div>
        </div>
      </body>
      </html>
    `);
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
