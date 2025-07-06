const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient({ region: 'ap-northeast-2' });

const EVENTS_TABLE = "EventsTable";

exports.handler = async (event) => {
    const eventKey = event.pathParameters.event_key;

    console.log("chk eventKey", eventKey)

    const now = new Date().toISOString();

    let eventInfo;
    try {
        const eventResult = await dynamoDb.query({
            TableName: EVENTS_TABLE,
            IndexName: "eventKey-index",
            KeyConditionExpression: "eventKey = :ek",
            ExpressionAttributeValues: {
                ":ek": eventKey
            }
        }).promise();

        eventInfo = eventResult.Items[0]?.eventsFullManage;

        if (!eventInfo) {
            return { statusCode: 404, body: "이벤트 정보를 찾을 수 없습니다." };
        }

        // 삭제된 이벤트 접근 차단
        if (eventInfo.status === 'DELETED') {
            return { 
                statusCode: 410, 
                body: "이 이벤트는 삭제되었습니다.\n관리자에게 문의하세요." 
            };
        }
    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: "이벤트 정보를 가져오는 중 오류 발생" };
    }

    const isExpired = now > eventInfo.endTime;
    let items = eventInfo.items;

    // 이벤트 데이터를 JSON으로 안전하게 직렬화
    const eventData = {
        eventId: eventInfo.eventId,
        eventKey: eventInfo.eventKey,
        title: eventInfo.title,
        description: eventInfo.description,
        startTime: eventInfo.startTime,
        endTime: eventInfo.endTime,
        payAccount: eventInfo.payAccount,
        payAccountOwner: eventInfo.payAccountOwner,
        isExpired: isExpired,
        items: items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            eventPrice: item.eventPrice,
            stock: item.stock,
            imageUrl: item.imageUrl,
            description: item.description
        }))
    };

    // HTML 템플릿 (정적 구조만 포함)
    const html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="MyOrder.Store" />
            <meta property="og:title" content="${eventInfo.title}" />
            <meta property="og:description" content="${eventInfo.description ? eventInfo.description.replace(/<[^>]*>/g, '') : ''}" />
            <meta property="og:image" content="${items?.[0]?.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image'}" />
            <meta property="og:image:alt" content="${items?.[0]?.productName || eventInfo.title}" />
            <meta property="og:url" content="https://myodr.store/${eventInfo.eventKey}" />
            <title>myOrder-${eventInfo.title}</title>
            <link rel="icon" href="/favicon.ico">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.8.0/font/bootstrap-icons.css">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR&display=swap" rel="stylesheet">
            <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
            <script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.11/dist/purify.min.js"></script>
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
            <h2 class="text-center mb-3" id="eventTitle"></h2>
            <div class="text-start mb-3" id="eventDescription"></div>
            <p class="text-center" id="eventPeriod"></p>

            <div id="orderLayer" style="display: none;">
                <form id="orderForm">
                    <!-- 상품주문 영역 복구 -->
                    <div id="productList">
                        <label class="" style="font-size:1.1em;"><i class="bi bi-gift"></i> 상품주문</label>
                        <div id="productsContainer"></div>
                    </div>
                    <div class="totalAmountLayer">
                        <i class="bi bi-cart3"></i> <span id="totalAmount">총 주문금액: 0원</span>
                    </div>                
                    
                    <!-- 주문자 정보 -->
                    <div class="mt-2">
                        <label class="fw-bold"><i class="bi bi-person-circle"></i> 주문자 정보</label>
                        <input type="text" class="form-control mt-2" id="buyerName" placeholder="주문자 이름" required>
                        <input type="tel" class="form-control mt-2" id="buyerPhone" placeholder="주문자 휴대폰 번호(숫자만 입력)" maxlength="13" required>
                    </div>
                    <!-- 받는사람 정보 -->
                    <div class="mt-3">
                        <div class="d-flex align-items-center justify-content-between">
                            <label class="fw-bold mb-0"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-person-fill-exclamation" viewBox="0 0 16 16">
  <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0m-9 8c0 1 1 1 1 1h5.256A4.5 4.5 0 0 1 8 12.5a4.5 4.5 0 0 1 1.544-3.393Q8.844 9.002 8 9c-5 0-6 3-6 4"/>
  <path d="M16 12.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0m-3.5-2a.5.5 0 0 0-.5.5v1.5a.5.5 0 0 0 1 0V11a.5.5 0 0 0-.5-.5m0 4a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/>
