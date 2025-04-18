const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'ap-northeast-2' });

const EVENTS_TABLE = "EventsTable";

exports.handler = async (event) => {
    const eventId = event.pathParameters.event_id;
    const now = new Date().toISOString();
// `eventsFullManage`를 포함한 전체 이벤트 정보 조회
    const eventParams = {
        TableName: EVENTS_TABLE,
        Key: { eventId },
        ProjectionExpression: "eventsFullManage"
    };

    let eventInfo;
    try {
        const eventResult = await dynamoDb.get(eventParams).promise();
        eventInfo = eventResult.Item?.eventsFullManage;

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
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>주문 이벤트</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
            <script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
            <style>
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
                #totalAmount { font-size: 1.2em; font-weight: bold; color: #d9534f; text-align: right; margin-top: 10px; }
                .sold-out { color: red; font-weight: bold; }
            </style>
        </head>
        <body class="container mt-4">
            <h2 class="text-center mb-3">이벤트 주문 (${eventInfo.title})</h2>
            <p class="text-center">${eventInfo.description}</p>
            <p class="text-center text-${isExpired ? 'danger' : 'success'}">
                ${isExpired ? '이벤트 종료됨' : `이벤트 기간: ${eventInfo.startTime} ~ ${eventInfo.endTime}`}
            </p>

            ${isExpired ? `<h3 class="text-danger text-center">이벤트가 종료되었습니다.</h3>` : `
            <form id="orderForm">
                <div id="productList">
                    ${items.map(item => `
                        <div class="product border p-2">
                            <div class="d-flex align-items-center">
                                <img src="${item.imageUrl}" alt="${item.name}" class="me-3 toggle-details">
                                <div>
                                    <strong class="toggle-details">${item.name}</strong>
                                    <p class="mb-1 text-muted">₩${item.eventPrice}</p>
                                    ${item.stock === 0 ? `<p class="sold-out">품절</p>` : ''}
                                </div>
                            </div>
                            <div class="product-details mt-2">
                                <p>${item.description}</p>
                            </div>
                            <div class="quantity-controls">
                                ${item.stock > 0 ? `
                                    <button type="button" class="btn btn-outline-secondary btn-sm minus" data-product="${item.productId}">-</button>
                                    <input type="text" class="form-control text-center mx-2 quantity" style="width: 40px;" value="0" min="0" max="${item.stock}" readonly data-price="${item.eventPrice}" data-product="${item.productId}">
                                    <button type="button" class="btn btn-outline-secondary btn-sm plus" data-product="${item.productId}">+</button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div id="totalAmount">총 주문금액: 0원</div>                
                <div class="mt-4">
                        <label class="form-label">배송지 주소</label>
                        <div class="d-flex">
                            <input type="text" id="postcode" class="form-control me-2" placeholder="우편번호" readonly>                                                       
                            <button type="button" class="btn btn-warning w-100 mt-2" onclick="execDaumPostcode()">우편번호 검색</button>                                               
                        </div>
                        <input type="text" id="address" class="form-control me-2 mt-2" placeholder="주소" readonly>
                        <input type="text" id="address_etc" class="form-control mt-2" placeholder="상세 주소 입력">
                </div>
                <button type="button" class="btn btn-danger w-100 mt-3 mb-20" onclick="showConfirmModal()">주문하기</button>
                <div class="mt-8">
                
</div>
                </form>

                <!-- Confirm Modal -->
                <div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmModalLabel" aria-hidden="true">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="confirmModalLabel">주문 확인</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <p id="confirmText">주문 내용을 확인하세요.</p>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">취소</button>
                                <button type="submit" class="btn btn-primary" onclick="submitOrder()">확인</button>
                            </div>
                        </div>
                    </div>
                </div>

            </form>
            `}

            <script>
            
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
                        console.log( "chk", input);
                        let quantity = parseInt(input.value) || 0;
                        let price = parseInt(input.dataset.price) || 0;
                        total += quantity * price;
                        console.log(total, price)
                    });
                    document.getElementById("totalAmount").innerText = "총 주문금액: ₩" + total.toLocaleString();
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
                });
            </script>
        </body>
        </html>
    `;
    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
};
