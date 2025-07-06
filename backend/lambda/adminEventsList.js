const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

const EVENTS_TABLE = "EventsTable";
const ORDERS_TABLE = "OrdersTable";

exports.handler = async (event) => {
    const sellerId = event.queryStringParameters?.sellerId;
    const filter = event.queryStringParameters?.filter || 'all';    // all, active, expired
    const sort = event.queryStringParameters?.sort || 'latest';
    if (!sellerId) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "text/html" },
            body: `<h3>sellerId 파라미터가 필요합니다.</h3>`
        };
    }

    // 1️⃣ 이벤트 목록 조회 (GSI) - ACTIVE 상태만 조회
    const eventResult = await dynamoDb.query({
        TableName: EVENTS_TABLE,
        IndexName: "sellerId-index",
        KeyConditionExpression: "sellerId = :sid",
        FilterExpression: "eventsFullManage.#status = :status",
        ExpressionAttributeNames: {
            "#status": "status"
        },
        ExpressionAttributeValues: { 
            ":sid": sellerId,
            ":status": "ACTIVE"
        },
        ScanIndexForward: false
    }).promise();

    const events = eventResult.Items || [];

    // 2️⃣ 각 이벤트별 주문 요약 조회 (동시 처리)
    const summaries = await Promise.all(events.map(async (ev) => {
        const orderResult = await dynamoDb.query({
            TableName: ORDERS_TABLE,
            IndexName: "eventId-index",
            KeyConditionExpression: "eventId = :eid",
            FilterExpression: "sellerId = :sid",
            ExpressionAttributeValues: {
                ":eid": ev.eventId,
                ":sid": sellerId
            }
        }).promise();

        const orders = orderResult.Items || [];
        const totalOrders = orders.length;
        const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        return {
            eventId: ev.eventId,
            title: ev.eventsFullManage?.title,
            startTime: ev.eventsFullManage?.startTime,
            endTime: ev.eventsFullManage?.endTime,
            description: ev.eventsFullManage?.description || "",
            totalOrders,
            totalAmount
        };
    }));


    const now = new Date().toISOString();

    let filteredEvents = summaries.filter(ev => {
        if (filter === 'active') return now >= ev.startTime && now <= ev.endTime;
        if (filter === 'expired') return now > ev.endTime;
        return true; // all
    });


    if (sort === 'amount') {
        filteredEvents.sort((a, b) => b.totalAmount - a.totalAmount);
    } else if (sort === 'count') {
        filteredEvents.sort((a, b) => b.totalOrders - a.totalOrders);
    } else {
        filteredEvents.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
    }



    // 3️⃣ HTML 렌더링
    const html = `
  <!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>이벤트 목록</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
  </head>
  <body class="container mt-4">
    <h4 class="mb-4 text-center">이벤트 목록 (${sellerId})</h4>
        <form method="get" class="row row-cols-3 g-2 mb-3">
          <input type="hidden" name="sellerId" value="${sellerId}" />
          <div class="col">
            <select class="form-select" name="filter" onchange="this.form.submit()">
              <option value="all" ${filter === 'all' ? 'selected' : ''}>전체</option>
              <option value="active" ${filter === 'active' ? 'selected' : ''}>진행 중</option>
              <option value="expired" ${filter === 'expired' ? 'selected' : ''}>종료됨</option>
            </select>
          </div>
          <div class="col">
            <select class="form-select" name="sort" onchange="this.form.submit()">
              <option value="latest" ${sort === 'latest' ? 'selected' : ''}>최신순</option>
              <option value="count" ${sort === 'count' ? 'selected' : ''}>주문건수순</option>
              <option value="amount" ${sort === 'amount' ? 'selected' : ''}>금액순</option>
            </select>
          </div>
          <div class="col">
            <div class="d-grid">
            <a href="/admin/createEvent?sellerId=${sellerId}&token=" class="btn btn-warning btn-md">신규 등록</a>
          </div>
          </div>
        </form>
    ${filteredEvents.length === 0 ? `
      <p class="text-muted text-center">등록된 이벤트가 없습니다.</p>
    ` : filteredEvents.map(ev => `

        

      <div class="card mb-3 shadow-sm">
        <div class="card-body">
          <h5 class="card-title mb-1">${ev.title}</h5>
          <p class="mb-1"><strong>기간:</strong><br>${ev.startTime} ~ ${ev.endTime}</p>
          <p class="mb-1 text-muted">${ev.description}</p>
          <p class="mb-1">
            <strong>총 주문:</strong> ${ev.totalOrders}건<br>
            <strong>총 금액:</strong> ₩${ev.totalAmount.toLocaleString()}
          </p>
          <div class="d-grid gap-2">
            <a href="/admin/orders?eventId=${ev.eventId}&sellerId=${sellerId}&token=${ev.eventId}" class="btn btn-outline-primary btn-sm">주문 현황 보기</a>
            <a href="/admin/createEvent?eventId=${ev.eventId}&sellerId=${sellerId}&token=" class="btn btn-outline-warning btn-sm">이벤트 수정</a>
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="deleteEvent('${ev.eventId}', '${sellerId}')">삭제</button>
          </div>
        </div>
      </div>
    `).join('')}

    <div class="text-center text-secondary mt-5 small">© ejc</div>
    
    <script>
    async function deleteEvent(eventId, sellerId) {
      if (!confirm('정말로 이 이벤트를 삭제하시겠습니까?\\n삭제된 이벤트는 복구할 수 없습니다.')) {
        return;
      }
      
      try {
        const response = await fetch('/admin/events/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ eventId, sellerId })
        });
        
        if (response.ok) {
          alert('이벤트가 삭제되었습니다.');
          location.reload();
        } else {
          const error = await response.json();
          alert('삭제 실패: ' + (error.error || '알 수 없는 오류'));
        }
      } catch (error) {
        alert('삭제 중 오류가 발생했습니다.');
        console.error('삭제 오류:', error);
      }
    }
    </script>
  </body>
  </html>
  `;

    return {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: html
    };
};
