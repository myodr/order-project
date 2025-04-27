const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'ap-northeast-2' });

const EVENTS_TABLE = "EventsTable";

exports.handler = async (event) => {
    const eventKey = event.pathParameters.event_key;

    console.log("chk eventKey", eventKey)

    const now = new Date().toISOString();

    let eventInfo;
    try {


        // const eventResult = await dynamoDb.get(eventParams).promise();

        const eventResult = await dynamoDb.query({
            TableName: EVENTS_TABLE,
            IndexName: "eventKey-index", // ✅ GSI 필요
            KeyConditionExpression: "eventKey = :ek",
            ExpressionAttributeValues: {
                ":ek": eventKey
            }
        }).promise();

        eventInfo = eventResult.Items[0]?.eventsFullManage;

        if (!eventInfo) {
            return { statusCode: 404, body: "이벤트 정보를 찾을 수 없습니다." };
        }
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: "이벤트 정보를 가져오는 중 오류 발생" };
    }

    const isExpired = now > eventInfo.endTime;
    let items = eventInfo.items;

    // 3️⃣ 동적 HTML 생성 (Bootstrap 기반)
    const html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">            <!-- 📦 Open Graph 메타 정보 (공유 시 썸네일에 사용) -->
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="MyOrder.Store" />
            <meta property="og:title" content="${eventInfo.title}" />
            <meta property="og:description" content="${eventInfo.description}" />
            <meta property="og:image" content="${items?.[0]?.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image'}" />
            <meta property="og:image:alt" content="${items?.[0]?.productName || eventInfo.title }" />
            <meta property="og:url" content="https://www.myodr.store/get-event-page/${eventInfo.eventKey}" />
            <title>myOrder-${eventInfo.title}</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.8.0/font/bootstrap-icons.css">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR&display=swap" rel="stylesheet">
            <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
            <script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <style>
                body {
                  font-family: "IBM Plex Sans KR", sans-serif;
                  font-weight: 400;
                  font-style: normal;
                }
                .product { margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
                .product img { width: 100px; cursor: pointer; }
                .product-details { display: none; }
                .quantity-controls { display: flex; align-items: center; }
                .quantity-controls button { width: 30px; transition: background-color 0.1s ease-in-out; }
                /* 모바일에서 hover 효과 제거 */
                @media (hover: none) {
                    .btn:hover {
                        background-color: inherit !important;
                        color: inherit !important;
                    }
                }
                .quantity-controls button:active { background-color: gray !important; }
                .totalAmountLayer { font-size: 1.2em; font-weight: bold; color: #d9534f; text-align: right; margin-top: 10px; }
                .sold-out { color: red; font-weight: bold; }
            </style>
        </head>
        <body class="container mt-4">
            <h2 class="text-center mb-3">이벤트 주문 (${eventInfo.title})</h2>
            <p class="text-start">${eventInfo.description}</p>
            <p class="text-center text-${isExpired ? 'danger' : 'success'}">
                ${isExpired ? '이벤트 종료됨' : `이벤트 기간: ${eventInfo.startTime} ~ ${eventInfo.endTime}`}
            </p>

            ${isExpired ? `<h3 class="text-danger text-center">이벤트가 종료되었습니다.</h3>` : `
            <div id="orderLayer">
            <form id="orderForm">            
                <div id="productList">                
                <label class="" style="font-size:1.1em;"><i class="bi bi-gift"></i> 상품주문</label>
                    ${items.map(item => `
                        <div class="product border rounded-1 p-2">
                            <div class="d-flex align-items-center">
                                <img src="${item.imageUrl}" alt="${item.productName}" class="me-3 rounded-1 toggle-details">
                                <div>
                                    <strong class="toggle-details">${item.productName}</strong>
                                    <p class="mb-1 text-muted">₩${item.eventPrice}</p>
                                    ${item.stock === 0 ? `<p class="sold-out">품절</p>` : ''}
                                </div>
                            </div>
                            <div class="product-details mt-2">
                                <p>${item.description}</p>
                            </div>
                            <div class="quantity-controls">
                                ${item.stock > 0 ? `
                                    <button type="button" class="btn btn-outline-secondary btn-sm minus" data-product="${item.productId}"><span style="font-size: 1.2em">-</span></button>
                                    <input type="text" class="form-control bg-light text-center mx-2 quantity" style="width: 40px;" value="0" min="0" max="${item.stock}" readonly data-price="${item.eventPrice}" data-product="${item.productId}">
                                    <button type="button" class="btn btn-outline-secondary btn-sm plus" data-product="${item.productId}"><span style="font-size: 1.2em">+</span></button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="totalAmountLayer">
                    <i class="bi bi-cart3"></i> <span id="totalAmount">총 주문금액: 0원</span>
                </div>                
                <div class="mt-3">
                        <label class=""><i class="bi bi-truck bg" style="font-size: 1.2rem;"></i> 배송지 주소</label>
                        <div class="d-flex">
                            <input type="text" id="postcode" class="form-control mt-2 me-2 bg-light" placeholder="우편번호를 검색하세요" readonly>                                                       
                            <button type="button" class="btn btn-warning w-100 mt-2" onclick="execDaumPostcode()">우편번호 검색</button>                                               
                        </div>
                        <input type="text" id="address" class="form-control me-2 mt-2 bg-light" placeholder="우편번호를 검색하세요" readonly>
                        <input type="text" id="address_etc" class="form-control mt-2" placeholder="상세 주소 입력">
                </div>
                <div class="mt-2">
                        <label><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-person-exclamation" viewBox="0 0 16 16">
  <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0M8 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m.256 7a4.5 4.5 0 0 1-.229-1.004H3c.001-.246.154-.986.832-1.664C4.484 10.68 5.711 10 8 10q.39 0 .74.025c.226-.341.496-.65.804-.918Q8.844 9.002 8 9c-5 0-6 3-6 4s1 1 1 1z"/>
  <path d="M16 12.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0m-3.5-2a.5.5 0 0 0-.5.5v1.5a.5.5 0 0 0 1 0V11a.5.5 0 0 0-.5-.5m0 4a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/>
</svg> 받는 사람</label>
                        <input type="text" class="form-control mt-2" id="buyername" class="form-control mt-2" placeholder="이름(닉네임)">
                        <input type="tel" id="phone" class="form-control mt-2" placeholder="휴대폰 번호(숫자만 입력하세요)" maxlength="13" title="010-1234-5678 형식으로 입력해주세요">
                </div>                        
                <div class="mt-2">
                        <label><i class="bi bi-credit-card" style="font-size: 1.2rem;"></i> 결제 정보</label>
                        <label class="row ms-2" style="font-size: 0.8rem;">* 결제 관련 안내 - 현재 계좌이체를 지원합니다.</label>
                        <label class="row ms-2">[입금은행 안내]<br/> ${eventInfo.payAccount} ${eventInfo.payAccountOwner}</label>                        
                        <input type="text" class="form-control mt-2" id="payname" class="form-control mt-2" placeholder="입금자명">                        
                </div>                        
                <div class="mt-2">
                <button type="button" class="btn btn-danger w-100 mt-3 mb-20" onclick="showConfirmModal()">주문하기</button>
                </div>
                <div class="mt-4 mb-2 text-center text-secondary">© ejp</div>
            </form>
            </div>

            <!-- Confirm Modal -->
            <div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="confirmModalLabel"><i class="bi bi-cart-check-fill"></i> 주문 확인</h5>                            
                        </div>
                        <div class="modal-body">
                            <p id="confirmText">주문 내용을 확인하세요.</p>
                        </div>
                        <div class="modal-footer">
                            <label>주문하시겠습니까?</label>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">취소</button>
                            <button type="submit" class="btn btn-primary" onclick="submitOrder()">확인</button>
                        </div>
                    </div>
                </div>
            </div>
            <!-- noti modal-->
            <div class="modal fade" id="errorModal" tabindex="-1" aria-hidden="true">
              <div class="modal-dialog modal-sm modal-dialog-centered">
                <div class="modal-content">
                  <div class="modal-header bg-danger text-white py-2">
                    <h5 class="modal-title">입력 오류</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body text-center" id="errorModalBody">
                    <!-- 오류 메시지가 JS로 삽입됨 -->
                  </div>
                  <div class="modal-footer py-2 justify-content-center">
                    <button type="button" class="btn btn-danger btn-sm" data-bs-dismiss="modal">확인</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 주문완료 안내 모달 -->
            <div class="modal fade" id="orderCompleteModal" tabindex="-1" aria-hidden="true">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                  <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">주문 완료</h5>                    
                  </div>
                  <div class="modal-body text-center">
                    <p class="mb-2">주문이 성공적으로 접수되었습니다!</p>
                    <p>주문번호: <strong id="completedOrderNo"></strong></p>
                    <a id="viewOrderLink" class="btn btn-outline-success mt-2">주문 내역 확인</a>
                  </div>
                </div>
              </div>
            </div>
 
            `}

<script>
    function showErrorModal(message) {
        document.getElementById("errorModalBody").innerText = message;
        const modal = new bootstrap.Modal(document.getElementById("errorModal"));
        modal.show();
    }
    function execDaumPostcode() {
        new daum.Postcode({
          oncomplete: function(data) {
            document.getElementById('postcode').value = data.zonecode;
            document.getElementById('address').value = data.address;
          }
        }).open();
    }

    function updateTotalAmount() {
        let total = 0;
        document.querySelectorAll(".quantity").forEach(input => {
            let quantity = parseInt(input.value) || 0;
            let price = parseInt(input.dataset.price) || 0;
            total += quantity * price;
        });
        document.getElementById("totalAmount").innerText = \`총 주문금액: \$\{total.toLocaleString()\}원\`;
    }

    document.addEventListener("DOMContentLoaded", function() {
        document.querySelectorAll(".plus, .minus").forEach(button => {
            button.addEventListener("click", function() {
                let input = this.closest(".quantity-controls").querySelector(".quantity");
                let max = parseInt(input.getAttribute("max")) || 0;
                let value = parseInt(input.value) || 0;
                if (this.classList.contains("plus") && value < max) input.value = value + 1;
                if (this.classList.contains("minus") && value > 0) input.value = value - 1;
                updateTotalAmount();
                this.style.backgroundColor = "gray";
                setTimeout(() => this.style.backgroundColor = "", 100);
            });
        });
        
        const phoneInput = document.getElementById("phone");

        phoneInput.addEventListener("input", function (e) {
          let value = this.value.replace(/\\D/g, ""); // 숫자 이외 제거
          if (value.length > 11) value = value.slice(0, 11); // 최대 11자리 제한
    
          let formatted = "";
          if (value.length <= 3) {
            formatted = value;
          } else if (value.length <= 7) {
            formatted = value.slice(0, 3) + "-" + value.slice(3);
          } else {
            formatted = value.slice(0, 3) + "-" + value.slice(3, 7) + "-" + value.slice(7);
          }
    
          this.value = formatted;
        });
    });
    
    
    function showConfirmModal() {
        const items = [];
        let total = 0;
        
        // 주문 수량 수집
        document.querySelectorAll(".quantity").forEach(input => {
            const quantity = parseInt(input.value) || 0;
            const price = parseInt(input.dataset.price) || 0;
            const productName = input.closest(".product").querySelector("strong").innerText;
                if (quantity > 0) {
                    items.push({ productName, quantity, price });
                    total += quantity * price;
                }
        });
        
        // 배송 정보 수집
        const postcode = document.getElementById("postcode").value.trim();
        const address = document.getElementById("address").value.trim();
        const addressEtc = document.getElementById("address_etc").value.trim();
        const buyerName = document.getElementById("buyername").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const payname = document.getElementById("payname").value.trim();
        
        
        if (items.length === 0) {
            showErrorModal("주문할 상품을 1개 이상 선택해주세요.");
            return;
        }
        
        if (!postcode || !addressEtc || !buyerName || !phone) {
            showErrorModal("배송지, 이름, 연락처를 모두 입력해주세요.");
            return;
        }
        const phoneRegex = /^\\d{3}-\\d{4}-\\d{4}$/;
        if (!phoneRegex.test(phone)) {
          showErrorModal("전화번호는 000-0000-0000 형식으로 입력해주세요.");
          return;
        }
        
        if (!payname) {
            showErrorModal("결제계좌 입금자명을 입력해주세요.");
            return;
        }
        
        
        
        // 주문 요약 HTML 생성
        let html = \`<h6>주문 요약</h6><ul>\`;
        items.forEach(item => {
            html += \`<li>\${item.productName} x \${item.quantity}개 - \${(item.quantity * item.price).toLocaleString()}원</li>\`;
        });
        html += \`</ul><p><strong>총 금액:</strong> \${total.toLocaleString()}원</p>\`;
        html += \`<hr><p><strong>수령인:</strong> \${buyerName}</p><p><strong>연락처:</strong> \${phone}</p><p><strong>주소:</strong> [\${postcode}] \${address} \${addressEtc}</p>\`;
        html += \`<hr><p><strong>입금자명:</strong> \${payname}</p>\`;
        
        document.getElementById("confirmText").innerHTML = html;
        
        const modal = new bootstrap.Modal(document.getElementById("confirmModal"));
        modal.show();
    }
    
    async function submitOrder() {
    const eventId = "${eventInfo.eventId}";
    const buyerName = document.getElementById("buyername").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const postcode = document.getElementById("postcode").value.trim();
    const address = document.getElementById("address").value.trim();
    const addressEtc = document.getElementById("address_etc").value.trim();
    const payname = document.getElementById("payname").value.trim();

    const items = [];
    let totalAmount = 0;

    document.querySelectorAll(".quantity").forEach(input => {
      const quantity = parseInt(input.value) || 0;
      const price = parseInt(input.dataset.price) || 0;
      const productId = input.dataset.product;
      const productName = input.closest(".product").querySelector("strong").innerText;

      if (quantity > 0) {
        items.push({ productId, quantity, productName, price, amount: (quantity * price) });
        totalAmount += quantity * price;
      }
    });

    const payload = {
      eventId,
      buyerId: "guest", // 로그인 사용자라면 여기에 사용자 ID 사용
      buyerName,
      phone,
      payname,
      postcode,
      addressEtc, 
      address: \`[\${postcode}] \${address} \${addressEtc}\`,      
      items,
      totalAmount
    };

    try {
      const res = await fetch("/createOrder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
          const data = await res.json();
          const orderNo = data.orderNo;
          const orderId = data.orderId;
    
          // 주문번호 표시
          document.getElementById("completedOrderNo").innerText = orderNo;
          document.getElementById("viewOrderLink").href = \`/viewOrder/\${orderNo}/\${orderId}\`;
    
          // 주문 완료 모달 표시
          document.getElementById("orderLayer").innerHTML="";
          
          const modal = new bootstrap.Modal(document.getElementById("orderCompleteModal"));
          modal.show();
      } else {
          const err = await res.json();
          showErrorModal("주문 실패: " + err.message);
      }
      
      
    } catch (err) {
      showErrorModal("네트워크 오류: " + err.message);
    }
    
    
    
  }
</script>
</body>
</html>
    `;
    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
};
