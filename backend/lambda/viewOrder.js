const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

const ORDERS_TABLE = "OrdersTable";

exports.handler = async (event) => {
    const orderNo = event.pathParameters.event_no;
    const orderId = event.pathParameters.order_id || "noInput";

    const params = {
        TableName: ORDERS_TABLE,
        IndexName: "orderNo-index", // GSI 필수
        KeyConditionExpression: "orderNo = :orderNo",
        ExpressionAttributeValues: {
            ":orderNo": orderNo
        }
    };

    console.log(params, orderNo, orderId);

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

        if(orderId==="noInput"){

            const validHtml = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>주문 인증</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
</head>
<body class="container py-5" style="max-width: 480px;">

  <h4 class="text-center mb-4"><i class="bi bi-lock-fill"></i> 주문 비밀번호 인증</h4>

  <form id="authForm">
    <div class="mb-3">
      <label for="phoneSuffix" class="form-label">전화번호 뒷자리 4자리</label>
      <input type="tel" class="form-control text-center" id="phoneSuffix" maxlength="4" placeholder="예: 1234" required />
    </div>

    <input type="hidden" id="orderNo" value="${orderNo}" />

    <div class="d-grid">
      <button type="submit" class="btn btn-primary">주문 조회하기</button>
    </div>
  </form>

  <script>
    document.getElementById("authForm").addEventListener("submit", function (e) {
      e.preventDefault();

      const orderId = document.getElementById("phoneSuffix").value.trim();
      const orderNo = document.getElementById("orderNo").value;

      if (!/^\\d{4}$/.test(orderId)) {
        alert("전화번호 뒷자리 4자리를 숫자로 입력해주세요.");
        return;
      }

      // 이동할 URL 생성
      const url = \`/viewOrder/\${orderNo}/\${orderId}\`;
      window.location.href = url;
    });
  </script>

</body>
</html>
            
            `
            return {
                statusCode: 200,
                headers: { "Content-Type": "text/html" },
                body: validHtml
            };
        }


        //orderId 가 일치하거나 핸드폰 뒷자리가 일치하는 경우에만 내용표시
        console.log( "check", orderId, order.orderId,  order.buyerPhone, order.buyerPhone, order.buyerPhone.endsWith(orderId) )
        if(order.orderId!==orderId && !order.buyerPhone.endsWith(orderId)){
            const validFailHtml = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>주문 인증</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
</head>
<body class="container py-5" style="max-width: 480px;">
    <h4 class="text-center mb-4"><i class="bi bi-lock-fill"></i> 주문 비밀번호 인증 실패</h4>
    <div class="mb-3 row">
      <label class="text-center form-label bg-warning">전화번호 뒷자리 4자리가 맞지 않습니다. <br/>다시 확인하시고 시도 하시기 바랍니다.</label>      
    </div>
</body>
</html>
            
            `
            return {
                statusCode: 200,
                headers: { "Content-Type": "text/html" },
                body: validFailHtml
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
            <li><strong>연락처:</strong> ${order.buyerPhone || order.phone || '-'}</li>
          </ul>
        </div>

        <div class="section">
          <h5><i class="bi bi-person-fill-exclamation"></i> 받는사람 정보</h5>
          <ul>
            <li><strong>이름:</strong> ${order.receiverName || '-'}</li>
            <li><strong>연락처:</strong> ${order.receiverPhone || '-'}</li>
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
                  <td>${item.productName}</td>
                  <td class="text-end">${item.quantity}개</td>
                  <td class="text-end">${item.amount || '-' }원</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h5><i class="bi bi-cash-coin"></i> 결제 금액</h5>
          <p><strong>총 결제금액:</strong> ${(order.totalAmount || 0).toLocaleString()}원</p>
          <p><strong>입금은행:</strong> ${order.payAccount} / ${order.payAccountOwner} </p>
          <p><strong>입금자명:</strong> ${order.payname || "(미입력)"}</p>
          <p><strong>입금 확인:</strong> ${order.isPaid ? '<span class="text-success">완료</span>' : '<span class="text-danger">미확인</span>'}</p>
          
          <p><strong>배송 상태:</strong>
            <span class="badge ${order.isShipped ? 'bg-info text-dark' : 'bg-warning text-dark'}">
              ${order.isShipped ? '발송 완료' : '발송 대기'}
            </span>
          </p>
            ${order.trackingNo ? `<p><strong>송장번호:</strong> ${order.trackingNo}</p>` : ''}
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
