const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

const ORDERS_TABLE = "OrdersTable";

exports.handler = async (event) => {
    const orderNo = event.pathParameters.order_no;

    const params = {
        TableName: ORDERS_TABLE,
        IndexName: "orderNo-index", // GSI 필수
        KeyConditionExpression: "orderNo = :orderNo",
        ExpressionAttributeValues: {
            ":orderNo": orderNo
        }
    };

    try {
        const result = await dynamoDb.query(params).promise();
        const order = result.Items?.[0];

        if (!order) {
            return {
                statusCode: 404,
                body: `<h2>주문번호 ${orderNo}를 찾을 수 없습니다.</h2>`,
                headers: { "Content-Type": "text/html" }
            };
        }

        // HTML 생성
        const html = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>주문번호 ${order.orderNo} 확인</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" rel="stylesheet">
        <style>
          body { font-family: 'IBM Plex Sans KR', sans-serif; }
          .section { margin-bottom: 1.5rem; }
        </style>
      </head>
      <body class="container py-4">
        <h3 class="text-center mb-4"><i class="bi bi-receipt-cutoff"></i> 주문 내역 확인</h3>

        <div class="section">
          <h5><i class="bi bi-hash"></i> 주문번호</h5>
          <p>${order.orderNo}</p>
        </div>

        <div class="section">
          <h5><i class="bi bi-person"></i> 주문자 정보</h5>
          <ul>
            <li><strong>이름:</strong> ${order.buyerName}</li>
            <li><strong>연락처:</strong> ${order.phone}</li>
          </ul>
        </div>

        <div class="section">
          <h5><i class="bi bi-truck"></i> 배송지</h5>
          <p>${order.address}</p>
        </div>

        <div class="section">
          <h5><i class="bi bi-box"></i> 주문 상품</h5>
          <table class="table table-bordered">
            <thead>
              <tr>
                <th class="text-center">상품명</th>
                <th class="text-center">수량</th>
                <th class="text-center">금액</th>
              </tr>
            </thead>
            <tbody>
              ${order.orderItems.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td class="text-end">${item.quantity}개</td>
                  <td class="text-end">${item.amount || '-' }원</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h5><i class="bi bi-cash-coin"></i> 결제 금액</h5>
          <p><strong>총 결제금액:</strong> ₩${(order.totalAmount || 0).toLocaleString()}원</p>
          <p><strong>입금은행:</strong> ${order.payAccount} / ${order.payAccountOwner} </p>
          <p><strong>입금자명:</strong> ${order.payname || "(미입력)"}</p>
          <p><strong>입금 확인:</strong> ${order.isPaid ? '<span class="text-success">완료</span>' : '<span class="text-danger">미확인</span>'}</p>
        </div>

        <div class="text-center mt-5 text-secondary">
          <small>주문일시: ${order.orderTime}</small>
        </div>
      </body>
      </html>
    `;

        return {
            statusCode: 200,
            headers: { "Content-Type": "text/html" },
            body: html
        };

    } catch (error) {
        console.error("viewOrder error:", error);
        return {
            statusCode: 500,
            body: `<h3>오류 발생: ${error.message}</h3>`,
            headers: { "Content-Type": "text/html" }
        };
    }
};