</svg> 받는사람 정보</label>
                            <div class="form-check ms-2" style="min-width:140px; text-align:right;">
                                <input class="form-check-input" style="float:none !important;" type="checkbox" id="sameAsBuyerCheck">
                                <label class="form-check-label" for="sameAsBuyerCheck">주문자와 동일</label>
                            </div>
                        </div>
                        <input type="text" class="form-control mt-2" id="receiverName" placeholder="받는사람 이름" required>
                        <input type="tel" class="form-control mt-2" id="receiverPhone" placeholder="받는사람 휴대폰 번호(숫자만 입력)" maxlength="13" required>
                    </div>
                    <!-- 배송지 주소 -->
                    <div class="mt-3">
                        <label class="fw-bold"><i class="bi bi-truck"></i> 배송지 주소</label>
                        <div class="d-flex">
                            <input type="text" id="postcode" class="form-control mt-2 me-2 bg-light" placeholder="우편번호를 검색하세요" readonly>
                            <button type="button" class="btn btn-warning w-100 mt-2" onclick="execDaumPostcode()">우편번호 검색</button>
                        </div>
                        <input type="text" id="address" class="form-control me-2 mt-2 bg-light" placeholder="우편번호를 검색하세요" readonly>
                        <input type="text" id="address_etc" class="form-control mt-2" placeholder="상세 주소 입력">
                    </div>
                    <div class="mt-4">
                        <div class="border border-warning rounded p-3 bg-warning bg-opacity-10">
                            <div class="d-flex align-items-center mb-2">
                                <i class="bi bi-credit-card-fill text-warning" style="font-size: 1.3rem;"></i>
                                <label class="fw-bold ms-2 mb-0" style="font-size: 1.1rem; color: #d63384;">💳 결제 정보 (중요!)</label>
                            </div>
                            <div class="alert alert-warning py-2 mb-3" style="font-size: 0.9rem;">
                                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                                <strong>계좌이체로 결제됩니다.</strong> 주문 후 아래 계좌로 입금해주세요.
                            </div>
                            <div class="bg-white border rounded p-3 mb-3">
                                <div class="row">
                                    <div class="col-4 text-end fw-bold">입금은행:</div>
                                    <div class="col-8" id="payAccountInfo">[입금은행 안내]</div>
                                </div>
                            </div>
                            <div class="bg-white border rounded p-3">
                                <label class="form-label fw-bold mb-2"><i class="bi bi-person-check-fill text-primary"></i> 입금자명</label>
                                <input type="text" class="form-control form-control-lg" id="payname" placeholder="입금자명을 정확히 입력하세요" style="font-size: 1.1rem;">
                                <div class="form-text text-danger mt-1">
                                    <i class="bi bi-info-circle"></i> 입금자명이 다르면 주문 확인이 지연될 수 있습니다.
                                </div>
                            </div>
                        </div>
                    </div>     
                    <div class="mt-2">
                        <label><i class="bi bi-info-circle"></i> 개인정보 수집 및 이용 동의</label>
                        <label class="row ms-2 mt-2" style="font-size: 0.9rem;">1. 수집목적 : 고객이 요청한 주문의 배송 및 고객관리</label>  
                        <label class="row ms-2" style="font-size: 0.9rem;">2. 수집항목 : 주문자이름, 휴대전화번호, 주소</label>
                        <label class="row ms-2" style="font-size: 0.9rem;">3. 보유 및 이용기간 : 주문완료일로부터 3년 </label>                                                                        
                    </div>
                    <div class="form-check mt-3 p-3 border rounded bg-light">
                        <input class="form-check-input" type="checkbox" value="" id="check_infop" style="transform: scale(1.5); margin-left:0px !important; margin-right: 12px;">
                        <label class="form-check-label fw-bold text-primary" for="check_infop" style="font-size: 1.1em; cursor: pointer;">
                            개인정보 수집 및 이용에 동의합니다.
                        </label>
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
            
            <!-- Error Modal -->
            <div class="modal fade" id="errorModal" tabindex="-1" aria-hidden="true">
              <div class="modal-dialog modal-sm modal-dialog-centered">
                <div class="modal-content">
                  <div class="modal-header bg-danger text-white py-2">
                    <h5 class="modal-title">입력 오류</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body text-center" id="errorModalBody">
                  </div>
                  <div class="modal-footer py-2 justify-content-center">
                    <button type="button" class="btn btn-danger btn-sm" data-bs-dismiss="modal">확인</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Order Complete Modal -->
            <div class="modal fade" id="orderCompleteModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                  <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">🎉 주문 완료</h5>                    
                  </div>
                  <div class="modal-body text-center">
                    <div class="mb-3">
                      <i class="bi bi-check-circle-fill text-success" style="font-size: 3rem;"></i>
                    </div>
                    <h6 class="mb-3">주문이 성공적으로 접수되었습니다!</h6>
                    <div class="alert alert-info mb-3">
                      <strong>주문번호:</strong> <span id="completedOrderNo" class="fw-bold text-primary"></span>
                    </div>
                    <p class="text-muted small mb-3">
                      <i class="bi bi-info-circle"></i> 
                      주문번호를 꼭 기억해주세요. 주문 조회 시 필요합니다.
                    </p>
                    <a id="viewOrderLink" class="btn btn-success btn-lg">
                      <i class="bi bi-eye"></i> 주문 내역 확인
                    </a>
                  </div>
                  <div class="modal-footer justify-content-center">
                    <small class="text-muted">
                      <i class="bi bi-shield-check"></i> 
                      안전한 주문이 완료되었습니다. 페이지를 새로고침하거나 닫으셔도 됩니다.
                    </small>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Product Detail Modal -->
            <div class="modal fade" id="productDetailModal" tabindex="-1" aria-hidden="true">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="productDetailTitle">상품 상세 정보</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body">
                    <div class="text-center mb-3">
                      <img id="productDetailImage" src="" alt="상품 이미지" class="img-fluid rounded" style="max-height: 300px;">
                    </div>
                    <h6 id="productDetailName" class="mb-2"></h6>
                    <p class="text-muted mb-2">가격: <span id="productDetailPrice"></span></p>
                    <div id="productDetailDescription" class="mt-3">
                    </div>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button>
                  </div>
                </div>
              </div>
            </div>

            <script>
                // 이벤트 데이터를 전역 변수로 설정
                const eventData = ${JSON.stringify(eventData)};
                
                function showErrorModal(message) {
                    document.getElementById("errorModalBody").innerText = message;
                    const modal = new bootstrap.Modal(document.getElementById("errorModal"));
                    modal.show();
                }
                
                function showProductDetailModal(imgElement) {
                    const productName = imgElement.dataset.productName;
                    const productPrice = parseInt(imgElement.dataset.productPrice);
                    const productDescription = decodeURIComponent(imgElement.dataset.productDescription || '');
                    const productImage = imgElement.dataset.productImage;
                    
                    document.getElementById("productDetailTitle").innerText = productName;
                    document.getElementById("productDetailName").innerText = productName;
                    document.getElementById("productDetailPrice").innerText = "₩" + productPrice.toLocaleString();
                    document.getElementById("productDetailImage").src = productImage;
                    document.getElementById("productDetailImage").alt = productName;
                    
                    const descriptionElement = document.getElementById("productDetailDescription");
                    if (productDescription && productDescription.trim()) {
                        const sanitizedDescription = sanitizeHTML(productDescription);
                        descriptionElement.innerHTML = "<strong>상품 설명:</strong><br>" + sanitizedDescription;
                    } else {
                        descriptionElement.innerHTML = "<em class='text-muted'>상품 설명이 없습니다.</em>";
                    }
                    
                    const modal = new bootstrap.Modal(document.getElementById("productDetailModal"));
                    modal.show();
                }
                
                // 한국어 날짜 형식 변환 함수
                function formatKoreanDateTime(isoString) {
                    if (!isoString) return '';
                    
                    const date = new Date(isoString);
                    if (isNaN(date.getTime())) return isoString; // 유효하지 않은 날짜인 경우 원본 반환
                    
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    
                    // 요일 배열
                    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                    const weekday = weekdays[date.getDay()];
                    
                    return year + '.' + month + '.' + day + ' (' + weekday + ') ' + hours + ':' + minutes;
                }
                
                // DOMPurify가 HTML 엔티티를 자동으로 처리하므로 별도 함수 불필요
                // function decodeHTMLEntities(text) {
                //     const textarea = document.createElement('textarea');
                //     textarea.innerHTML = text;
                //     return textarea.value;
                // }
                
                function sanitizeHTML(html) {
                    if (!html || typeof html !== 'string') return '';
                    
                    // DOMPurify를 사용한 안전한 HTML sanitization
                    const sanitized = DOMPurify.sanitize(html, {
                        ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img'],
                        ALLOWED_ATTR: ['style', 'class', 'id', 'src', 'alt', 'width', 'height', 'title', 'loading'],
                        ALLOW_DATA_ATTR: false,
                        KEEP_CONTENT: true,
                        RETURN_DOM: false,
                        RETURN_DOM_FRAGMENT: false,
                        RETURN_DOM_IMPORT: false,
                        RETURN_TRUSTED_TYPE: false,
                        // TinyMCE에서 생성된 HTML을 더 잘 처리하기 위한 추가 설정
                        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
                        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect', 'onunload', 'onresize', 'onabort', 'onbeforeunload', 'onerror', 'onhashchange', 'onmessage', 'onoffline', 'ononline', 'onpagehide', 'onpageshow', 'onpopstate', 'onstorage', 'oncontextmenu', 'oninput', 'oninvalid', 'onsearch']
                    });
                    
                    return sanitized;
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
                    document.getElementById("totalAmount").innerText = "총 주문금액: " + total.toLocaleString() + "원";
                }

                function renderEventPage() {
                    // 이벤트 제목 렌더링
                    document.getElementById("eventTitle").innerText = "이벤트 주문 (" + eventData.title + ")";
                    
                    // 이벤트 설명 렌더링
                    const eventDescriptionElement = document.getElementById("eventDescription");
                    if (eventData.description && eventData.description.trim()) {
                        const sanitizedDescription = sanitizeHTML(eventData.description);
                        eventDescriptionElement.innerHTML = sanitizedDescription;
                    } else {
                        eventDescriptionElement.innerHTML = "<em class='text-muted'>이벤트 설명이 없습니다.</em>";
                    }
                    
                    // 이벤트 기간 렌더링
                    const eventPeriodElement = document.getElementById("eventPeriod");
                    if (eventData.isExpired) {
                        eventPeriodElement.className = "text-center text-danger";
                        eventPeriodElement.innerText = "이벤트 종료됨";
                    } else {
                        eventPeriodElement.className = "text-center text-success";
                        const startDate = formatKoreanDateTime(eventData.startTime);
                        const endDate = formatKoreanDateTime(eventData.endTime);
                        eventPeriodElement.innerText = "이벤트 기간: " + startDate + " ~ " + endDate;
                    }
                    
                    // 결제 정보 렌더링
                    document.getElementById("payAccountInfo").innerHTML = "<strong>" + eventData.payAccount + "</strong><br><span class='text-muted'>예금주: " + eventData.payAccountOwner + "</span>";
                    
                    // 이벤트가 종료되지 않은 경우에만 주문 폼 표시
                    if (!eventData.isExpired) {
                        document.getElementById("orderLayer").style.display = "block";
                        renderProducts();

                        // 주문자와 동일 버튼 및 받는사람 입력란 이벤트 바인딩
                        setTimeout(() => {
                            const check = document.getElementById('sameAsBuyerCheck');
                            if (check) {
                                check.onchange = function() {
                                    const buyerName = document.getElementById('buyerName').value.trim();
                                    const buyerPhone = document.getElementById('buyerPhone').value.trim();
                                    if (this.checked) {
                                        if (!buyerName || !buyerPhone) {
                                            showErrorModal('주문자 정보를 먼저 입력하세요.');
                                            this.checked = false;
                                            return;
                                        }
                                        document.getElementById('receiverName').value = buyerName;
                                        document.getElementById('receiverPhone').value = buyerPhone;
                                        document.getElementById('receiverName').setAttribute('readonly', true);
                                        document.getElementById('receiverPhone').setAttribute('readonly', true);
                                        document.getElementById('receiverName').classList.add('bg-light');
                                        document.getElementById('receiverPhone').classList.add('bg-light');
                                    } else {
                                        document.getElementById('receiverName').removeAttribute('readonly');
                                        document.getElementById('receiverPhone').removeAttribute('readonly');
                                        document.getElementById('receiverName').classList.remove('bg-light');
                                        document.getElementById('receiverPhone').classList.remove('bg-light');
                                    }
                                };
                            }
                            ['receiverName', 'receiverPhone'].forEach(id => {
                                const el = document.getElementById(id);
                                if (el) {
                                    el.oninput = function() {
                                        document.getElementById('receiverName').removeAttribute('readonly');
                                        document.getElementById('receiverPhone').removeAttribute('readonly');
                                        if (check) check.checked = false;
                                    };
                                }
                            });
                        }, 100);
                    } else {
                        const expiredMessage = document.createElement("h3");
                        expiredMessage.className = "text-danger text-center";
                        expiredMessage.innerText = "이벤트가 종료되었습니다.";
                        document.getElementById("orderLayer").parentNode.insertBefore(expiredMessage, document.getElementById("orderLayer"));
                    }
                }
                
                function renderProducts() {
                    const productsContainer = document.getElementById("productsContainer");
                    productsContainer.innerHTML = "";
                    
                    eventData.items.forEach(item => {
                        const productDiv = document.createElement("div");
                        productDiv.className = "product border rounded-1 p-2";
                        
                        productDiv.innerHTML = \`
                            <div class="d-flex align-items-center">
                                <div class="me-3 text-center" style="min-width: 100px;">
                                    <img src="\${item.imageUrl}" alt="\${item.productName}" class="rounded-1 product-thumbnail mb-2" 
                                         data-product-name="\${item.productName}" 
                                         data-product-price="\${item.eventPrice}" 
                                         data-product-description="\${encodeURIComponent(item.description || '')}" 
                                         data-product-image="\${item.imageUrl}" 
                                         style="cursor: pointer; width: 100px; height: 100px; object-fit: cover;">
                                    <div class="product-detail-btn" 
                                         data-product-name="\${item.productName}" 
                                         data-product-price="\${item.eventPrice}" 
                                         data-product-description="\${encodeURIComponent(item.description || '')}" 
                                         data-product-image="\${item.imageUrl}" 
                                         style="cursor: pointer; font-size: 0.8rem; color: #007bff; text-decoration: underline;">
                                        📋 상세내용보기
                                    </div>
                                </div>
                                <div class="flex-grow-1">
                                    <strong class="toggle-details">\${item.productName}</strong>
                                    <p class="mb-1 text-muted">₩\${item.eventPrice.toLocaleString()}</p>
                                    \${item.stock === 0 ? '<p class="sold-out">품절</p>' : ''}
                                </div>
                            </div>
                            <div class="product-details mt-2">
                                <p>\${item.description || ''}</p>
                            </div>
                            <div class="quantity-controls">
                                \${item.stock > 0 ? \`
                                    <button type="button" class="btn btn-outline-secondary btn-sm minus" data-product="\${item.productId}"><span style="font-size: 1.2em">-</span></button>
                                    <input type="text" class="form-control bg-light text-center mx-2 quantity" style="width: 40px;" value="0" min="0" max="\${item.stock}" readonly data-price="\${item.eventPrice}" data-product="\${item.productId}">
                                    <button type="button" class="btn btn-outline-secondary btn-sm plus" data-product="\${item.productId}"><span style="font-size: 1.2em">+</span></button>
                                \` : ''}
                            </div>
                        \`;
                        
                        productsContainer.appendChild(productDiv);
                    });
                    
                    // 이벤트 리스너 추가
                    addEventListeners();
                }
                
                function addEventListeners() {
                    // 수량 조절 버튼 이벤트
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
                    
                    // 상품 썸네일 클릭 이벤트
                    document.querySelectorAll(".product-thumbnail").forEach(img => {
                        img.addEventListener("click", function() {
                            showProductDetailModal(this);
                        });
                    });
                    
                    // 상세내용보기 버튼 클릭 이벤트
                    document.querySelectorAll(".product-detail-btn").forEach(btn => {
                        btn.addEventListener("click", function() {
                            showProductDetailModal(this);
                        });
                    });
                    
                    // 전화번호 입력 이벤트
                    ["buyerPhone", "receiverPhone"].forEach(function(id) {
                        const phoneInput = document.getElementById(id);
                        if (phoneInput) {
                            phoneInput.addEventListener("input", function (e) {
                                let value = this.value.replace(/[^0-9]/g, "");
                                if (value.length > 11) value = value.slice(0, 11);

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
                        }
                    });
                }
                
                function showConfirmModal() {
                    const items = [];
                    let total = 0;
                    
                    document.querySelectorAll(".quantity").forEach(input => {
                        const quantity = parseInt(input.value) || 0;
                        const price = parseInt(input.dataset.price) || 0;
                        const productName = input.closest(".product").querySelector("strong").innerText;
                        if (quantity > 0) {
                            items.push({ productName, quantity, price });
                            total += quantity * price;
                        }
                    });
                    
                    const postcode = document.getElementById("postcode").value.trim();
                    const address = document.getElementById("address").value.trim();
                    const addressEtc = document.getElementById("address_etc").value.trim();
                    const buyerName = document.getElementById("buyerName").value.trim();
                    const buyerPhone = document.getElementById("buyerPhone").value.trim();
                    const receiverName = document.getElementById("receiverName").value.trim();
                    const receiverPhone = document.getElementById("receiverPhone").value.trim();
                    const payname = document.getElementById("payname").value.trim();
                    
                    if (items.length === 0) {
                        showErrorModal("주문할 상품을 1개 이상 선택해주세요.");
                        return;
                    }
                    
                    if (!postcode || !addressEtc || !buyerName || !buyerPhone) {
                        showErrorModal("배송지, 이름, 연락처를 모두 입력해주세요.");
                        return;
                    }
                    const phoneRegex = /^[0-9]{3}-[0-9]{4}-[0-9]{4}$/;
                    if (!phoneRegex.test(buyerPhone)) {
                      showErrorModal("전화번호는 000-0000-0000 형식으로 입력해주세요.");
                      return;
                    }
                    
                    if (!payname) {
                        showErrorModal("결제계좌 입금자명을 입력해주세요.");
                        return;
                    }
                    
                    const infop_checkbox = document.getElementById("check_infop");        
                    const infop = infop_checkbox.checked;
                    
                    if(!infop){
                        showErrorModal("개인정보 수집 및 이용에 동의 해 주세요.");
                        return;        
                    }
                    
                    let html = "<h6>주문 요약</h6><ul>";
                    items.forEach(item => {
                        html += "<li>" + item.productName + " x " + item.quantity + "개 - " + (item.quantity * item.price).toLocaleString() + "원</li>";
                    });
                    html += "</ul><p><strong>총 금액:</strong> " + total.toLocaleString() + "원</p>";

                    // 주문자/받는사람 정보 구분 표시
                    html += "<hr><div class='mb-2'><strong>주문자 정보</strong><br>이름: " + buyerName + "<br>연락처: " + buyerPhone + "</div>";
                    html += "<div class='mb-2'><strong>받는사람 정보</strong><br>이름: " + receiverName + "<br>연락처: " + receiverPhone + "</div>";
                    html += "<div class='mb-2'><strong>배송지</strong><br>[" + postcode + "] " + address + " " + addressEtc + "</div>";
                    
                    // 결제 정보를 더 명확하게 표시
                    html += "<hr><div class='alert alert-warning p-3 mb-2'>";
                    html += "<div class='d-flex align-items-center mb-2'><i class='bi bi-credit-card-fill text-warning me-2'></i><strong>결제 정보</strong></div>";
                    html += "<div class='mb-1'><strong>입금은행:</strong> " + eventData.payAccount + "</div>";
                    html += "<div class='mb-1'><strong>예금주:</strong> " + eventData.payAccountOwner + "</div>";
                    html += "<div class='mb-0'><strong>입금자명:</strong> <span class='text-danger'>" + payname + "</span></div>";
                    html += "</div>";
                    
                    document.getElementById("confirmText").innerHTML = html;
                    
                    const modal = new bootstrap.Modal(document.getElementById("confirmModal"));
                    modal.show();
                }
                
                async function submitOrder() {
                    const eventId = eventData.eventId;
                    const buyerName = document.getElementById("buyerName").value.trim();
                    const buyerPhone = document.getElementById("buyerPhone").value.trim();
                    const receiverName = document.getElementById("receiverName").value.trim();
                    const receiverPhone = document.getElementById("receiverPhone").value.trim();
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
                      buyerId: "guest",
                      buyerName,
                      buyerPhone,
                      receiverName,
                      receiverPhone,
                      payname,
                      postcode,
                      addressEtc,
                      address: "[" + postcode + "] " + address + " " + addressEtc,
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
                    
                          document.getElementById("completedOrderNo").innerText = orderNo;
                          document.getElementById("viewOrderLink").href = "/viewOrder/" + orderNo + "/" + orderId;
                    
                          document.getElementById("orderLayer").innerHTML="";
                          
                          // 기존 모달들을 모두 닫기
                          const existingModals = document.querySelectorAll('.modal');
                          existingModals.forEach(modalElement => {
                              const modalInstance = bootstrap.Modal.getInstance(modalElement);
                              if (modalInstance) {
                                  modalInstance.hide();
                              }
                          });
                          
                          // 잠시 대기 후 주문 완료 모달 표시
                          setTimeout(() => {
                              const modal = new bootstrap.Modal(document.getElementById("orderCompleteModal"));
                              modal.show();
                          }, 300);
                      } else {
                          const err = await res.json();
                          showErrorModal("주문 실패: " + err.message);
                      }
                    } catch (err) {
                      showErrorModal("네트워크 오류: " + err.message);
                    }
                }
                
                // 페이지 로드 시 이벤트 렌더링
                document.addEventListener("DOMContentLoaded", function() {
                    renderEventPage();
                });
            </script>
        </body>
        </html>
    `;
    
    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html };
};
