const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

const ORDERS_TABLE = "OrdersTable";

exports.handler = async (event) => {
    const eventId = event.queryStringParameters?.eventId;
    const scrollToOrderId = event.queryStringParameters?.scrollTo;

    if (!eventId) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "text/html" },
            body: `<h3>eventId가 누락되었습니다.</h3>`
        };
    }

    try {
        const result = await dynamoDb.query({
            TableName: ORDERS_TABLE,
            IndexName: "eventId-index", // 🔸 GSI 필요
            KeyConditionExpression: "eventId = :eid",
            ExpressionAttributeValues: {
                ":eid": eventId
            }
        }).promise();

        const orders = result.Items || [];

        const html = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>주문현황</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.8.0/font/bootstrap-icons.css">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR&display=swap" rel="stylesheet">
        <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
        <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>       
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>        
         <style>
      html {
    scroll-behavior: smooth;
  }
    body {
      font-family: 'IBM Plex Sans KR', sans-serif;
      padding: 1rem;
    }
    .table td, .table th {
      vertical-align: middle;
      font-size: 0.95rem;
    }
    .badge {
      font-size: 0.85rem;
    }
    .btn-sm {
      padding: 0.3rem 0.6rem;
      font-size: 0.8rem;
    }
    .form-check {
      margin-bottom: 0.3rem;
    }
    @media (max-width: 576px) {
      h3 { font-size: 1.3rem; }
      .table th, .table td { font-size: 0.85rem; }
    }
    .highlight {
  background-color: #ffeeba;
  transition: background-color 0.6s ease;
}

  </style>
</head>
<body>
  <h3 class="text-center mb-4">주문현황</h3>

 <div class="d-flex flex-column gap-3">
    ${orders.map(order => `
      <div class="card shadow-sm border-0" id="order-${order.orderId}">
        <div class="card-body">
          <h5 class="card-title mb-1">주문번호: ${order.orderNo}</h5>
          <p class="mb-1"><strong>주문자:</strong> ${order.buyerName}</p>
          
          <p class="mb-1"><strong>상품 내역:</strong></p>
          <ul class="mb-2">
            ${order.orderItems.map(item => `<li>${item.productName} (${item.quantity})</li>`).join("")}
          </ul>

          <p class="mb-1"><strong>총 금액:</strong> ₩${order.totalAmount.toLocaleString()}</p>

          <div class="d-flex gap-2 align-items-center flex-wrap">
            <span class="badge ${order.isPaid ? 'bg-success' : 'bg-secondary'}">
              ${order.isPaid ? '입금확인 완료' : '입금 미확인'}
            </span>
            <span class="badge ${order.isShipped ? 'bg-info' : 'bg-secondary'}">
              ${order.isShipped ? '발송 완료' : '발송 대기'}
            </span>
            ${order.trackingNo ? `<span class="badge bg-warning text-dark">송장: ${order.trackingNo}</span>` : ''}
          </div>

          <div class="d-grid mt-3">
            <button class="btn btn-outline-primary btn-sm"
              onclick='openOrderModal(${JSON.stringify(order)})'>
              상태 변경
            </button>
          </div>
        </div>
      </div>
    `).join('')}
  </div>
        
        <!-- 📦 주문 처리 모달 -->
    <div class="modal fade" id="orderActionModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-scrollable">
    <div class="modal-content">
      <form id="orderActionForm">
        <div class="modal-header">
          <h5 class="modal-title">주문 상세 및 상태 처리</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <p><strong>주문번호:</strong> <span id="modal-orderNo"></span></p>
          <p><strong>주문자:</strong> <span id="modal-buyerName"></span></p>
          
          <p><strong>상품내역:</strong></p>
          <ul id="modal-orderItems" class="ps-3"></ul>

          <p><strong>총 금액:</strong> ₩<span id="modal-totalAmount"></span></p>
          <p><strong>입금자명:</strong> <span id="modal-payName"></span></p>

          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" id="modal-isPaid">
            <label class="form-check-label" for="modal-isPaid">입금 확인</label>
          </div>

          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" id="modal-isShipped">
            <label class="form-check-label" for="modal-isShipped">발송 처리</label>
          </div>

          <div class="mb-3">
            <label for="modal-trackingNo" class="form-label">송장번호</label>
            <div class="input-group">
                <input type="text" class="form-control" id="modal-trackingNo" placeholder="송장번호 입력 (선택)">
                <button type="button" class="btn btn-outline-secondary" onclick="startQrScan()">QR 스캔</button>
            </div>
          </div>

          <input type="hidden" id="modal-orderId">
          <input type="hidden" id="modal-eventId" value="${eventId}">
        </div>
        <div class="modal-footer">
          <button type="submit" class="btn btn-primary">저장</button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button>
        </div>
      </form>
    </div>
  </div>
</div>


      </body>
    <script>
    
        document.addEventListener("DOMContentLoaded", () => {
          const targetId = "${scrollToOrderId}";
          if (targetId) {
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
              targetEl.classList.add("highlight");
              setTimeout(() => targetEl.classList.remove("highlight"), 3000);
            }
          }
        });

    

  function openOrderModal(order) {
    document.getElementById("modal-orderId").value = order.orderId;
    document.getElementById("modal-orderNo").innerText = order.orderNo;
    document.getElementById("modal-buyerName").innerText = order.buyerName;
    document.getElementById("modal-payName").innerText = order.payname;
    document.getElementById("modal-totalAmount").innerText = (order.totalAmount || 0).toLocaleString();

    // 상품 목록 표시
    const itemList = document.getElementById("modal-orderItems");
    itemList.innerHTML = "";
    order.orderItems.forEach(item => {
      const li = document.createElement("li");
      li.textContent = \`\${item.productName || item.productId} - \${item.quantity}개\`;
      itemList.appendChild(li);
    });

    document.getElementById("modal-isPaid").checked = order.isPaid;
    document.getElementById("modal-isShipped").checked = order.isShipped;
    document.getElementById("modal-trackingNo").value = order.trackingNo || "";

    const modal = new bootstrap.Modal(document.getElementById("orderActionModal"));
    modal.show();
  }

  document.getElementById("orderActionForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = new URLSearchParams({
      orderId: document.getElementById("modal-orderId").value,
      eventId: document.getElementById("modal-eventId").value,
      isPaid: document.getElementById("modal-isPaid").checked ? "on" : "",
      isShipped: document.getElementById("modal-isShipped").checked ? "on" : "",
      trackingNo: document.getElementById("modal-trackingNo").value.trim()
    });

    console.log("chk payload", payload);
    try {
      const res = await fetch("/admin/updateOrder", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload.toString()
      });

      if (res.redirected) {
        window.location.href = res.url;
      } else {
        alert("처리에 실패했습니다.");
      }
    } catch (err) {
      alert("요청 실패: " + err.message);
    }
  });


  let html5QrScanner;

  function startQrScan() {
    const qrDiv = document.getElementById("qr-reader");
    qrDiv.style.display = "block";

    html5QrScanner = new Html5Qrcode("qr-reader");
    const config = { fps: 10, qrbox: 250 };

    html5QrScanner.start(
      { facingMode: "environment" }, // 모바일 후면 카메라 우선
      config,
      qrCodeMessage => {
        document.getElementById("modal-trackingNo").value = qrCodeMessage;
        html5QrScanner.stop().then(() => {
          qrDiv.innerHTML = "";
          qrDiv.style.display = "none";
        });
      },
      errorMessage => {
        console.log("QR 인식 실패", errorMessage);
      }
    );
  }
</script>

      </html>
    `;

        return {
            statusCode: 200,
            headers: { "Content-Type": "text/html" },
            body: html
        };

    } catch (err) {
        console.error("오류 발생:", err);
        return {
            statusCode: 500,
            headers: { "Content-Type": "text/html" },
            body: `<h3>서버 오류 발생: ${err.message}</h3>`
        };
    }
};
