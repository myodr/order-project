const express = require('express');
const getRawBody = require('raw-body');
const app = express();
const port = 3000;

// const {getEvent}  = require('lambda/getEvent');
const lambdaHandlers = {
  getEventPage: require('./lambda/getEventPage'),
  createOrder: require('./lambda/createOrder'),
  viewOrder: require('./lambda/viewOrder'),
  adminOrderStatus: require('./lambda/adminOrderStatus'),
  updateOrderStatus: require('./lambda/updateOrderStatus'),
  createEventPage: require('./lambda/createEventPage'),
  createEvent: require('./lambda/createEvent'),
  uploadImage: require('./lambda/uploadImage'),
  eventsList: require('./lambda/adminEventsList'),
  createAdminProfilePage: require('./lambda/createAdminProfilePage'),
  saveAdminProfile: require('./lambda/saveAdminProfile'),
  createAdminProductsPage: require('./lambda/createAdminProductsPage'),
  saveAdminProducts: require('./lambda/saveAdminProducts'),
  deleteEvent: require('./lambda/deleteEvent'),
  // ...필요시 추가
};

// 공통 Lambda 프록시 함수
async function lambdaProxy(handler, { req, res, eventBuilder, redirectOn302 = false }) {
  try {
    const event = eventBuilder(req);
    const result = await handler(event);

    if (redirectOn302 && result.statusCode === 302 && result.headers?.Location) {
      return res.redirect(result.headers.Location);
    }
    res.status(result.statusCode || 200).send(result.body);
  } catch (err) {
    res.status(500).send('Internal Server Error');
  }
}

// URL-encoded form 파싱 (필수!) - 제한 늘림
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb'  // 기본 1mb에서 50mb로 증가
}));

// 미들웨어: JSON 바디 파싱 - 제한 늘림
app.use(express.json({ 
  limit: '50mb'  // 기본 1mb에서 50mb로 증가
}));

// 기본 라우터
app.get('/getEventPage/:id', (req, res) =>
  lambdaProxy(lambdaHandlers.getEventPage.handler, {
    req, res,
    eventBuilder: req => ({ pathParameters: { event_key: req.params.id } })
  })
);

app.get('/viewOrder/:orderNo/:orderId', async (req, res) =>  {
    const { orderNo, orderId } = req.params;
    let event = {
        pathParameters:{
            event_no: orderNo,
            order_id: orderId,
        }
    }
    let resp = await lambdaHandlers.viewOrder.handler(event);
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
    let resp = await lambdaHandlers.viewOrder.handler(event);
    res.send(resp.body);
});

// 예시: POST 요청 처리
app.post('/createOrder', (req, res) =>
  lambdaProxy(lambdaHandlers.createOrder.handler, {
    req, res,
    eventBuilder: req => ({ body: req.body })
  })
);

// 예시: POST 요청 처리
app.post('/create-event', async(req, res) => {
    const data = req.body;
    console.log('Received data:', data);
    let event = {
        body:data
    };
    let resp = await lambdaHandlers.createEvent.handler(event);
    console.log(resp.statusCode);
    res.status(resp.statusCode).send(resp.body);
});

app.get('/admin/createEvent' , async (req, res) =>{
    const {sellerId, eventId, token} = req.query;
    let event = {
        queryStringParameters: {sellerId, eventId, token}
    }
    let resp = await lambdaHandlers.createEventPage.handler(event);
    res.send (resp.body);
});

app.get('/admin/events', async (req, res) =>{
    const {sellerId, token, filter, sort} = req.query;
    let event = {
        queryStringParameters: {sellerId, token, filter, sort}
    }
    let resp = await lambdaHandlers.eventsList.handler(event);
    res.send (resp.body);
});

app.post('/admin/events/delete', async (req, res) => {
    const event = {
        body: JSON.stringify(req.body)
    };
    const resp = await lambdaHandlers.deleteEvent.handler(event);
    res.status(resp.statusCode).json(JSON.parse(resp.body));
});

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
    let resp = await lambdaHandlers.adminOrderStatus.handler(event);
    res.send(resp.body);
});

app.post('/admin/updateOrder', async(req, res) => {
    const data = new URLSearchParams(req.body);
    console.log('/admin/updateOrder Received data:', data);
    let event = {
        body:req.body
    };
    let resp = await lambdaHandlers.updateOrderStatus.handler(event);

    console.log("check resp", resp);

    // 🔁 302 Redirect 처리
    if (resp.statusCode === 302 && resp.headers?.Location) {
        return res.redirect(resp.headers.Location); // 실제 리다이렉션
    }

    // 일반 응답 처리
    res.status(resp.statusCode || 200).send(resp.body);
});

app.post('/admin/createEvent', async (req,res) =>{
    try {
        const data = req.body;
        console.log('createEvent 요청 크기:', JSON.stringify(data).length, 'bytes');

        // 2️⃣ Lambda event 형식으로 변환
        const event = {
            body: data
        };

        let resp = await lambdaHandlers.createEvent.handler(event);

        // 🔁 302 Redirect 처리
        if (resp.statusCode === 302 && resp.headers?.Location) {
            return res.redirect(resp.headers.Location); // 실제 리다이렉션
        }

        // 일반 응답 처리
        res.status(resp.statusCode || 200).send(resp.body);
    } catch (error) {
        console.error('createEvent 처리 오류:', error);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
})

// CORS 미들웨어 추가
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 파일 업로드(예시)
app.post('/admin/uploadImage', async (req, res) => {
  try {
    const rawBodyBuffer = await getRawBody(req, {
      limit: '50mb'  // raw-body 제한도 늘림
    });
    lambdaProxy(lambdaHandlers.uploadImage.handler, {
      req, res,
      eventBuilder: req => ({
        headers: req.headers,
        httpMethod: req.method,
        path: req.path,
        isBase64Encoded: true,
        body: rawBodyBuffer.toString('base64')
      })
    });
  } catch (error) {
    console.error('파일 업로드 오류:', error);
    res.status(413).send('요청 본문이 너무 큽니다.');
  }
});

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
    let resp = await lambdaHandlers.getEventPage.handler(event);
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

// 프로필 관리 라우트
app.get('/admin/profile', (req, res) =>
  lambdaProxy(lambdaHandlers.createAdminProfilePage.handler, {
    req, res,
    eventBuilder: req => ({ queryStringParameters: req.query })
  })
);

app.post('/admin/profile/save', (req, res) =>
  lambdaProxy(lambdaHandlers.saveAdminProfile.handler, {
    req, res,
    eventBuilder: req => ({ body: JSON.stringify(req.body) })
  })
);

app.get('/admin/products', (req, res) =>
  lambdaProxy(lambdaHandlers.createAdminProductsPage?.handler, {
    req, res,
    eventBuilder: req => ({ queryStringParameters: req.query })
  })
);

// 저장용 Lambda 핸들러가 없다면 임시로 200 OK 반환
app.post('/admin/products/save', (req, res) =>
  lambdaProxy(lambdaHandlers.saveAdminProducts.handler, {
    req, res,
    eventBuilder: req => ({ body: JSON.stringify(req.body) })
  })
);

// 서버 시작
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
