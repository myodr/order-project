const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: "ap-northeast-2" });

const ORDERS_TABLE = "OrdersTable";
const EVENTS_TABLE = "EventsTable";

exports.handler = async (event) => {
    const eventId = event.queryStringParameters?.eventId;
    const scrollToOrderId = event.queryStringParameters?.scrollTo;
    const sellerId = event.queryStringParameters?.sellerId;
    const token = event.queryStringParameters?.token;

    //TODO:: sellerId, token을 통한 검증



    if (!eventId||!sellerId) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "text/html" },
            body: `<h3>비정상 접근입니다.!! 정상경로를 통해 접속 해 주세요</h3>`
        };
    }




    try {

        // 추가: EventsTable 조회
        const eventResult = await dynamoDb.get({
            TableName: "EventsTable",
            Key: { eventId }
        }).promise();

        console.log("check event", eventResult.Item.eventsFullManage);

        const eventInfo = eventResult.Item.eventsFullManage;

        const result = await dynamoDb.query({
            TableName: ORDERS_TABLE,
            IndexName: "eventId-index", // 🔸 GSI 필요
            KeyConditionExpression: "eventId = :eid",
            ExpressionAttributeValues: {
                ":eid": eventId
            }
        }).promise();

        const orders = result.Items || [];

        const totalOrders = orders.length;
        const totalAmount = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

        // 상품별 요약 Map 생성
        const productSummaryMap = new Map();

        orders.forEach(order => {
            (order.orderItems || []).forEach(item => {
                const key = item.productId;
                if (!productSummaryMap.has(key)) {
                    productSummaryMap.set(key, {
                        productName: item.productName || key,
                        quantity: 0,
                        amount: 0
                    });
                }
                const summary = productSummaryMap.get(key);
                summary.quantity += item.quantity;
                summary.amount += item.amount; //(item.quantity * (item.price || 0));
            });
        });

        const productSummaryCards = [...productSummaryMap.values()].map(p => `
  <div class="card shadow-sm mb-2">
    <div class="card-body py-2 px-3">
      <div class="d-flex justify-content-between align-items-center">
        <strong>${p.productName}</strong>
        <small class="text-muted">₩${p.amount.toLocaleString()}</small>
      </div>
      <div class="text-muted mt-1">
        총 수량: ${p.quantity.toLocaleString()}개
      </div>
    </div>
  </div>
`).join('');

        const html = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>주문현황</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico">
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
<div class="d-flex align-items-center mb-3" style="gap: 8px;">
  <button class="btn btn-outline-secondary btn-sm" onclick="history.back()">
    <i class="bi bi-arrow-left"></i> 뒤로가기
  </button>
  <h5 class="m-0 flex-grow-1 text-center">주문 현황</h5>
</div>
<div class="card mb-4">
  <div class="card-body d-flex justify-content-between align-items-center">
    <span class="me-1 text-truncate" style="max-width: 85%;">
      <code id="eventLink">https://myodr.store/${eventResult.Item.eventKey}</code>
    </span>
    <button class="btn btn-outline-secondary btn-sm" onclick="copyEventLink()">복사</button>
  </div>
</div>

<div class="card mb-4">
  <div class="card-body">
    <h5 class="card-title">${eventInfo.title}</h5>        
    <p class="mb-1"><strong>이벤트 기간:</strong> ${eventInfo.startTime} ~ ${eventInfo.endTime}</p>
    <p class="mb-1"><strong>입금 계좌:</strong> ${eventInfo.payAccount + ' - ' + eventInfo.payAccountOwner || "-"} </p>
    <p class="mb-1"><strong>총 주문 건수:</strong> ${totalOrders}건</p>
    <p class="mb-1"><strong>총 주문 금액:</strong> ₩${totalAmount.toLocaleString()}</p>
  </div>
</div>

<div class="card mb-3">
  <div class="card-body">
    <h6 class="card-title">상품별 주문 요약</h6>
    ${productSummaryCards}
  </div>
</div>

<!-- 배송지 일괄출력 버튼 및 모달 -->
<div class="mb-3 text-end">
  <button class="btn btn-outline-success btn-sm" onclick="showAllAddresses()">
    <i class="bi bi-printer"></i> 배송지 일괄출력
  </button>
</div>
<div class="modal fade" id="allAddressModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">배송지 일괄 출력</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div id="allAddressList"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button>
        <button type="button" class="btn btn-primary" onclick="window.print()">인쇄</button>
      </div>
    </div>
  </div>
</div>

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

          <!-- 배송 주소 표시 -->
          <div class="mb-2 p-2 bg-light border rounded">
            <p class="mb-1"><strong>배송지 주소:</strong></p>
            <div style="font-size:0.97em;">
              <span id="modal-postcode" class="text-secondary"></span>
              <span id="modal-address"></span>
              <span id="modal-addressEtc"></span>
            </div>
          </div>

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

    // 배송지 주소 표시
    const postcode = order.postcode || '';
    const address = order.address || '';
    const addressEtc = order.addressEtc || '';
    document.getElementById("modal-postcode").innerText = ' ' //postcode ? \`[\${postcode}] \` : '';
    document.getElementById("modal-address").innerText = address;
    document.getElementById("modal-addressEtc").innerText = addressEtc ? ' ' + addressEtc : '';

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
  
  function copyEventLink() {
  const textToCopy = document.getElementById("eventLink").innerText;

  // 최신 브라우저 지원 (권장)
  if (navigator.clipboard) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      showCopySuccess();
    }).catch(err => {
      fallbackCopy(textToCopy);
    });
  } else {
    fallbackCopy(textToCopy);
  }
}

// 예전 브라우저 대응 (input 사용)
function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    showCopySuccess();
  } catch (err) {
    alert("복사에 실패했습니다. 수동으로 복사해주세요.");
  }
  document.body.removeChild(textarea);
}

// ✅ 복사 완료 시 피드백 (선택)
function showCopySuccess() {
  if (window.matchMedia("(max-width: 768px)").matches) {
    alert("링크가 복사되었습니다!");
  } else {
    const btn = document.querySelector("button[onclick='copyEventLink()']");
    const original = btn.innerText;
    btn.innerText = "✅ 복사됨!";
    setTimeout(() => btn.innerText = original, 2000);
  }
}

// 주문 데이터 전체를 참조할 수 있도록 orders를 전역 변수로 노출
window.allOrders = ${JSON.stringify(orders)};

function showAllAddresses() {
  const orders = window.allOrders || [];
  const listDiv = document.getElementById("allAddressList");
  if (!listDiv) return;
  if (orders.length === 0) {
    listDiv.innerHTML = '<p class="text-danger">주문 데이터가 없습니다.</p>';
    return;
  }
  let html = '<table class="table table-bordered table-sm align-middle"><thead><tr>' +
    '<th>주문번호</th><th>주문자</th><th>연락처</th><th>주소</th></tr></thead><tbody>';
  orders.forEach(order => {
    html += \`<tr><td>\${order.orderNo}</td><td>\${order.buyerName || ''}</td><td>\${order.phone || ''}</td><td>\${order.address || ''}</td></tr>\`;
  });
  html += '</tbody></table>';
  listDiv.innerHTML = html;
  const modal = new bootstrap.Modal(document.getElementById("allAddressModal"));
  modal.show();
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