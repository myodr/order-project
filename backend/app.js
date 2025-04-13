const express = require('express');
const app = express();
const port = 3000;

// const {getEvent}  = require('lambda/getEvent');
const getEventPage = require('./lambda/getEventPage');

// 미들웨어: JSON 바디 파싱
app.use(express.json());

// 기본 라우터
app.get('/', (req, res) => {
    res.send('Hello from internet!');
});

app.get('/get-event-page/:id', async (req, res) =>  {
    let event = {
        pathParameters:{
            event_id: req.params.id
        }
    }
    let resp = await getEventPage.handler(event);
    res.send(resp.body);
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